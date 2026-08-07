import { ArrowRight, Inbox, RefreshCw, ShieldCheck } from "lucide-react";
import { ButtonLink } from "@/components/button-link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function HomePage() {
  const features = [
    {
      icon: ShieldCheck,
      title: "Nothing is lost",
      body: "A submission is written to Postgres before the response is sent. If the endpoint said yes, the enquiry is on disk — no workflow step in between to fail.",
    },
    {
      icon: RefreshCw,
      title: "Failures are visible",
      body: "Alerts are queued and retried with backoff. Every attempt is logged with its error, and anything that ends up stuck can be resent with one click.",
    },
    {
      icon: Inbox,
      title: "Owners can self-serve",
      body: "Website owners get their own login and their own inbox, so the agency stops being the middleman for “did anyone email us?”",
    },
  ];

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col justify-center gap-10 px-6 py-16">
      <div className="space-y-4">
        <p className="text-sm font-medium text-muted-foreground">FormHub</p>
        <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          Form submissions for static sites, without the fragile workflow.
        </h1>
        <p className="max-w-2xl text-lg text-muted-foreground text-pretty">
          Point your form at an endpoint. FormHub stores the submission, emails
          the site owner, and keeps retrying until it gets through — with a
          record of every attempt.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <ButtonLink href="/agency/login">
          Agency sign in
          <ArrowRight className="size-4" />
        </ButtonLink>
        <ButtonLink variant="outline" href="/client/login">
          Website owner sign in
        </ButtonLink>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {features.map((f) => (
          <Card key={f.title}>
            <CardHeader>
              <f.icon className="size-5 text-muted-foreground" />
              <CardTitle className="text-base">{f.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{f.body}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </main>
  );
}
