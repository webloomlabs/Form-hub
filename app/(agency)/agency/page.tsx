import { requireAgency } from "@/lib/guards";
import { prisma } from "@/lib/prisma";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function AgencyOverviewPage() {
  const { agencyId } = await requireAgency();
  const [clients, sites, forms, submissions] = await Promise.all([
    prisma.client.count({ where: { agencyId } }),
    prisma.site.count({ where: { agencyId } }),
    prisma.form.count({ where: { agencyId } }),
    prisma.submission.count({ where: { agencyId, status: { not: "SPAM" } } }),
  ]);

  const stats = [
    { label: "Clients", value: clients },
    { label: "Sites", value: sites },
    { label: "Forms", value: forms },
    { label: "Submissions", value: submissions },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardHeader>
              <CardDescription>{s.label}</CardDescription>
              <CardTitle className="text-3xl tabular-nums">{s.value}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>
    </div>
  );
}
