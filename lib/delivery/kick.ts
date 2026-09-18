import { after } from "next/server";
import { runDeliveryTick } from "./tick";

/**
 * Drains the delivery queue opportunistically, off the response path.
 *
 * Why this exists: the scheduler is external (Upstash QStash) because Vercel's
 * Hobby plan caps cron at one run per day. Rather than make alerts depend on
 * any scheduler, delivery piggybacks on traffic the app already receives:
 *
 *   - every accepted submission (the common case — alerts go out immediately)
 *   - every agency page view (picks up retries of earlier failures)
 *   - the "Process queue now" button
 *   - the QStash schedule, as the floor
 *
 * A tick claims *any* due job, not just the one that triggered it, so a single
 * submission drains pending retries across the whole instance.
 *
 * Cost when the queue is empty is two indexed statements, and `after()` runs
 * once the response is already sent, so none of this is on the critical path.
 * Failures are swallowed deliberately — the next trigger tries again.
 */
let lastThrottledKickAt = 0;

export function kickDelivery(
  opts: {
    batchSize?: number;
    budgetMs?: number;
    /**
     * Skip if this instance already kicked within the window. For page-view
     * triggers only: navigations and server actions re-render the layout, and
     * retries can't be due more often than the backoff allows anyway. The
     * ingest kick stays unthrottled so a new alert always goes out at once.
     */
    minIntervalMs?: number;
  } = {},
): void {
  if (opts.minIntervalMs) {
    const now = Date.now();
    if (now - lastThrottledKickAt < opts.minIntervalMs) return;
    lastThrottledKickAt = now;
  }

  after(async () => {
    try {
      await runDeliveryTick({
        batchSize: opts.batchSize ?? 10,
        budgetMs: opts.budgetMs ?? 10_000,
      });
    } catch {
      // Intentionally ignored: delivery is retried by the next trigger.
    }
  });
}
