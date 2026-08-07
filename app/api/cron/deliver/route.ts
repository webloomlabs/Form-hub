import { Receiver } from "@upstash/qstash";
import { safeEqual } from "@/lib/crypto";
import { describeError } from "@/lib/errors";
import { runDeliveryTick } from "@/lib/delivery/tick";
import { sweepRateLimits } from "@/lib/ratelimit";

/**
 * Scheduler entry point for draining the delivery queue.
 *
 * Vercel Cron is deliberately NOT used: the Hobby plan caps cron at one
 * invocation per day, which is useless for retrying alerts. An external
 * scheduler drives this endpoint instead — Upstash QStash by default.
 *
 * The same work is done by worker/index.ts in a Docker deployment; both are
 * thin wrappers around runDeliveryTick().
 *
 * Two accepted forms of authentication:
 *   1. `Upstash-Signature` — verified against the QStash signing keys.
 *   2. `Authorization: Bearer <CRON_SECRET>` — for any other scheduler
 *      (GitHub Actions, cron-job.org, a VPS crontab) and for manual runs.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// 60s is the ceiling on Vercel's Hobby plan, so stay within it on every plan.
export const maxDuration = 60;

function bearerAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : header;
  if (!token) return false;
  return safeEqual(token, secret);
}

async function qstashAuthorized(
  request: Request,
  rawBody: string,
): Promise<boolean> {
  const signature = request.headers.get("upstash-signature");
  const currentSigningKey = process.env.QSTASH_CURRENT_SIGNING_KEY;
  if (!signature || !currentSigningKey) return false;

  const receiver = new Receiver({
    currentSigningKey,
    nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY,
  });

  try {
    // `url` is intentionally omitted. Behind Vercel's proxy `request.url` is
    // not always byte-identical to the URL QStash signed (protocol and host
    // get rewritten), which would reject valid deliveries. The signature still
    // proves the request came from QStash, and the body hash binds the payload.
    return await receiver.verify({
      signature,
      body: rawBody,
      // Allowance for clock drift between QStash and the function.
      clockTolerance: 60,
    });
  } catch {
    // Receiver throws SignatureError rather than returning false.
    return false;
  }
}

async function handle(request: Request) {
  // The body must be read once and reused: QStash signs it, and consuming the
  // stream twice would throw.
  const rawBody =
    request.method === "GET" ? "" : await request.text().catch(() => "");

  const authorized =
    (await qstashAuthorized(request, rawBody)) || bearerAuthorized(request);

  if (!authorized) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    // Headroom inside maxDuration so the response is never cut off mid-send.
    // Anything killed anyway is recovered by the reaper on the next tick.
    const result = await runDeliveryTick({ batchSize: 25, budgetMs: 45_000 });
    const sweptCounters = await sweepRateLimits();

    return Response.json({ ok: true, ...result, sweptCounters });
  } catch (error) {
    // A non-2xx tells QStash to retry, which is what we want when the failure
    // is transient (a database blip, a cold Neon branch).
    console.error("[cron] delivery tick failed", error);
    return Response.json(
      { ok: false, error: describeError(error) },
      { status: 500 },
    );
  }
}

// QStash delivers POST. GET is kept so the endpoint can be checked by hand and
// driven by schedulers that only issue GET.
export const GET = handle;
export const POST = handle;
