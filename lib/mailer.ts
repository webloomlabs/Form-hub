import nodemailer, { type Transporter } from "nodemailer";
import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/crypto";
import { describeError } from "@/lib/errors";

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
  /** Human-readable connection descriptor, attached to any failure. */
  descriptor: string;
};

/** Implicit TLS ("SMTPS"). The server expects a TLS handshake immediately. */
const IMPLICIT_TLS_PORT = 465;

/**
 * Decides whether to open the connection with TLS already established.
 *
 * Getting this wrong is the single most common SMTP misconfiguration, and it
 * fails with a uselessly generic "Unexpected socket close": on port 465 the
 * server waits for a TLS ClientHello, receives plaintext, and hangs up. Port
 * 465 therefore always implies `secure`, whatever was configured.
 */
function resolveSecure(port: number, configured: boolean | undefined): boolean {
  if (port === IMPLICIT_TLS_PORT) return true;
  return configured ?? false;
}

/** Loopback and container-local hostnames, where plaintext SMTP is expected. */
function isLocalHost(host: string): boolean {
  const h = host.toLowerCase();
  return (
    h === "localhost" ||
    h === "127.0.0.1" ||
    h === "::1" ||
    h === "mailpit" ||
    h.endsWith(".local") ||
    h.endsWith(".internal")
  );
}

function buildTransport(options: {
  host: string;
  port: number;
  secure?: boolean;
  user?: string;
  pass?: string;
}): { transporter: Transporter; descriptor: string } {
  const secure = resolveSecure(options.port, options.secure);
  const descriptor = `${options.host}:${options.port} (secure=${secure})`;

  // Refuse to send credentials over an unencrypted session — but only where
  // encryption is actually expected. Demanding STARTTLS unconditionally breaks
  // local dev (Mailpit answers "502 Command not implemented") and plain
  // internal relays, neither of which carries credentials over a network.
  const requireTLS =
    !secure && Boolean(options.user) && !isLocalHost(options.host);

  const transporter = nodemailer.createTransport({
    host: options.host,
    port: options.port,
    secure,
    requireTLS,
    auth: options.user ? { user: options.user, pass: options.pass ?? "" } : undefined,
    // Without these a blocked port hangs until the platform kills the whole
    // function, which burns the tick's budget and strands the job in
    // PROCESSING until the reaper collects it.
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
  });

  return { transporter, descriptor };
}

let platformTransport: { transporter: Transporter; descriptor: string } | null =
  null;

function getPlatformTransport(): { transporter: Transporter; descriptor: string } {
  if (platformTransport) return platformTransport;

  const host = process.env.SMTP_HOST;
  if (!host) throw new Error("SMTP_HOST is not set");

  const port = Number(process.env.SMTP_PORT ?? 587);
  if (!Number.isFinite(port) || port <= 0) {
    throw new Error(`SMTP_PORT is not a valid port: ${process.env.SMTP_PORT}`);
  }

  // Unset means "infer from the port" rather than "false".
  const configured =
    process.env.SMTP_SECURE === undefined || process.env.SMTP_SECURE === ""
      ? undefined
      : process.env.SMTP_SECURE === "true";

  platformTransport = buildTransport({
    host,
    port,
    secure: configured,
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
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
    const { transporter, descriptor } = buildTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      user: config.username,
      pass: decryptSecret(config.passwordEnc),
    });
    return {
      transporter,
      from: `"${config.fromName}" <${config.fromEmail}>`,
      source: "agency",
      descriptor: `agency ${descriptor}`,
    };
  }

  const { transporter, descriptor } = getPlatformTransport();
  return {
    transporter,
    from: process.env.SMTP_FROM ?? "FormHub <no-reply@localhost>",
    source: "platform",
    descriptor: `platform ${descriptor}`,
  };
}

export async function sendMail(
  agencyId: string,
  message: MailMessage,
  fromOverride?: string,
): Promise<{ messageId: string; source: string }> {
  const { transporter, from, source, descriptor } =
    await resolveTransport(agencyId);

  try {
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
  } catch (error) {
    // Naming the connection turns "Unexpected socket close" — which says
    // nothing about what to change — into something a human can act on.
    throw new Error(`${describeError(error)} [via ${descriptor}]`, {
      cause: error,
    });
  }
}

/** Verifies an agency's SMTP credentials without sending anything. */
export async function verifyAgencyTransport(agencyId: string): Promise<void> {
  const { transporter, descriptor } = await resolveTransport(agencyId);
  try {
    await transporter.verify();
  } catch (error) {
    throw new Error(`${describeError(error)} [via ${descriptor}]`, {
      cause: error,
    });
  }
}

/** Reset between tests and after env changes in long-lived processes. */
export function resetPlatformTransport(): void {
  platformTransport = null;
}
