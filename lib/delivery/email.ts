import { sendMail } from "@/lib/mailer";
import { signedFileUrl } from "@/lib/r2";
import type { EmailJobPayload } from "./enqueue";
import type { DeliveryContext } from "./types";

/** Minimal HTML escaping — submission data is attacker-controlled text. */
function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function displayValue(value: unknown): string {
  if (Array.isArray(value)) return value.join(", ");
  return String(value ?? "");
}

function row(label: string, value: string): string {
  return `<tr>
  <td style="padding:8px 12px;border-bottom:1px solid #e5e5e5;vertical-align:top;font-weight:600;white-space:nowrap">${esc(label)}</td>
  <td style="padding:8px 12px;border-bottom:1px solid #e5e5e5;vertical-align:top;white-space:pre-wrap">${esc(value)}</td>
</tr>`;
}

function wrapper(title: string, body: string): string {
  return `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f5f5f5;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#171717">
  <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e5e5e5;border-radius:8px;overflow:hidden">
    <div style="padding:16px 20px;border-bottom:1px solid #e5e5e5">
      <h1 style="margin:0;font-size:16px">${esc(title)}</h1>
    </div>
    ${body}
  </div>
</body></html>`;
}

export async function deliverEmail(ctx: DeliveryContext): Promise<void> {
  const payload = ctx.job.payload as unknown as EmailJobPayload;
  const { submission } = ctx;
  const data = submission.data as Record<string, unknown>;

  const siteName = submission.site.name;
  const formName = submission.form.name;
  const subject = submission.subjectPreview
    ? `[${siteName}] ${submission.subjectPreview.slice(0, 80)}`
    : `[${siteName}] New ${formName} submission`;

  const rows = Object.entries(data)
    .map(([key, value]) => row(key, displayValue(value)))
    .join("\n");

  // Attachments travel as short-lived signed links, never as nodemailer
  // `path`/`href` attachments.
  const fileLinks = await Promise.all(
    submission.files.map(async (file) => {
      const url = await signedFileUrl(file.r2Key, 86400);
      return { name: file.fileName, size: file.sizeBytes, url };
    }),
  );

  const filesHtml =
    fileLinks.length > 0
      ? `<div style="padding:12px 20px;border-top:1px solid #e5e5e5">
           <p style="margin:0 0 8px;font-weight:600">Attachments</p>
           <ul style="margin:0;padding-left:20px">
             ${fileLinks
               .map(
                 (f) =>
                   `<li><a href="${esc(f.url)}">${esc(f.name)}</a> (${Math.ceil(f.size / 1024)} KB) — link valid 24 hours</li>`,
               )
               .join("")}
           </ul>
         </div>`
      : "";

  const metaHtml = `<div style="padding:12px 20px;border-top:1px solid #e5e5e5;font-size:12px;color:#737373">
      <div>Form: ${esc(formName)} · Site: ${esc(siteName)}</div>
      <div>Received: ${submission.createdAt.toISOString()}</div>
      ${submission.origin ? `<div>Origin: ${esc(submission.origin)}</div>` : ""}
    </div>`;

  const html = wrapper(
    `New submission from ${siteName}`,
    `<table style="width:100%;border-collapse:collapse;font-size:14px">${rows}</table>${filesHtml}${metaHtml}`,
  );

  const text = [
    `New submission from ${siteName} (${formName})`,
    "",
    ...Object.entries(data).map(([k, v]) => `${k}: ${displayValue(v)}`),
    "",
    ...fileLinks.map((f) => `Attachment: ${f.name} — ${f.url}`),
    "",
    `Received: ${submission.createdAt.toISOString()}`,
  ].join("\n");

  await sendMail(ctx.job.agencyId, {
    to: payload.to,
    cc: payload.cc,
    bcc: payload.bcc,
    subject,
    text,
    html,
    // Replying goes straight to whoever filled the form in.
    replyTo: submission.submitterEmail,
  });
}
