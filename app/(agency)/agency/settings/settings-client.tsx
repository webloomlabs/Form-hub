"use client";

import { useActionState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FieldError } from "@/components/action-dialog";
import type { ActionState } from "@/lib/action-state";
import { createWebhook, saveSmtpConfig, testSmtpConfig } from "./actions";

export type SmtpConfigView = {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  fromName: string;
  fromEmail: string;
  verifiedAt: Date | null;
} | null;

function useToasted(
  action: (state: ActionState, fd: FormData) => Promise<ActionState>,
) {
  // Toasting inside the action wrapper (an event context) rather than an
  // effect avoids a cascading re-render on every result.
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    async (prev, formData) => {
      const result = await action(prev, formData);
      if (result.ok) toast.success(result.message ?? "Saved.");
      else if (result.message) toast.error(result.message);
      return result;
    },
    {},
  );
  return [state, formAction, pending] as const;
}

export function SmtpForm({ config }: { config: SmtpConfigView }) {
  const [state, formAction, pending] = useToasted(saveSmtpConfig);

  return (
    <form action={formAction} className="space-y-5">
      {config?.verifiedAt ? (
        <Alert>
          <AlertDescription>
            Connection verified {new Date(config.verifiedAt).toLocaleString()}.
          </AlertDescription>
        </Alert>
      ) : config ? (
        <Alert variant="destructive">
          <AlertDescription>
            These settings have not been verified yet — send a test before
            relying on them.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="host">SMTP host</Label>
          <Input
            id="host"
            name="host"
            required
            defaultValue={config?.host}
            placeholder="smtp.example.com"
          />
          <FieldError errors={state.errors?.host} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="port">Port</Label>
          <Input
            id="port"
            name="port"
            type="number"
            required
            defaultValue={config?.port ?? 587}
          />
          <FieldError errors={state.errors?.port} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="username">Username</Label>
          <Input
            id="username"
            name="username"
            required
            defaultValue={config?.username}
          />
          <FieldError errors={state.errors?.username} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            placeholder={config ? "•••••••• (leave blank to keep)" : ""}
          />
          <FieldError errors={state.errors?.password} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="fromName">From name</Label>
          <Input
            id="fromName"
            name="fromName"
            required
            defaultValue={config?.fromName}
            placeholder="Acme Joinery"
          />
          <FieldError errors={state.errors?.fromName} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="fromEmail">From email</Label>
          <Input
            id="fromEmail"
            name="fromEmail"
            type="email"
            required
            defaultValue={config?.fromEmail}
            placeholder="enquiries@acme.test"
          />
          <FieldError errors={state.errors?.fromEmail} />
        </div>
      </div>

      <div className="flex items-center justify-between gap-4 rounded-md border p-4">
        <div>
          <Label htmlFor="secure">Use TLS on connect</Label>
          <p className="text-xs text-muted-foreground">
            On for port 465. Off for 587, which upgrades via STARTTLS.
          </p>
        </div>
        <Switch id="secure" name="secure" defaultChecked={config?.secure} />
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save SMTP settings"}
      </Button>
    </form>
  );
}

export function TestSmtpButton() {
  const [, formAction, pending] = useToasted(testSmtpConfig);
  return (
    <form action={formAction}>
      <Button type="submit" variant="outline" disabled={pending}>
        {pending ? "Testing…" : "Test connection"}
      </Button>
    </form>
  );
}

export function NewWebhookForm({
  forms,
}: {
  forms: { id: string; name: string; siteName: string }[];
}) {
  const [state, formAction, pending] = useToasted(createWebhook);

  return (
    <form action={formAction} className="space-y-4">
      {state.ok && state.message?.includes("secret") ? (
        <Alert>
          <AlertDescription className="break-all font-mono text-xs">
            {state.message}
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="webhook-url">Endpoint URL</Label>
          <Input
            id="webhook-url"
            name="url"
            required
            placeholder="https://hooks.example.com/formhub"
          />
          <FieldError errors={state.errors?.url} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="webhook-form">Applies to</Label>
          <select
            id="webhook-form"
            name="formId"
            className="border-input bg-transparent dark:bg-input/30 flex h-9 w-full rounded-md border px-3 py-1 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <option value="">All forms in this agency</option>
            {forms.map((f) => (
              <option key={f.id} value={f.id}>
                {f.siteName} — {f.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <Button type="submit" variant="outline" disabled={pending}>
        <Plus className="size-4" />
        {pending ? "Creating…" : "Add webhook"}
      </Button>
    </form>
  );
}
