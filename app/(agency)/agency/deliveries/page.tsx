import Link from "next/link";
import { requireAgency } from "@/lib/guards";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { resendDelivery } from "../submissions/actions";
import { RotateCw } from "lucide-react";

export const metadata = { title: "Deliveries · FormHub" };

/**
 * Operational view of the queue. Failed and queued jobs come first because
 * those are the ones that need a human.
 */
export default async function DeliveriesPage() {
  const { agencyId } = await requireAgency();

  const [grouped, problems] = await Promise.all([
    prisma.deliveryJob.groupBy({
      by: ["status"],
      where: { agencyId },
      _count: { _all: true },
    }),
    prisma.deliveryJob.findMany({
      where: { agencyId, status: { in: ["DEAD", "PENDING", "PROCESSING"] } },
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
      take: 50,
      include: {
        submission: {
          select: {
            id: true,
            subjectPreview: true,
            site: { select: { name: true } },
          },
        },
      },
    }),
  ]);

  const counts: Record<string, number> = {
    PENDING: 0,
    PROCESSING: 0,
    SUCCEEDED: 0,
    DEAD: 0,
  };
  for (const g of grouped) counts[g.status] = g._count._all;

  const stats = [
    { label: "Delivered", value: counts.SUCCEEDED },
    { label: "Queued", value: counts.PENDING },
    { label: "Sending", value: counts.PROCESSING },
    { label: "Failed", value: counts.DEAD },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Deliveries</h1>
        <p className="text-sm text-muted-foreground">
          Every alert FormHub has tried to send, and what happened to it.
        </p>
      </div>

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

      <div className="space-y-2">
        <h2 className="text-lg font-medium">Needs attention</h2>
        {problems.length === 0 ? (
          <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            Nothing queued or failed — everything has been delivered.
          </p>
        ) : (
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[110px]">Status</TableHead>
                  <TableHead>Submission</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Last error</TableHead>
                  <TableHead className="w-[140px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {problems.map((job) => (
                  <TableRow key={job.id}>
                    <TableCell>
                      {job.status === "DEAD" ? (
                        <Badge variant="destructive">Failed</Badge>
                      ) : job.status === "PROCESSING" ? (
                        <Badge variant="outline">Sending</Badge>
                      ) : (
                        <Badge variant="outline">Queued</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/agency/submissions/${job.submission.id}`}
                        className="underline-offset-4 hover:underline"
                      >
                        {job.submission.subjectPreview ?? "(no preview)"}
                      </Link>
                      <div className="text-xs text-muted-foreground">
                        {job.submission.site.name} · attempt {job.attempts}/
                        {job.maxAttempts}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {job.kind === "EMAIL_ALERT" ? "Email" : "Webhook"}
                    </TableCell>
                    <TableCell className="max-w-[280px] truncate text-xs text-muted-foreground">
                      {job.lastError ?? "—"}
                    </TableCell>
                    <TableCell>
                      <form action={resendDelivery} className="flex justify-end">
                        <input type="hidden" name="jobId" value={job.id} />
                        <input
                          type="hidden"
                          name="submissionId"
                          value={job.submission.id}
                        />
                        <Button type="submit" size="sm" variant="outline">
                          <RotateCw className="size-4" />
                          Retry
                        </Button>
                      </form>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
