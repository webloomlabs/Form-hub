// MUST be first: loads .env.local before lib/prisma.ts is evaluated.
import "./env";
import { runDeliveryTick } from "../lib/delivery/tick";
import { sweepRateLimits } from "../lib/ratelimit";

/**
 * Long-running delivery worker for a Docker/VPS deployment.
 *
 * Identical work to /api/cron/deliver, but polling every second instead of
 * every minute — which is the reason to move here: first-alert latency drops
 * from up to 60s to about a second.
 */

const POLL_INTERVAL_MS = 1000;
const SWEEP_EVERY_MS = 5 * 60 * 1000;

let running = true;
let lastSweep = 0;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log("[worker] delivery worker started");

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      console.log(`[worker] ${signal} received, finishing current tick…`);
      running = false;
    });
  }

  while (running) {
    try {
      const result = await runDeliveryTick({ batchSize: 25, budgetMs: 30_000 });
      if (result.claimed > 0 || result.recovered > 0) {
        console.log("[worker] tick", result);
      }

      if (Date.now() - lastSweep > SWEEP_EVERY_MS) {
        const swept = await sweepRateLimits();
        lastSweep = Date.now();
        if (swept > 0) console.log(`[worker] swept ${swept} rate-limit counters`);
      }
    } catch (error) {
      // Never let a transient DB blip kill the worker.
      console.error("[worker] tick failed", error);
      await sleep(5000);
    }

    await sleep(POLL_INTERVAL_MS);
  }

  console.log("[worker] stopped");
  process.exit(0);
}

main().catch((error) => {
  console.error("[worker] fatal", error);
  process.exit(1);
});
