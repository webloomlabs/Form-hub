"use client";

import { useActionState, useRef } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldError } from "@/components/action-dialog";
import type { ActionState } from "@/lib/action-state";

export function AddRecipientForm({
  formId,
  action,
}: {
  formId: string;
  action: (state: ActionState, fd: FormData) => Promise<ActionState>;
}) {
  const ref = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    async (prev, formData) => {
      const result = await action(prev, formData);
      if (result.ok) {
        toast.success(result.message ?? "Recipient added.");
        ref.current?.reset();
      } else if (result.message) {
        toast.error(result.message);
      }
      return result;
    },
    {},
  );

  return (
    <form ref={ref} action={formAction} className="space-y-2">
      <div className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="formId" value={formId} />
        <div className="min-w-[240px] flex-1">
          <Input
            name="email"
            type="email"
            required
            placeholder="owner@acme.test"
            aria-label="Recipient email"
          />
        </div>
        <select
          name="kind"
          defaultValue="TO"
          aria-label="Recipient type"
          className="border-input bg-transparent dark:bg-input/30 flex h-9 rounded-md border px-3 py-1 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <option value="TO">To</option>
          <option value="CC">Cc</option>
          <option value="BCC">Bcc</option>
        </select>
        <Button type="submit" variant="outline" disabled={pending}>
          <Plus className="size-4" />
          Add
        </Button>
      </div>
      <FieldError errors={state.errors?.email} />
    </form>
  );
}
