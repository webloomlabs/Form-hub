import Link from "next/link";
import { notFound } from "next/navigation";
import { Trash2 } from "lucide-react";
import { requireAgency } from "@/lib/guards";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SetupSnippet } from "./setup-snippet";
import { FormSettings, TurnstileSettings } from "./form-settings";
import { addRecipient, removeRecipient } from "./actions";
import { AddRecipientForm } from "./recipients";

export const metadata = { title: "Form · FormHub" };

export default async function FormDetailPage({
  params,
}: PageProps<"/agency/forms/[formId]">) {
  const { formId } = await params;
  const { agencyId } = await requireAgency();

  const form = await prisma.form.findFirst({
    where: { id: formId, agencyId },
    include: {
      site: { select: { id: true, name: true, domains: true } },
      recipients: { orderBy: { createdAt: "asc" } },
      _count: { select: { submissions: true } },
    },
  });

  if (!form) notFound();

  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3100";
  const endpoint = `${base}/f/${form.publicKey}`;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <p className="text-sm text-muted-foreground">
          <Link href="/agency/sites" className="underline-offset-4 hover:underline">
            Sites
          </Link>{" "}
          / {form.site.name}
        </p>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{form.name}</h1>
          {form.status === "ACTIVE" ? (
            <Badge variant="secondary">Active</Badge>
          ) : (
            <Badge variant="outline">Paused</Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          {form._count.submissions} submissions ·{" "}
          <Link
            href={`/agency/submissions?formId=${form.id}`}
            className="underline underline-offset-4"
          >
            View inbox
          </Link>
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Endpoint</CardTitle>
          <CardDescription>
            Point your form here. Submissions are accepted from{" "}
            {form.site.domains.length > 0 ? (
              <span className="font-mono">{form.site.domains.join(", ")}</span>
            ) : (
              <span className="text-destructive">
                no origins yet — add one on the site before going live
              </span>
            )}
            .
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Endpoint URL</Label>
            <Input readOnly value={endpoint} className="font-mono text-xs" />
          </div>
          <SetupSnippet endpoint={endpoint} honeypotField={form.honeypotField} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Alert recipients</CardTitle>
          <CardDescription>
            Everyone notified when a submission arrives. No recipients means no
            email is queued.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {form.recipients.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No recipients yet — submissions will be stored but nobody will be
              emailed.
            </p>
          ) : (
            <ul className="divide-y rounded-md border">
              {form.recipients.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center justify-between gap-4 px-4 py-2"
                >
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{r.kind}</Badge>
                    <span className="text-sm">{r.email}</span>
                  </div>
                  <form action={removeRecipient}>
                    <input type="hidden" name="formId" value={form.id} />
                    <input type="hidden" name="recipientId" value={r.id} />
                    <Button
                      variant="ghost"
                      size="sm"
                      type="submit"
                      aria-label={`Remove ${r.email}`}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
          )}
          <AddRecipientForm formId={form.id} action={addRecipient} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Settings</CardTitle>
        </CardHeader>
        <CardContent>
          <FormSettings
            form={{
              id: form.id,
              name: form.name,
              status: form.status,
              redirectUrl: form.redirectUrl,
              redirectErrorUrl: form.redirectErrorUrl,
              honeypotField: form.honeypotField,
              minSubmitSeconds: form.minSubmitSeconds,
              requireOriginMatch: form.requireOriginMatch,
              uploadsEnabled: form.uploadsEnabled,
              turnstileEnabled: form.turnstileEnabled,
              hasTurnstileSecret: Boolean(form.turnstileSecretEnc),
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Captcha</CardTitle>
        </CardHeader>
        <CardContent>
          <TurnstileSettings
            form={{
              id: form.id,
              name: form.name,
              status: form.status,
              redirectUrl: form.redirectUrl,
              redirectErrorUrl: form.redirectErrorUrl,
              honeypotField: form.honeypotField,
              minSubmitSeconds: form.minSubmitSeconds,
              requireOriginMatch: form.requireOriginMatch,
              uploadsEnabled: form.uploadsEnabled,
              turnstileEnabled: form.turnstileEnabled,
              hasTurnstileSecret: Boolean(form.turnstileSecretEnc),
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
