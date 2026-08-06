import { safeEqual } from "@/lib/crypto";
import { runDeliveryTick } from "@/lib/delivery/tick";
import { sweepRateLimits } from "@/lib/ratelimit";

/**
 * Vercel Cron entry point. Registered in vercel.json to run every minute.
 * The identical work is done by worker/index.ts in a Docker deployment —
 * both are thin wrappers around runDeliveryTick().
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : header;
  return safeEqual(token, secret);
}

async function handle(request: Request) {
  if (!authorized(request)) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  // Leave headroom inside maxDuration so the response is never cut off.
  const result = await runDeliveryTick({ batchSize: 25, budgetMs: 50_000 });
  const sweptCounters = await sweepRateLimits();

  return Response.json({ ok: true, ...result, sweptCounters });
}

// Vercel Cron issues GET; POST is accepted so the endpoint can be poked
// manually or driven by an external scheduler.
export const GET = handle;
export const POST = handle;
