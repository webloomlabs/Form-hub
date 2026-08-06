"use client";

import { useActionState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { FieldError } from "@/components/action-dialog";
import type { ActionState } from "@/lib/action-state";
import { updateFormSettings, updateTurnstile } from "./actions";

type FormData = {
  id: string;
  name: string;
  status: "ACTIVE" | "PAUSED";
  redirectUrl: string | null;
  redirectErrorUrl: string | null;
  honeypotField: string;
  minSubmitSeconds: number;
  requireOriginMatch: boolean;
  uploadsEnabled: boolean;
  turnstileEnabled: boolean;
  hasTurnstileSecret: boolean;
};

function useToastedAction(
  action: (state: ActionState, fd: globalThis.FormData) => Promise<ActionState>,
) {
  // Toasting inside the action wrapper (an event context) rather than an
  // effect avoids a cascading re-render on every result.
  const [state, formAction, pending] = useActionState<
    ActionState,
    globalThis.FormData
  >(async (prev, formData) => {
    const result = await action(prev, formData);
    if (result.ok) toast.success(result.message ?? "Saved.");
    else if (result.message) toast.error(result.message);
    return result;
  }, {});
  return [state, formAction, pending] as const;
}

export function FormSettings({ form }: { form: FormData }) {
  const [state, formAction, pending] = useToastedAction(updateFormSettings);

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="formId" value={form.id} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="name">Form name</Label>
          <Input id="name" name="name" defaultValue={form.name} required />
          <FieldError errors={state.errors?.name} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="status">Status</Label>
          <select
            id="status"
            name="status"
            defaultValue={form.status}
            className="border-input bg-transparent dark:bg-input/30 flex h-9 w-full rounded-md border px-3 py-1 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <option value="ACTIVE">Active</option>
            <option value="PAUSED">Paused — reject new submissions</option>
          </select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="redirectUrl">Thank-you URL</Label>
          <Input
            id="redirectUrl"
            name="redirectUrl"
            defaultValue={form.redirectUrl ?? ""}
            placeholder="https://acme.test/thanks"
          />
          <FieldError errors={state.errors?.redirectUrl} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="redirectErrorUrl">Error URL</Label>
          <Input
            id="redirectErrorUrl"
            name="redirectErrorUrl"
            defaultValue={form.redirectErrorUrl ?? ""}
            placeholder="https://acme.test/sorry"
          />
          <FieldError errors={state.errors?.redirectErrorUrl} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="honeypotField">Honeypot field name</Label>
          <Input
            id="honeypotField"
            name="honeypotField"
            defaultValue={form.honeypotField}
            required
          />
          <p className="text-xs text-muted-foreground">
            Must match the hidden input in your snippet.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="minSubmitSeconds">Minimum time on page (seconds)</Label>
          <Input
            id="minSubmitSeconds"
            name="minSubmitSeconds"
            type="number"
            min={0}
            max={300}
            defaultValue={form.minSubmitSeconds}
          />
          <p className="text-xs text-muted-foreground">
            Faster submissions are filed as spam, not rejected. 0 disables.
          </p>
        </div>
      </div>

      <div className="space-y-3 rounded-md border p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <Label htmlFor="requireOriginMatch">Enforce allowed origins</Label>
            <p className="text-xs text-muted-foreground">
              Reject submissions that don&apos;t come from the site&apos;s registered
              domains.
            </p>
          </div>
          <Switch
            id="requireOriginMatch"
            name="requireOriginMatch"
            defaultChecked={form.requireOriginMatch}
          />
        </div>
        <div className="flex items-center justify-between gap-4">
          <div>
            <Label htmlFor="uploadsEnabled">Accept file uploads</Label>
            <p className="text-xs text-muted-foreground">
              Files are stored privately and emailed as 24-hour links.
            </p>
          </div>
          <Switch
            id="uploadsEnabled"
            name="uploadsEnabled"
            defaultChecked={form.uploadsEnabled}
          />
        </div>
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save settings"}
      </Button>
    </form>
  );
}

export function TurnstileSettings({ form }: { form: FormData }) {
  const [state, formAction, pending] = useToastedAction(updateTurnstile);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="formId" value={form.id} />

      <div className="flex items-center justify-between gap-4">
        <div>
          <Label htmlFor="turnstileEnabled">Require Cloudflare Turnstile</Label>
          <p className="text-xs text-muted-foreground">
            Verified server-side before a submission is accepted.
          </p>
        </div>
        <Switch
          id="turnstileEnabled"
          name="turnstileEnabled"
          defaultChecked={form.turnstileEnabled}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="turnstileSecret">Secret key</Label>
        <Input
          id="turnstileSecret"
          name="turnstileSecret"
          type="password"
          placeholder={
            form.hasTurnstileSecret
              ? "•••••••• (leave blank to keep current)"
              : "Paste your Turnstile secret key"
          }
        />
        <p className="text-xs text-muted-foreground">
          Stored encrypted. It is never shown again after saving.
        </p>
        <FieldError errors={state.errors?.turnstileSecret} />
      </div>

      <Button type="submit" variant="outline" disabled={pending}>
        {pending ? "Saving…" : "Save captcha settings"}
      </Button>
    </form>
  );
}
