"use client";

import { useActionState } from "react";
import { Play } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { ActionState } from "@/lib/action-state";
import { processQueueNow } from "./actions";

export function ProcessQueueButton() {
  const [, formAction, pending] = useActionState<ActionState, FormData>(
    async (prev, formData) => {
      const result = await processQueueNow(prev, formData);
      if (result.ok) toast.success(result.message ?? "Queue processed.");
      else if (result.message) toast.error(result.message);
      return result;
    },
    {},
  );

  return (
    <form action={formAction}>
      <Button type="submit" variant="outline" disabled={pending}>
        <Play className="size-4" />
        {pending ? "Processing…" : "Process queue now"}
      </Button>
    </form>
  );
}
