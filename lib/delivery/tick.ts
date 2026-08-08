import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { describeError } from "@/lib/errors";
import type { DeliveryJob } from "@/app/generated/prisma/client";
import { nextRunAfter } from "./backoff";
import { deliverEmail } from "./email";
import { deliverWebhook } from "./webhook";
import { PermanentDeliveryError, type DeliverySubmission } from "./types";

/**
 * The delivery worker, as a plain function.
 *
 * Called by both /api/cron/deliver (Vercel) and worker/index.ts (Docker), so
 * moving off serverless is a deployment change rather than a rewrite.
 *
 * Concurrency safety comes from `FOR UPDATE SKIP LOCKED`: two ticks running at
 * once simply claim disjoint sets of jobs. No advisory lock, no overlap guard.
 */

export type TickResult = {
  claimed: number;
  succeeded: number;
  failed: number;
  dead: number;
  recovered: number;
};

/** A job stuck in PROCESSING for this long is assumed abandoned. */
const STUCK_AFTER_MS = 5 * 60 * 1000;

const workerId = `${process.env.VERCEL_REGION ?? "local"}-${crypto.randomBytes(4).toString("hex")}`;

/**
 * Returns PROCESSING jobs whose worker died mid-send (a killed serverless
 * function, a redeployed container) to PENDING. The attempt was already
 * counted, so a job cannot loop here forever.
 */
async function recoverStuckJobs(): Promise<number> {
  const cutoff = new Date(Date.now() - STUCK_AFTER_MS);
  const { count } = await prisma.deliveryJob.updateMany({
    where: { status: "PROCESSING", lockedAt: { lt: cutoff } },
    data: { status: "PENDING", lockedAt: null, lockedBy: null },
  });
  return count;
}

async function claimJobs(batchSize: number): Promise<DeliveryJob[]> {
  return prisma.$queryRaw<DeliveryJob[]>`
    UPDATE delivery_jobs
    SET status = 'PROCESSING',
        "lockedAt" = now(),
        "lockedBy" = ${workerId},
        attempts = attempts + 1,
        "updatedAt" = now()
    WHERE id IN (
      SELECT id FROM delivery_jobs
      WHERE status = 'PENDING' AND "runAfter" <= now()
      ORDER BY "runAfter" ASC
      LIMIT ${batchSize}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING *
  `;
}

async function loadSubmission(
  submissionId: string,
): Promise<DeliverySubmission | null> {
  return prisma.submission.findUnique({
    where: { id: submissionId },
    select: {
      id: true,
      data: true,
      subjectPreview: true,
      submitterEmail: true,
      origin: true,
      createdAt: true,
      form: { select: { id: true, name: true } },
      site: { select: { id: true, name: true } },
      files: {
        select: {
          id: true,
          fieldName: true,
          fileName: true,
          mimeType: true,
          sizeBytes: true,
          r2Key: true,
        },
      },
    },
  });
}

/**
 * The next number to show in the delivery log for this job.
 *
 * Not `job.attempts`: a manual resend deliberately resets that to zero to give
 * the job a fresh retry budget, which would restart the log at #1 and produce
 * duplicate, out-of-order entries. The log is a history, so it counts rows.
 */
async function nextAttemptNo(jobId: string): Promise<number> {
  const last = await prisma.deliveryAttempt.findFirst({
    where: { jobId },
    orderBy: { attemptNo: "desc" },
    select: { attemptNo: true },
  });
  return (last?.attemptNo ?? 0) + 1;
}

async function runJob(job: DeliveryJob): Promise<TickResult> {
  const result: TickResult = {
    claimed: 0,
    succeeded: 0,
    failed: 0,
    dead: 0,
    recovered: 0,
  };
  const startedAt = new Date();
  const attemptNo = await nextAttemptNo(job.id);
  let responseCode: number | null = null;

  try {
    const submission = await loadSubmission(job.submissionId);
    if (!submission) {
      // The submission was deleted while the job was queued.
      throw new PermanentDeliveryError("Submission no longer exists");
    }

    const ctx = { job, submission };
    if (job.kind === "EMAIL_ALERT") {
      await deliverEmail(ctx);
    } else {
      responseCode = await deliverWebhook(ctx);
    }

    await prisma.$transaction([
      prisma.deliveryAttempt.create({
        data: {
          jobId: job.id,
          attemptNo,
          status: "SUCCEEDED",
          startedAt,
          finishedAt: new Date(),
          responseCode,
        },
      }),
      prisma.deliveryJob.update({
        where: { id: job.id },
        data: {
          status: "SUCCEEDED",
          lockedAt: null,
          lockedBy: null,
          lastError: null,
        },
      }),
    ]);

    result.succeeded = 1;
    return result;
  } catch (error) {
    const message = describeError(error);
    const permanent = error instanceof PermanentDeliveryError;
    const exhausted = job.attempts >= job.maxAttempts;
    const dead = permanent || exhausted;

    await prisma.$transaction([
      prisma.deliveryAttempt.create({
        data: {
          jobId: job.id,
          attemptNo,
          status: "FAILED",
          startedAt,
          finishedAt: new Date(),
          error: message.slice(0, 2000),
          responseCode,
        },
      }),
      prisma.deliveryJob.update({
        where: { id: job.id },
        data: {
          status: dead ? "DEAD" : "PENDING",
          runAfter: dead ? job.runAfter : nextRunAfter(job.attempts),
          lockedAt: null,
          lockedBy: null,
          lastError: message.slice(0, 2000),
        },
      }),
    ]);

    if (dead) result.dead = 1;
    else result.failed = 1;
    return result;
  }
}

export async function runDeliveryTick(
  opts: { batchSize?: number; budgetMs?: number } = {},
): Promise<TickResult> {
  const batchSize = opts.batchSize ?? 25;
  const budgetMs = opts.budgetMs ?? 50_000;
  const deadline = Date.now() + budgetMs;

  const totals: TickResult = {
    claimed: 0,
    succeeded: 0,
    failed: 0,
    dead: 0,
    recovered: 0,
  };

  totals.recovered = await recoverStuckJobs();

  while (Date.now() < deadline) {
    const jobs = await claimJobs(batchSize);
    if (jobs.length === 0) break;
    totals.claimed += jobs.length;

    // Jobs within a batch are independent, so run them together.
    const results = await Promise.all(jobs.map((job) => runJob(job)));
    for (const r of results) {
      totals.succeeded += r.succeeded;
      totals.failed += r.failed;
      totals.dead += r.dead;
    }

    // A short batch means the queue is drained.
    if (jobs.length < batchSize) break;
  }

  return totals;
}

/**
 * Re-queues a dead or failed job. Used by the "Resend" button.
 * Returns false when the job doesn't belong to the agency — `updateMany`
 * rather than `update` so a forged job id is a silent no-op instead of a 500.
 */
export async function requeueJob(
  jobId: string,
  agencyId: string,
): Promise<boolean> {
  const { count } = await prisma.deliveryJob.updateMany({
    where: { id: jobId, agencyId },
    data: {
      status: "PENDING",
      attempts: 0,
      runAfter: new Date(),
      lockedAt: null,
      lockedBy: null,
      lastError: null,
    },
  });
  return count > 0;
}
