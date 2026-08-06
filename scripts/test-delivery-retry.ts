import path from "node:path";
import dotenv from "dotenv";

dotenv.config({ path: path.join(process.cwd(), ".env.local"), override: true });
// Point SMTP at a closed port so every send fails.
process.env.SMTP_HOST = "127.0.0.1";
process.env.SMTP_PORT = "9";
process.env.SMTP_USER = "";

async function main() {
  const { prisma } = await import("../lib/prisma");
  const { runDeliveryTick } = await import("../lib/delivery/tick");

  const form = await prisma.form.findFirst({ include: { recipients: true } });
  if (!form) throw new Error("no form seeded");

  // A fresh submission with an email job attached.
  const submission = await prisma.submission.create({
    data: {
      agencyId: form.agencyId,
      formId: form.id,
      siteId: form.siteId,
      data: { name: "Retry Test", message: "this send will fail" },
      subjectPreview: "this send will fail",
      status: "NEW",
      dedupeKey: `retry-test-${Date.now()}`,
    },
  });

  const job = await prisma.deliveryJob.create({
    data: {
      agencyId: form.agencyId,
      submissionId: submission.id,
      kind: "EMAIL_ALERT",
      payload: { to: ["owner@acme.test"], cc: [], bcc: [] },
    },
  });

  console.log(`job ${job.id} created (maxAttempts=${job.maxAttempts})\n`);
  console.log("tick | status   | attempts | next retry in | last error");
  console.log("-----+----------+----------+---------------+-----------------------------");

  for (let i = 1; i <= 7; i += 1) {
    await runDeliveryTick({ batchSize: 5, budgetMs: 8000 });
    const j = await prisma.deliveryJob.findUniqueOrThrow({ where: { id: job.id } });
    const waitSec = Math.round((j.runAfter.getTime() - Date.now()) / 1000);
    console.log(
      `  ${i}  | ${j.status.padEnd(8)} | ${String(j.attempts).padEnd(8)} | ${
        j.status === "DEAD" ? "     —      " : `${String(waitSec).padStart(6)}s     `
      } | ${(j.lastError ?? "").slice(0, 40)}`,
    );

    if (j.status === "DEAD") {
      console.log("\n>> dead-lettered after exhausting retries");
      break;
    }
    // Simulate the backoff elapsing so the test doesn't take 6 hours.
    await prisma.deliveryJob.update({
      where: { id: job.id },
      data: { runAfter: new Date() },
    });
  }

  const attempts = await prisma.deliveryAttempt.findMany({
    where: { jobId: job.id },
    orderBy: { attemptNo: "asc" },
  });
  console.log(`\ndelivery log has ${attempts.length} attempt rows:`);
  for (const a of attempts) {
    console.log(`  #${a.attemptNo} ${a.status} — ${(a.error ?? "").slice(0, 50)}`);
  }

  // ── Reaper: a job abandoned mid-PROCESSING must come back ──
  // runAfter is pushed into the future so the same tick cannot immediately
  // re-claim it — this isolates the recovery step from normal processing.
  await prisma.deliveryJob.update({
    where: { id: job.id },
    data: {
      status: "PROCESSING",
      attempts: 1,
      runAfter: new Date(Date.now() + 60 * 60 * 1000),
      lockedAt: new Date(Date.now() - 10 * 60 * 1000),
      lockedBy: "dead-worker",
    },
  });
  await runDeliveryTick({ batchSize: 5, budgetMs: 5000 });
  const reaped = await prisma.deliveryJob.findUniqueOrThrow({ where: { id: job.id } });
  const ok = reaped.status === "PENDING" && reaped.lockedBy === null;
  console.log(
    `\nreaper: abandoned PROCESSING job -> ${reaped.status} (lockedBy=${reaped.lockedBy ?? "null"}) ${ok ? "PASS" : "FAIL"}`,
  );

  // A job still within the stuck window must NOT be disturbed.
  await prisma.deliveryJob.update({
    where: { id: job.id },
    data: {
      status: "PROCESSING",
      lockedAt: new Date(Date.now() - 10 * 1000),
      lockedBy: "live-worker",
    },
  });
  await runDeliveryTick({ batchSize: 5, budgetMs: 5000 });
  const live = await prisma.deliveryJob.findUniqueOrThrow({ where: { id: job.id } });
  console.log(
    `reaper: in-flight job left alone -> ${live.status} (lockedBy=${live.lockedBy ?? "null"}) ${
      live.status === "PROCESSING" && live.lockedBy === "live-worker" ? "PASS" : "FAIL"
    }`,
  );

  await prisma.deliveryJob.delete({ where: { id: job.id } });
  await prisma.submission.delete({ where: { id: submission.id } });
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
