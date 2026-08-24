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
      // Needed by submissionLabel(); the inbox label is derived, not stored.
      data: true,
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

/** A site or form as offered in the filter dropdowns. */
export type FilterOption = { id: string; name: string };
export type FormFilterOption = FilterOption & { siteId: string };

/**
 * The sites and forms a viewer may filter by. Scoped exactly like the
 * submission list itself: an agency sees its whole tenant, a client only the
 * sites it owns — so the dropdowns can never name someone else's site.
 */
export async function listFilterOptions(scope: {
  agencyId: string;
  clientId?: string;
}): Promise<{ sites: FilterOption[]; forms: FormFilterOption[] }> {
  const siteWhere: Prisma.SiteWhereInput = {
    agencyId: scope.agencyId,
    ...(scope.clientId ? { clientId: scope.clientId } : {}),
  };

  const [sites, forms] = await Promise.all([
    prisma.site.findMany({
      where: siteWhere,
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.form.findMany({
      where: { agencyId: scope.agencyId, site: siteWhere },
      select: { id: true, name: true, siteId: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return { sites, forms };
}

export async function countByStatus(
  scope: Prisma.SubmissionWhereInput,
  filters: Omit<SubmissionFilters, "status" | "cursor"> = {},
) {
  const grouped = await prisma.submission.groupBy({
    by: ["status"],
    // "ALL" so buildWhere doesn't apply its hide-spam default — the counts
    // have to span every status, but still honour the site/form/search
    // narrowing so the tab numbers match what the list shows.
    where: buildWhere(scope, { ...filters, status: "ALL" }),
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

/**
 * The one line that identifies a submission in the inbox.
 *
 * Prefers a person's name, then email, then phone, then whatever the form put
 * first. `subjectPreview` is not used: it holds the longest text field, which
 * is usually the message body — fine for a detail view, useless as a label and
 * wide enough to blow out the table.
 *
 * Derived at render rather than stored, so existing submissions get the new
 * label without a backfill.
 */

/** Compared with separators and case stripped, so "Full Name" matches "full_name". */
const normalizeKey = (key: string) => key.toLowerCase().replace(/[\s_-]+/g, "");

const NAME_KEYS = [
  "name",
  "fullname",
  "yourname",
  "firstname",
  "givenname",
  "contactname",
];
const EMAIL_KEYS = ["email", "emailaddress", "youremail", "contactemail"];
const PHONE_KEYS = [
  "phone",
  "phonenumber",
  "telephone",
  "mobile",
  "mobilenumber",
  "contactnumber",
];

function firstMatching(
  entries: [string, unknown][],
  candidates: string[],
): string | null {
  for (const candidate of candidates) {
    const hit = entries.find(([key]) => normalizeKey(key) === candidate);
    const value = hit?.[1];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return null;
}

export function submissionLabel(
  data: unknown,
  fallback?: string | null,
): string {
  if (data && typeof data === "object" && !Array.isArray(data)) {
    // Skip the hidden fields the ingest endpoint adds — they are never a label.
    const entries = Object.entries(data as Record<string, unknown>).filter(
      ([key]) => !key.startsWith("_"),
    );

    const named =
      firstMatching(entries, NAME_KEYS) ??
      firstMatching(entries, EMAIL_KEYS) ??
      firstMatching(entries, PHONE_KEYS);
    if (named) return named;

    // Otherwise the first field with something in it, in submitted order.
    for (const [, value] of entries) {
      if (typeof value === "string" && value.trim()) return value.trim();
      if (typeof value === "number" || typeof value === "boolean") {
        return String(value);
      }
    }
  }

  return fallback?.trim() || "(no details)";
}
