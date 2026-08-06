import Link from "next/link";
import { requireClient } from "@/lib/guards";
import { countByStatus, listSubmissions } from "@/lib/submissions";
import { Button } from "@/components/ui/button";
import { SubmissionList } from "@/components/submissions/submission-list";
import { SubmissionFilters } from "@/components/submissions/submission-filters";
import type { SubmissionStatus } from "@/app/generated/prisma/enums";

export const metadata = { title: "Inbox · FormHub" };

export default async function ClientInboxPage({
  searchParams,
}: PageProps<"/client">) {
  const { agencyId, clientId } = await requireClient();
  const sp = await searchParams;

  const status = typeof sp.status === "string" ? sp.status : "";
  const q = typeof sp.q === "string" ? sp.q : "";
  const cursor = typeof sp.cursor === "string" ? sp.cursor : undefined;

  // Scoped to this client's own sites — never the whole agency.
  const scope = { agencyId, site: { clientId } };

  const [{ items, nextCursor }, counts] = await Promise.all([
    listSubmissions(scope, {
      status: (status || undefined) as SubmissionStatus | "ALL" | undefined,
      q,
      cursor,
    }),
    countByStatus(scope),
  ]);

  const nextParams = new URLSearchParams();
  if (status) nextParams.set("status", status);
  if (q) nextParams.set("q", q);
  if (nextCursor) nextParams.set("cursor", nextCursor);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Enquiries</h1>
        <p className="text-sm text-muted-foreground">
          {counts.NEW} new · {counts.READ} read · {counts.ARCHIVED} archived
        </p>
      </div>

      <SubmissionFilters basePath="/client" status={status} q={q} counts={counts} />

      <SubmissionList
        items={items}
        basePath="/client/submissions"
        showSite={false}
      />

      {nextCursor ? (
        <div className="flex justify-center">
          <Button
            variant="outline"
            render={<Link href={`/client?${nextParams.toString()}`} />}
          >
            Load older
          </Button>
        </div>
      ) : null}
    </div>
  );
}
