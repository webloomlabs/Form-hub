"use client";

import { useActionState, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { ActionState } from "@/lib/action-state";

/**
 * A dialog wrapping a server action driven by `useActionState`.
 * Children receive the current state so each form can render its own field
 * errors; the dialog itself owns the submit button, toasts and close-on-success.
 */
export function ActionDialog({
  trigger,
  title,
  description,
  action,
  submitLabel = "Save",
  children,
}: {
  trigger: React.ReactNode;
  title: string;
  description?: string;
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  submitLabel?: string;
  children: (state: ActionState) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  // Handling the result inside the action wrapper rather than an effect: this
  // runs in an event context, so toasting and closing here avoids the
  // cascading re-render that setState-in-effect causes.
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    async (prev, formData) => {
      const result = await action(prev, formData);
      if (result.ok) {
        toast.success(result.message ?? "Saved.");
        setOpen(false);
      }
      return result;
    },
    {},
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger as React.ReactElement} />
      <DialogContent>
        <form action={formAction}>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description ? (
              <DialogDescription>{description}</DialogDescription>
            ) : null}
          </DialogHeader>

          <div className="space-y-4 py-4">
            {state.ok === false && state.message ? (
              <Alert variant="destructive">
                <AlertDescription>{state.message}</AlertDescription>
              </Alert>
            ) : null}
            {children(state)}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function FieldError({ errors }: { errors?: string[] }) {
  if (!errors?.length) return null;
  return <p className="text-sm text-destructive">{errors[0]}</p>;
}
