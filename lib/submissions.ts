import { prisma } from "@/lib/prisma";
import type { Prisma, SubmissionStatus } from "@/app/generated/prisma/client";

/**
 * Shared submission querying for both portals. The only difference between the
 * agency and client views is the tenant scope passed in, so the filtering,
 * searching and pagination live here once.
 */

export type SubmissionFilters = {
  status?: SubmissionStatus | "ALL";
  formId?: string;
  siteId?: string;
  q?: string;
  /** Keyset cursor: "<iso createdAt>|<id>" from the previous page. */
  cursor?: string;
};

export const PAGE_SIZE = 25;

export function buildWhere(
  scope: Prisma.SubmissionWhereInput,
  filters: SubmissionFilters,
): Prisma.SubmissionWhereInput {
  const and: Prisma.SubmissionWhereInput[] = [scope];

  if (filters.status && filters.status !== "ALL") {
    and.push({ status: filters.status });
  } else if (!filters.status) {
    // Default view hides spam; it's still reachable via the Spam tab.
    and.push({ status: { not: "SPAM" } });
  }

  if (filters.formId) and.push({ formId: filters.formId });
  if (filters.siteId) and.push({ siteId: filters.siteId });

  if (filters.q) {
    const q = filters.q.trim();
    if (q) {
      and.push({
        OR: [
          { subjectPreview: { contains: q, mode: "insensitive" } },
          { submitterEmail: { contains: q, mode: "insensitive" } },
          // Postgres JSON containment can't do substring search, so the text
          // columns above are what search actually covers.
        ],
      });
    }
  }

  if (filters.cursor) {
    const [iso, id] = filters.cursor.split("|");
    const createdAt = new Date(iso ?? "");
    if (!Number.isNaN(createdAt.getTime()) && id) {
      // Keyset pagination — never OFFSET; submission tables get long.
      and.push({
        OR: [
          { createdAt: { lt: createdAt } },
          { createdAt, id: { lt: id } },
        ],
      });
    }
  }

  return { AND: and };
}

export async function listSubmissions(
  scope: Prisma.SubmissionWhereInput,
  filters: SubmissionFilters,
) {
  const rows = await prisma.submission.findMany({
    where: buildWhere(scope, filters),
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: PAGE_SIZE + 1,
    select: {
      id: true,
      createdAt: true,
      status: true,
      spamReasons: true,
      subjectPreview: true,
      submitterEmail: true,
      form: { select: { id: true, name: true } },
      site: { select: { id: true, name: true } },
      _count: { select: { files: true, jobs: true } },
    },
  });

  const hasMore = rows.length > PAGE_SIZE;
  const items = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
  const last = items.at(-1);
  const nextCursor =
    hasMore && last ? `${last.createdAt.toISOString()}|${last.id}` : null;

  return { items, nextCursor };
}

export async function countByStatus(scope: Prisma.SubmissionWhereInput) {
  const grouped = await prisma.submission.groupBy({
    by: ["status"],
    where: scope,
    _count: { _all: true },
  });
  const counts: Record<string, number> = {
    NEW: 0,
    READ: 0,
    ARCHIVED: 0,
    SPAM: 0,
  };
  for (const g of grouped) counts[g.status] = g._count._all;
  return counts;
}
