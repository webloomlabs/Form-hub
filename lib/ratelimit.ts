import { prisma } from "@/lib/prisma";

/**
 * Fixed-window rate limiting backed by Postgres.
 *
 * A single atomic upsert-and-increment per check: no read-then-write race, and
 * no extra infrastructure. Old windows are swept by /api/cron/deliver.
 */

export type RateLimitResult = {
  ok: boolean;
  count: number;
  limit: number;
  /** Seconds until the current window rolls over. */
  retryAfter: number;
};

export async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const windowMs = windowSeconds * 1000;
  const windowStart = new Date(Math.floor(Date.now() / windowMs) * windowMs);

  const rows = await prisma.$queryRaw<{ count: number }[]>`
    INSERT INTO rate_limit_counters ("key", "windowStart", "count")
    VALUES (${key}, ${windowStart}, 1)
    ON CONFLICT ("key", "windowStart")
    DO UPDATE SET "count" = rate_limit_counters."count" + 1
    RETURNING "count"
  `;

  const count = Number(rows[0]?.count ?? 1);
  const retryAfter = Math.max(
    1,
    Math.ceil((windowStart.getTime() + windowMs - Date.now()) / 1000),
  );

  return { ok: count <= limit, count, limit, retryAfter };
}

/** Deletes counters older than `olderThanSeconds`. Returns rows removed. */
export async function sweepRateLimits(olderThanSeconds = 3600): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanSeconds * 1000);
  const { count } = await prisma.rateLimitCounter.deleteMany({
    where: { windowStart: { lt: cutoff } },
  });
  return count;
}
