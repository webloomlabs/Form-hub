"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { LoginState } from "./actions";

export function LoginForm({
  action,
  portal,
  next,
}: {
  action: (state: LoginState, formData: FormData) => Promise<LoginState>;
  portal: "agency" | "client";
  next?: string;
}) {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(
    action,
    {},
  );

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="portal" value={portal} />
      {next ? <input type="hidden" name="next" value={next} /> : null}

      {state.message ? (
        <Alert variant="destructive">
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          defaultValue={state.values?.email}
        />
        {state.errors?.email ? (
          <p className="text-sm text-destructive">{state.errors.email[0]}</p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
        {state.errors?.password ? (
          <p className="text-sm text-destructive">{state.errors.password[0]}</p>
        ) : null}
      </div>

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
