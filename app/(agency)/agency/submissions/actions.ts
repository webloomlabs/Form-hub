"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAgency } from "@/lib/guards";
import { deleteFile, isR2Configured } from "@/lib/r2";
import { describeError } from "@/lib/errors";
import { requeueJob } from "@/lib/delivery/tick";
import type { SubmissionStatus } from "@/app/generated/prisma/enums";

const ALLOWED: SubmissionStatus[] = ["NEW", "READ", "ARCHIVED", "SPAM"];

export async function setSubmissionStatus(formData: FormData): Promise<void> {
  const { agencyId } = await requireAgency();
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "") as SubmissionStatus;
  if (!ALLOWED.includes(status)) return;

  await prisma.submission.updateMany({
    where: { id, agencyId },
    data: {
      status,
      // Clear the read timestamp when going back to unread, so "NEW" isn't
      // carrying a stale readAt.
      readAt:
        status === "READ" ? new Date() : status === "NEW" ? null : undefined,
    },
  });

  revalidatePath("/agency/submissions");
  revalidatePath(`/agency/submissions/${id}`);

  // Opening the detail page marks a submission read, so staying here would
  // undo this immediately. Go back to the list, as an email client would.
  if (status === "NEW") redirect("/agency/submissions");
}

/** Marks a submission read on first open, without clobbering archive/spam. */
export async function markRead(id: string, agencyId: string): Promise<void> {
  await prisma.submission.updateMany({
    where: { id, agencyId, status: "NEW" },
    data: { status: "READ", readAt: new Date() },
  });
}

export async function resendDelivery(formData: FormData): Promise<void> {
  const { agencyId } = await requireAgency();
  const jobId = String(formData.get("jobId") ?? "");
  const submissionId = String(formData.get("submissionId") ?? "");

  // requeueJob scopes by agencyId, so a job id from another tenant no-ops.
  await requeueJob(jobId, agencyId);

  revalidatePath(`/agency/submissions/${submissionId}`);
  revalidatePath("/agency/deliveries");
}

/**
 * Permanently deletes a submission.
 *
 * Agency users only. `requireAgency()` throws for the CLIENT role, so a
 * website owner cannot invoke this even though server actions are reachable by
 * id from any signed-in session — the guard, not the absence of a button, is
 * what enforces it.
 *
 * The row goes first: SubmissionFile, DeliveryJob and DeliveryAttempt all
 * cascade from it. R2 objects are removed afterwards, and a failure there is
 * logged rather than thrown — an orphaned object wastes storage, whereas
 * failing after the row is gone would leave the caller staring at an error for
 * work that actually succeeded.
 */
export async function deleteSubmission(formData: FormData): Promise<void> {
  const { agencyId } = await requireAgency();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  // Read the keys before deleting — the rows are gone immediately after.
  const submission = await prisma.submission.findFirst({
    where: { id, agencyId },
    select: { id: true, files: { select: { r2Key: true } } },
  });
  if (!submission) {
    // Wrong tenant or already deleted. Treat as done rather than erroring.
    redirect("/agency/submissions");
  }

  // deleteMany with the tenant id in the where: a forged id is a no-op, not a 500.
  const { count } = await prisma.submission.deleteMany({
    where: { id, agencyId },
  });

  if (count > 0 && isR2Configured()) {
    for (const file of submission.files) {
      try {
        await deleteFile(file.r2Key);
      } catch (error) {
        console.error(
          `[submissions] deleted ${id} but its file ${file.r2Key} remains in R2:`,
          describeError(error),
        );
      }
    }
  }

  revalidatePath("/agency/submissions");
  revalidatePath("/agency/deliveries");
  revalidatePath("/agency");
  redirect("/agency/submissions");
}
