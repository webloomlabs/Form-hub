import { prisma } from "@/lib/prisma";
import { decryptSecret, hmacSha256Hex } from "@/lib/crypto";
import type { WebhookJobPayload } from "./enqueue";
import { PermanentDeliveryError, type DeliveryContext } from "./types";

/**
 * Relays a submission to the agency's own URL (Slack, a CRM, Zapier).
 * Signed so the receiver can verify it really came from FormHub, with the
 * timestamp inside the signed material to prevent replay.
 */
export async function deliverWebhook(ctx: DeliveryContext): Promise<number> {
  const payload = ctx.job.payload as unknown as WebhookJobPayload;

  const endpoint = await prisma.webhookEndpoint.findUnique({
    where: { id: payload.endpointId },
  });
  if (!endpoint || !endpoint.enabled) {
    throw new PermanentDeliveryError("Webhook endpoint no longer exists");
  }

  const body = JSON.stringify({
    id: ctx.submission.id,
    form: { id: ctx.submission.form.id, name: ctx.submission.form.name },
    site: { id: ctx.submission.site.id, name: ctx.submission.site.name },
    data: ctx.submission.data,
    submitterEmail: ctx.submission.submitterEmail,
    createdAt: ctx.submission.createdAt.toISOString(),
    files: ctx.submission.files.map((f) => ({
      fieldName: f.fieldName,
      fileName: f.fileName,
      mimeType: f.mimeType,
      sizeBytes: f.sizeBytes,
    })),
  });

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = hmacSha256Hex(
    decryptSecret(endpoint.secretEnc),
    `${timestamp}.${body}`,
  );

  const res = await fetch(endpoint.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "FormHub/1.0",
      "X-FormHub-Timestamp": timestamp,
      "X-FormHub-Signature": `sha256=${signature}`,
      "X-FormHub-Submission-Id": ctx.submission.id,
    },
    body,
    signal: AbortSignal.timeout(15_000),
  });

  // 4xx (other than 408/429) means the receiver rejected the request itself —
  // replaying it unchanged will fail identically, so don't waste five retries.
  if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) {
    throw new PermanentDeliveryError(
      `Endpoint returned ${res.status} ${res.statusText}`,
    );
  }
  if (!res.ok) {
    throw new Error(`Endpoint returned ${res.status} ${res.statusText}`);
  }

  return res.status;
}
