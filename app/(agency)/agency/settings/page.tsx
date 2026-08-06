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
import { deleteSmtpConfig, deleteWebhook } from "./actions";
import { NewWebhookForm, SmtpForm, TestSmtpButton } from "./settings-client";

export const metadata = { title: "Settings · FormHub" };

export default async function SettingsPage() {
  const { agencyId } = await requireAgency();

  const [smtp, webhooks, forms] = await Promise.all([
    prisma.agencySmtpConfig.findUnique({ where: { agencyId } }),
    prisma.webhookEndpoint.findMany({
      where: { agencyId },
      orderBy: { createdAt: "desc" },
      include: { form: { select: { name: true, site: { select: { name: true } } } } },
    }),
    prisma.form.findMany({
      where: { agencyId },
      select: { id: true, name: true, site: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          How alerts leave FormHub.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Sending email</CardTitle>
              <CardDescription>
                By default alerts are sent from the FormHub platform address with
                Reply-To set to the person who filled in the form. Add your own
                SMTP to send from your domain instead.
              </CardDescription>
            </div>
            <div className="flex shrink-0 gap-2">
              {smtp ? <TestSmtpButton /> : null}
              {smtp ? (
                <form action={deleteSmtpConfig}>
                  <Button type="submit" variant="ghost" size="sm">
                    <Trash2 className="size-4" />
                    Remove
                  </Button>
                </form>
              ) : null}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <SmtpForm
            config={
              smtp
                ? {
                    host: smtp.host,
                    port: smtp.port,
                    secure: smtp.secure,
                    username: smtp.username,
                    fromName: smtp.fromName,
                    fromEmail: smtp.fromEmail,
                    verifiedAt: smtp.verifiedAt,
                  }
                : null
            }
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Webhook forwarding</CardTitle>
          <CardDescription>
            Relay every submission to your own URL — Slack, a CRM, Zapier. Each
            request is signed with{" "}
            <code className="text-xs">X-FormHub-Signature</code> and retried on
            the same schedule as email.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {webhooks.length > 0 ? (
            <ul className="divide-y rounded-md border">
              {webhooks.map((hook) => (
                <li
                  key={hook.id}
                  className="flex items-center justify-between gap-4 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate font-mono text-xs">{hook.url}</p>
                    <p className="text-xs text-muted-foreground">
                      {hook.form
                        ? `${hook.form.site.name} — ${hook.form.name}`
                        : "All forms"}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {hook.enabled ? (
                      <Badge variant="secondary">Enabled</Badge>
                    ) : (
                      <Badge variant="outline">Disabled</Badge>
                    )}
                    <form action={deleteWebhook}>
                      <input type="hidden" name="id" value={hook.id} />
                      <Button type="submit" variant="ghost" size="sm">
                        <Trash2 className="size-4" />
                      </Button>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}

          <NewWebhookForm
            forms={forms.map((f) => ({
              id: f.id,
              name: f.name,
              siteName: f.site.name,
            }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
