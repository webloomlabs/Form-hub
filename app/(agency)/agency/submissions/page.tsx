import { Download } from "lucide-react";
import { requireAgency } from "@/lib/guards";
import {
  countByStatus,
  listFilterOptions,
  listSubmissions,
} from "@/lib/submissions";
import { ButtonLink } from "@/components/button-link";
import { SubmissionList } from "@/components/submissions/submission-list";
import { SubmissionFilters } from "@/components/submissions/submission-filters";
import { PageHeader } from "@/components/page-header";
import type { SubmissionStatus } from "@/app/generated/prisma/enums";

export const metadata = { title: "Submissions · FormHub" };

export default async function AgencySubmissionsPage({
  searchParams,
}: PageProps<"/agency/submissions">) {
  const { agencyId } = await requireAgency();
  const sp = await searchParams;

  const status = typeof sp.status === "string" ? sp.status : "";
  const q = typeof sp.q === "string" ? sp.q : "";
  const siteId = typeof sp.siteId === "string" ? sp.siteId : "";
  const formId = typeof sp.formId === "string" ? sp.formId : "";
  const cursor = typeof sp.cursor === "string" ? sp.cursor : undefined;

  const scope = { agencyId };
  const narrowing = { q, siteId: siteId || undefined, formId: formId || undefined };

  const [{ items, nextCursor }, counts, { sites, forms }] = await Promise.all([
    listSubmissions(scope, {
      ...narrowing,
      status: (status || undefined) as SubmissionStatus | "ALL" | undefined,
      cursor,
    }),
    countByStatus(scope, narrowing),
    listFilterOptions({ agencyId }),
  ]);

  const exportParams = new URLSearchParams();
  if (status) exportParams.set("status", status);
  if (q) exportParams.set("q", q);
  if (siteId) exportParams.set("siteId", siteId);
  if (formId) exportParams.set("formId", formId);

  const nextParams = new URLSearchParams(exportParams);
  if (nextCursor) nextParams.set("cursor", nextCursor);

  return (
    <>
      <PageHeader
        title="Submissions"
        description={`${counts.NEW} new · ${counts.READ} read · ${counts.ARCHIVED} archived`}
        actions={
          <ButtonLink
            variant="outline"
            href={`/agency/submissions/export?${exportParams.toString()}`}
          >
            <Download className="size-4" />
            Export CSV
          </ButtonLink>
        }
      />

      <SubmissionFilters
        basePath="/agency/submissions"
        status={status}
        q={q}
        siteId={siteId}
        formId={formId}
        sites={sites}
        forms={forms}
        counts={counts}
      />

      <SubmissionList items={items} basePath="/agency/submissions" />

      {nextCursor ? (
        <div className="flex justify-center">
          <ButtonLink
            variant="outline"
            href={`/agency/submissions?${nextParams.toString()}`}
          >
            Load older
          </ButtonLink>
        </div>
      ) : null}
    </>
  );
}
