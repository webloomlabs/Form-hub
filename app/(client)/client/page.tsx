import { requireClient } from "@/lib/guards";
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

export const metadata = { title: "Inbox · FormHub" };

export default async function ClientInboxPage({
  searchParams,
}: PageProps<"/client">) {
  const { agencyId, clientId } = await requireClient();
  const sp = await searchParams;

  const status = typeof sp.status === "string" ? sp.status : "";
  const q = typeof sp.q === "string" ? sp.q : "";
  const formId = typeof sp.formId === "string" ? sp.formId : "";
  const cursor = typeof sp.cursor === "string" ? sp.cursor : undefined;

  // Scoped to this client's own sites — never the whole agency.
  const scope = { agencyId, site: { clientId } };
  // No site filter here: the scope is already one client, and the dropdown
  // would only ever narrow within sites they own. Forms are the useful axis.
  const narrowing = { q, formId: formId || undefined };

  const [{ items, nextCursor }, counts, { forms }] = await Promise.all([
    listSubmissions(scope, {
      ...narrowing,
      status: (status || undefined) as SubmissionStatus | "ALL" | undefined,
      cursor,
    }),
    countByStatus(scope, narrowing),
    listFilterOptions({ agencyId, clientId }),
  ]);

  const nextParams = new URLSearchParams();
  if (status) nextParams.set("status", status);
  if (q) nextParams.set("q", q);
  if (formId) nextParams.set("formId", formId);
  if (nextCursor) nextParams.set("cursor", nextCursor);

  return (
    <>
      <PageHeader
        title="Enquiries"
        description={`${counts.NEW} new · ${counts.READ} read · ${counts.ARCHIVED} archived`}
      />

      <SubmissionFilters
        basePath="/client"
        status={status}
        q={q}
        formId={formId}
        forms={forms}
        counts={counts}
      />

      <SubmissionList
        items={items}
        basePath="/client/submissions"
        showSite={false}
      />

      {nextCursor ? (
        <div className="flex justify-center">
          <ButtonLink
            variant="outline"
            href={`/client?${nextParams.toString()}`}
          >
            Load older
          </ButtonLink>
        </div>
      ) : null}
    </>
  );
}
