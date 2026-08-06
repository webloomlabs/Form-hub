"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAgency } from "@/lib/guards";
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
    data: { status, readAt: status === "READ" ? new Date() : undefined },
  });

  revalidatePath("/agency/submissions");
  revalidatePath(`/agency/submissions/${id}`);
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
