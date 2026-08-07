import path from "node:path";
import crypto from "node:crypto";
import dotenv from "dotenv";

dotenv.config({ path: path.join(process.cwd(), ".env.local"), override: true });

/**
 * Exercises every authentication path on /api/cron/deliver, including a
 * genuinely QStash-signed request built with the same JWT scheme QStash uses
 * (HS256 over a body hash), so the Receiver verification is proven rather than
 * assumed.
 */

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:3100";
const URL_PATH = "/api/cron/deliver";

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

/** Mirrors QStash's signature: a JWT whose `body` claim is sha256(body). */
function signQstash(signingKey: string, body: string, url: string): string {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const now = Math.floor(Date.now() / 1000);
  const payload = b64url(
    JSON.stringify({
      iss: "Upstash",
      sub: url,
      exp: now + 300,
      nbf: now - 5,
      iat: now,
      jti: crypto.randomUUID(),
      body: crypto.createHash("sha256").update(body).digest("base64url"),
    }),
  );
  const signature = crypto
    .createHmac("sha256", signingKey)
    .update(`${header}.${payload}`)
    .digest("base64url");
  return `${header}.${payload}.${signature}`;
}

async function call(
  label: string,
  headers: Record<string, string>,
  expected: number,
  body = "",
  method = "POST",
): Promise<boolean> {
  const res = await fetch(`${BASE}${URL_PATH}`, {
    method,
    headers,
    body: method === "GET" ? undefined : body,
  });
  const ok = res.status === expected;
  console.log(
    `  ${ok ? "PASS" : "FAIL"}  ${label} → ${res.status}${ok ? "" : ` (expected ${expected})`}`,
  );
  return ok;
}

async function main() {
  const secret = process.env.CRON_SECRET!;
  const signingKey = process.env.QSTASH_CURRENT_SIGNING_KEY!;
  if (!secret || !signingKey) {
    throw new Error("CRON_SECRET and QSTASH_CURRENT_SIGNING_KEY must be set");
  }

  const url = `${BASE}${URL_PATH}`;
  const body = JSON.stringify({ trigger: "schedule" });
  const results: boolean[] = [];

  console.log("\nBearer (any scheduler / manual):");
  results.push(await call("no auth at all", {}, 401));
  results.push(
    await call("wrong secret", { authorization: "Bearer nope-nope-nope" }, 401),
  );
  results.push(
    await call("correct secret", { authorization: `Bearer ${secret}` }, 200, "", "GET"),
  );

  console.log("\nQStash signature:");
  results.push(
    await call(
      "valid signature",
      {
        "upstash-signature": signQstash(signingKey, body, url),
        "content-type": "application/json",
      },
      200,
      body,
    ),
  );
  results.push(
    await call(
      "signature from the wrong key",
      {
        "upstash-signature": signQstash("an-attackers-key", body, url),
        "content-type": "application/json",
      },
      401,
      body,
    ),
  );
  results.push(
    await call(
      "valid signature but tampered body",
      {
        "upstash-signature": signQstash(signingKey, body, url),
        "content-type": "application/json",
      },
      401,
      JSON.stringify({ trigger: "tampered" }),
    ),
  );
  results.push(
    await call(
      "garbage signature",
      { "upstash-signature": "not.a.jwt" },
      401,
      body,
    ),
  );

  const failed = results.filter((r) => !r).length;
  console.log(
    `\n${results.length - failed} passed, ${failed} failed\n`,
  );
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
