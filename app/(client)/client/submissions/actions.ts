"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireClient } from "@/lib/guards";
import type { SubmissionStatus } from "@/app/generated/prisma/enums";

const ALLOWED: SubmissionStatus[] = ["READ", "ARCHIVED", "SPAM"];

/**
 * Website owners can triage their own inbox but cannot resend deliveries —
 * that touches the agency's mail configuration.
 */
export async function setClientSubmissionStatus(
  formData: FormData,
): Promise<void> {
  const { agencyId, clientId } = await requireClient();
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "") as SubmissionStatus;
  if (!ALLOWED.includes(status)) return;

  await prisma.submission.updateMany({
    // site.clientId is what keeps one client out of another's submissions.
    where: { id, agencyId, site: { clientId } },
    data: { status, readAt: status === "READ" ? new Date() : undefined },
  });

  revalidatePath("/client");
  revalidatePath(`/client/submissions/${id}`);
}

export async function markClientRead(
  id: string,
  agencyId: string,
  clientId: string,
): Promise<void> {
  await prisma.submission.updateMany({
    where: { id, agencyId, site: { clientId }, status: "NEW" },
    data: { status: "READ", readAt: new Date() },
  });
}
