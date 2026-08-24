import { prisma } from "@/lib/prisma";
import { requireAgency } from "@/lib/guards";
import { buildWhere } from "@/lib/submissions";
import { submissionsToCsv } from "@/lib/csv";
import type { SubmissionStatus } from "@/app/generated/prisma/enums";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Hard cap so one click can't try to stream a million rows into memory. */
const MAX_EXPORT_ROWS = 10_000;

export async function GET(request: Request) {
  const { agencyId } = await requireAgency();
  const url = new URL(request.url);

  const status = url.searchParams.get("status") ?? "";
  const q = url.searchParams.get("q") ?? "";
  const formId = url.searchParams.get("formId") ?? undefined;
  const siteId = url.searchParams.get("siteId") ?? undefined;

  const where = buildWhere(
    { agencyId },
    {
      status: (status || undefined) as SubmissionStatus | "ALL" | undefined,
      q,
      formId,
      siteId,
    },
  );

  const submissions = await prisma.submission.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: MAX_EXPORT_ROWS,
    select: {
      id: true,
      createdAt: true,
      status: true,
      submitterEmail: true,
      data: true,
      form: { select: { name: true } },
      site: { select: { name: true } },
    },
  });

  const csv = submissionsToCsv(submissions);
  const stamp = new Date().toISOString().slice(0, 10);

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="formhub-submissions-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
