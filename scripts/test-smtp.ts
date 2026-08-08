import path from "node:path";
import net from "node:net";
import dotenv from "dotenv";
import nodemailer from "nodemailer";
import { describeError } from "../lib/errors";

dotenv.config({ path: path.join(process.cwd(), ".env.local"), override: false });

/**
 * Diagnoses the platform SMTP settings without going near the database or the
 * delivery queue.
 *
 *   npx tsx scripts/test-smtp.ts
 *   npx tsx scripts/test-smtp.ts --send you@example.com
 *
 * Tries the configured combination first, then every other plausible
 * port/TLS pairing, so the output says which one actually works rather than
 * only that the current one doesn't.
 */

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

/** A TCP connect, to separate "port is blocked" from "TLS/auth is wrong". */
function probeTcp(host: string, port: number, timeoutMs = 8000): Promise<string> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const done = (msg: string) => {
      socket.destroy();
      resolve(msg);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => done("open"));
    socket.once("timeout", () => done("timed out (likely blocked)"));
    socket.once("error", (e) => done(`refused (${(e as Error).message})`));
    socket.connect(port, host);
  });
}

async function tryCombination(
  host: string,
  port: number,
  secure: boolean,
  user?: string,
  pass?: string,
): Promise<{ ok: boolean; detail: string }> {
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    requireTLS: !secure,
    auth: user ? { user, pass: pass ?? "" } : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });
  try {
    await transporter.verify();
    return { ok: true, detail: "verified" };
  } catch (error) {
    return { ok: false, detail: describeError(error) };
  } finally {
    transporter.close();
  }
}

async function main() {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const configuredPort = Number(process.env.SMTP_PORT ?? 587);
  const configuredSecure = process.env.SMTP_SECURE === "true";

  if (!host) throw new Error("SMTP_HOST is not set");

  console.log("\nConfigured:");
  console.table([
    {
      SMTP_HOST: host,
      SMTP_PORT: process.env.SMTP_PORT ?? "(unset → 587)",
      SMTP_SECURE: process.env.SMTP_SECURE ?? "(unset)",
      SMTP_USER: user ?? "(unset — no auth)",
      SMTP_PASS: pass ? `set, ${pass.length} chars` : "(unset)",
      SMTP_FROM: process.env.SMTP_FROM ?? "(unset)",
    },
  ]);

  console.log("Port reachability:");
  for (const port of [...new Set([configuredPort, 587, 465, 25, 2525])]) {
    console.log(`  ${String(port).padEnd(5)} ${await probeTcp(host, port)}`);
  }

  console.log("\nAuthentication:");
  const combos = [
    { port: configuredPort, secure: configuredSecure, label: "as configured" },
    { port: 465, secure: true, label: "implicit TLS" },
    { port: 587, secure: false, label: "STARTTLS" },
    { port: 2525, secure: false, label: "STARTTLS (alt)" },
  ];

  const working: string[] = [];
  for (const combo of combos) {
    const { ok, detail } = await tryCombination(
      host,
      combo.port,
      combo.secure,
      user,
      pass,
    );
    const name = `port ${combo.port}, secure=${combo.secure} (${combo.label})`;
    console.log(`  ${ok ? "WORKS " : "fails "} ${name}\n           ${detail}`);
    if (ok) working.push(`SMTP_PORT=${combo.port}  SMTP_SECURE=${combo.secure}`);
  }

  if (working.length === 0) {
    console.log(
      "\nNothing worked. If every port timed out, the host or network is blocking\n" +
        "outbound SMTP. If ports are open but auth fails, check the username and\n" +
        "password — many providers require an app-specific password.\n",
    );
    process.exit(1);
  }

  console.log(`\nUse:\n  ${working[0]}\n`);

  const to = arg("send");
  if (to) {
    const [portStr, secureStr] = working[0]!.match(/=(\d+).*=(\w+)/)!.slice(1);
    const transporter = nodemailer.createTransport({
      host,
      port: Number(portStr),
      secure: secureStr === "true",
      auth: user ? { user, pass: pass ?? "" } : undefined,
    });
    const info = await transporter.sendMail({
      from: process.env.SMTP_FROM ?? `FormHub <${user}>`,
      to,
      subject: "FormHub SMTP test",
      text: "If you are reading this, FormHub can send mail.",
    });
    console.log(`Test email sent to ${to} (${info.messageId})\n`);
  }
}

main().catch((error) => {
  console.error(`\n${describeError(error)}\n`);
  process.exit(1);
});
