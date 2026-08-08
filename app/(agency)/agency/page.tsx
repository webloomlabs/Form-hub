import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Globe,
  Inbox,
  TrendingUp,
  Users,
} from "lucide-react";
import { requireAgency } from "@/lib/guards";
import { prisma } from "@/lib/prisma";
import { submissionLabel } from "@/lib/submissions";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/button-link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PageHeader, EmptyState } from "@/components/page-header";
import { StatGrid, type Stat } from "@/components/stat-card";

export const metadata = { title: "Overview · FormHub" };

export default async function AgencyOverviewPage() {
  const { agencyId } = await requireAgency();

  // Server component: this runs per request, not during a React render pass,
  // so reading the clock here is correct despite the purity lint.
  // eslint-disable-next-line react-hooks/purity
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [clients, sites, newCount, weekCount, failed, recent] =
    await Promise.all([
      prisma.client.count({ where: { agencyId } }),
      prisma.site.count({ where: { agencyId } }),
      prisma.submission.count({ where: { agencyId, status: "NEW" } }),
      prisma.submission.count({
        where: { agencyId, status: { not: "SPAM" }, createdAt: { gte: since } },
      }),
      prisma.deliveryJob.count({ where: { agencyId, status: "DEAD" } }),
      prisma.submission.findMany({
        where: { agencyId, status: { not: "SPAM" } },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 6,
        select: {
          id: true,
          createdAt: true,
          status: true,
          subjectPreview: true,
          submitterEmail: true,
          data: true,
          site: { select: { name: true } },
        },
      }),
    ]);

  const stats: Stat[] = [
    {
      label: "Unread",
      value: newCount,
      hint: "Submissions nobody has opened",
      icon: Inbox,
      href: "/agency/submissions?status=NEW",
    },
    {
      label: "Last 7 days",
      value: weekCount,
      hint: "Excluding spam",
      icon: TrendingUp,
      href: "/agency/submissions",
    },
    {
      label: "Clients",
      value: clients,
      hint: `${sites} ${sites === 1 ? "site" : "sites"}`,
      icon: Users,
      href: "/agency/clients",
    },
    {
      label: "Failed deliveries",
      value: failed,
      hint: failed > 0 ? "Needs attention" : "All alerts delivered",
      icon: failed > 0 ? AlertTriangle : CheckCircle2,
      href: "/agency/deliveries",
      tone: "attention",
    },
  ];

  return (
    <>
      <PageHeader
        title="Overview"
        description="Submissions across every site you manage, and the health of their alerts."
      />

      <StatGrid stats={stats} />

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <CardTitle>Recent submissions</CardTitle>
              <CardDescription>
                The latest enquiries from across your sites.
              </CardDescription>
            </div>
            <ButtonLink variant="outline" size="sm" href="/agency/submissions">
              View all
              <ArrowRight className="size-4" />
            </ButtonLink>
          </div>
        </CardHeader>
        <CardContent>
          {recent.length === 0 ? (
            <EmptyState
              icon={Globe}
              title="No submissions yet"
              description="Add a site and a form, then paste the snippet into your static site. Submissions appear here the moment they arrive."
              action={
                <ButtonLink size="sm" href="/agency/sites">
                  Set up a form
                </ButtonLink>
              }
            />
          ) : (
            <ul className="divide-y">
              {recent.map((s) => (
                <li key={s.id}>
                  <Link
                    href={`/agency/submissions/${s.id}`}
                    className="hover:bg-muted/50 -mx-2 flex items-center gap-3 rounded-md px-2 py-3 transition-colors"
                  >
                    <span
                      className={
                        s.status === "NEW"
                          ? "bg-primary size-2 shrink-0 rounded-full"
                          : "bg-muted-foreground/30 size-2 shrink-0 rounded-full"
                      }
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {submissionLabel(s.data, s.subjectPreview)}
                      </span>
                      <span className="text-muted-foreground block truncate text-xs">
                        {s.submitterEmail ?? "no email"} · {s.site.name}
                      </span>
                    </span>
                    {s.status === "NEW" ? (
                      <Badge className="shrink-0">New</Badge>
                    ) : null}
                    <span className="text-muted-foreground hidden shrink-0 text-xs tabular-nums sm:block">
                      {s.createdAt.toLocaleDateString()}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}
