import nodemailer, { type Transporter } from "nodemailer";
import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/crypto";

/**
 * Outbound email.
 *
 * SECURITY: nodemailer's message-level `raw`, `path` and `href` options can
 * read local files and fetch arbitrary URLs (GHSA-p6gq-j5cr-w38f, no fix
 * available at time of writing). Nothing in this file passes them, and no
 * user- or agency-supplied value may ever reach them. Attachments are sent as
 * presigned links in the body, never as `path`/`href` references.
 */

export type MailMessage = {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  text: string;
  html: string;
  replyTo?: string | null;
};

export type ResolvedTransport = {
  transporter: Transporter;
  from: string;
  source: "agency" | "platform";
};

let platformTransport: Transporter | null = null;

function getPlatformTransport(): Transporter {
  if (platformTransport) return platformTransport;
  const host = process.env.SMTP_HOST;
  if (!host) throw new Error("SMTP_HOST is not set");
  platformTransport = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS ?? "" }
      : undefined,
  });
  return platformTransport;
}

/**
 * Per-agency SMTP when configured, else the platform transport.
 * Agency transports are built per call rather than cached: credentials change,
 * and the volume here does not justify a cache with an invalidation problem.
 */
export async function resolveTransport(
  agencyId: string,
): Promise<ResolvedTransport> {
  const config = await prisma.agencySmtpConfig.findUnique({
    where: { agencyId },
  });

  if (config) {
    const transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: { user: config.username, pass: decryptSecret(config.passwordEnc) },
    });
    return {
      transporter,
      from: `"${config.fromName}" <${config.fromEmail}>`,
      source: "agency",
    };
  }

  return {
    transporter: getPlatformTransport(),
    from: process.env.SMTP_FROM ?? "FormHub <no-reply@localhost>",
    source: "platform",
  };
}

export async function sendMail(
  agencyId: string,
  message: MailMessage,
  fromOverride?: string,
): Promise<{ messageId: string; source: string }> {
  const { transporter, from, source } = await resolveTransport(agencyId);
  const info = await transporter.sendMail({
    from: fromOverride ?? from,
    to: message.to,
    cc: message.cc?.length ? message.cc : undefined,
    bcc: message.bcc?.length ? message.bcc : undefined,
    replyTo: message.replyTo ?? undefined,
    subject: message.subject,
    text: message.text,
    html: message.html,
  });
  return { messageId: info.messageId, source };
}

/** Verifies an agency's SMTP credentials without sending anything. */
export async function verifyAgencyTransport(agencyId: string): Promise<void> {
  const { transporter } = await resolveTransport(agencyId);
  await transporter.verify();
}
