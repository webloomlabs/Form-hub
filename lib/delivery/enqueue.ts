import type { Prisma } from "@/app/generated/prisma/client";

/**
 * Job payloads snapshot their target at enqueue time. If an agency edits its
 * recipients or webhook URL a minute later, jobs already in flight still do
 * what they were created to do — the alternative is a job silently changing
 * meaning between attempt 1 and attempt 5.
 */

export type EmailJobPayload = {
  to: string[];
  cc: string[];
  bcc: string[];
};

export type WebhookJobPayload = {
  endpointId: string;
  url: string;
};

type Recipient = { email: string; kind: "TO" | "CC" | "BCC" };
type Webhook = { id: string; url: string };

export async function enqueueSubmissionJobs(
  tx: Prisma.TransactionClient,
  args: {
    submissionId: string;
    agencyId: string;
    recipients: Recipient[];
    webhooks: Webhook[];
  },
): Promise<void> {
  const jobs: Prisma.DeliveryJobCreateManyInput[] = [];

  const to = args.recipients.filter((r) => r.kind === "TO").map((r) => r.email);
  const cc = args.recipients.filter((r) => r.kind === "CC").map((r) => r.email);
  const bcc = args.recipients.filter((r) => r.kind === "BCC").map((r) => r.email);

  // No recipients means no email job — not an empty one that fails six times.
  if (to.length > 0 || cc.length > 0 || bcc.length > 0) {
    const payload: EmailJobPayload = { to, cc, bcc };
    jobs.push({
      agencyId: args.agencyId,
      submissionId: args.submissionId,
      kind: "EMAIL_ALERT",
      payload: payload as unknown as Prisma.InputJsonValue,
    });
  }

  for (const hook of args.webhooks) {
    const payload: WebhookJobPayload = { endpointId: hook.id, url: hook.url };
    jobs.push({
      agencyId: args.agencyId,
      submissionId: args.submissionId,
      kind: "WEBHOOK_FORWARD",
      payload: payload as unknown as Prisma.InputJsonValue,
    });
  }

  if (jobs.length > 0) {
    await tx.deliveryJob.createMany({ data: jobs });
  }
}
