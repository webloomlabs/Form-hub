import Link from "next/link";
import { requireAgency } from "@/lib/guards";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader, EmptyState } from "@/components/page-header";
import { StatGrid, type Stat } from "@/components/stat-card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { resendDelivery } from "../submissions/actions";
import { ProcessQueueButton } from "./deliveries-client";
import { AlertTriangle, CheckCircle2, Clock, RotateCw, Send } from "lucide-react";

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

  const stats: Stat[] = [
    { label: "Delivered", value: counts.SUCCEEDED, icon: CheckCircle2, hint: "Alerts that reached their recipient" },
    { label: "Queued", value: counts.PENDING, icon: Clock, hint: "Waiting for the next attempt" },
    { label: "Sending", value: counts.PROCESSING, icon: Send, hint: "In flight right now" },
    { label: "Failed", value: counts.DEAD, icon: AlertTriangle, hint: counts.DEAD > 0 ? "Retries exhausted" : "Nothing has failed", tone: "attention" },
  ];

  return (
    <>
      <PageHeader
        title="Deliveries"
        description="Every alert FormHub has tried to send, and what happened to it."
        actions={<ProcessQueueButton />}
      />

      <StatGrid stats={stats} />

      <div className="space-y-2">
        <h2 className="text-lg font-medium">Needs attention</h2>
        {problems.length === 0 ? (
          <EmptyState
            icon={CheckCircle2}
            title="Everything delivered"
            description="No alert is queued, retrying or failed. This is where anything needing a human would appear."
          />
        ) : (
          <div className="bg-card rounded-xl border shadow-xs">
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
    </>
  );
}
