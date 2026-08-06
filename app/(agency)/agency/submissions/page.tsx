import Link from "next/link";
import { Download } from "lucide-react";
import { requireAgency } from "@/lib/guards";
import { countByStatus, listSubmissions } from "@/lib/submissions";
import { Button } from "@/components/ui/button";
import { SubmissionList } from "@/components/submissions/submission-list";
import { SubmissionFilters } from "@/components/submissions/submission-filters";
import type { SubmissionStatus } from "@/app/generated/prisma/enums";

export const metadata = { title: "Submissions · FormHub" };

export default async function AgencySubmissionsPage({
  searchParams,
}: PageProps<"/agency/submissions">) {
  const { agencyId } = await requireAgency();
  const sp = await searchParams;

  const status = typeof sp.status === "string" ? sp.status : "";
  const q = typeof sp.q === "string" ? sp.q : "";
  const formId = typeof sp.formId === "string" ? sp.formId : undefined;
  const cursor = typeof sp.cursor === "string" ? sp.cursor : undefined;

  const scope = { agencyId };
  const [{ items, nextCursor }, counts] = await Promise.all([
    listSubmissions(scope, {
      status: (status || undefined) as SubmissionStatus | "ALL" | undefined,
      q,
      formId,
      cursor,
    }),
    countByStatus(scope),
  ]);

  const exportParams = new URLSearchParams();
  if (status) exportParams.set("status", status);
  if (q) exportParams.set("q", q);
  if (formId) exportParams.set("formId", formId);

  const nextParams = new URLSearchParams(exportParams);
  if (nextCursor) nextParams.set("cursor", nextCursor);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Submissions</h1>
          <p className="text-sm text-muted-foreground">
            {counts.NEW} new · {counts.READ} read · {counts.ARCHIVED} archived
          </p>
        </div>
        <Button
          variant="outline"
          render={
            <Link href={`/agency/submissions/export?${exportParams.toString()}`} />
          }
        >
          <Download className="size-4" />
          Export CSV
        </Button>
      </div>

      <SubmissionFilters
        basePath="/agency/submissions"
        status={status}
        q={q}
        counts={counts}
      />

      <SubmissionList items={items} basePath="/agency/submissions" />

      {nextCursor ? (
        <div className="flex justify-center">
          <Button
            variant="outline"
            render={<Link href={`/agency/submissions?${nextParams.toString()}`} />}
          >
            Load older
          </Button>
        </div>
      ) : null}
    </div>
  );
}
