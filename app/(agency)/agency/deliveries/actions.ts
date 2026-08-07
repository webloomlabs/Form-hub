"use server";

import { revalidatePath } from "next/cache";
import { requireAgency } from "@/lib/guards";
import { runDeliveryTick } from "@/lib/delivery/tick";
import { sweepRateLimits } from "@/lib/ratelimit";
import { withAction, type ActionState } from "@/lib/action-state";

/**
 * Drains the queue on demand.
 *
 * Gives an agency a way to push retries through immediately instead of waiting
 * for the next QStash run. Unlike the other actions here it isn't
 * tenant-scoped — the queue is global and a tick claims whatever is due —
 * which is harmless, since it only performs work the scheduler would have done
 * anyway.
 */
export async function processQueueNow(
  _state: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  return withAction(async () => {
    await requireAgency();

    const result = await runDeliveryTick({ batchSize: 25, budgetMs: 20_000 });
    await sweepRateLimits();

    revalidatePath("/agency/deliveries");

    if (result.claimed === 0) {
      return { ok: true, message: "Nothing was due — the queue is empty." };
    }
    const parts = [`${result.claimed} processed`];
    if (result.succeeded) parts.push(`${result.succeeded} delivered`);
    if (result.failed) parts.push(`${result.failed} will retry`);
    if (result.dead) parts.push(`${result.dead} gave up`);
    return { ok: true, message: parts.join(" · ") };
  });
}
