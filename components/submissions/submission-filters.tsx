import { ButtonLink } from "@/components/button-link";
import { FilterForm } from "@/components/submissions/filter-form";
import type { FilterOption, FormFilterOption } from "@/lib/submissions";

const TABS = [
  { key: "", label: "Inbox" },
  { key: "NEW", label: "New" },
  { key: "ARCHIVED", label: "Archived" },
  { key: "SPAM", label: "Spam" },
  { key: "ALL", label: "All" },
] as const;

/**
 * Filters are plain links and a GET form so every view is a shareable,
 * bookmarkable URL — and so the whole thing works without client JS.
 */
export function SubmissionFilters({
  basePath,
  status,
  q,
  siteId = "",
  formId = "",
  sites,
  forms = [],
  counts,
}: {
  basePath: string;
  status: string;
  q: string;
  siteId?: string;
  formId?: string;
  /** Agency only — a client's submissions are already one client's sites. */
  sites?: FilterOption[];
  forms?: FormFilterOption[];
  counts: Record<string, number>;
}) {
  return (
    <div className="bg-card flex flex-wrap items-center justify-between gap-3 rounded-xl border p-2 shadow-xs">
      <nav className="flex flex-wrap gap-1">
        {TABS.map((tab) => {
          const active = status === tab.key;
          // Switching tabs keeps the site/form/search you were looking at —
          // the status is one axis of the view, not a reset button.
          const params = new URLSearchParams();
          if (tab.key) params.set("status", tab.key);
          if (siteId) params.set("siteId", siteId);
          if (formId) params.set("formId", formId);
          if (q) params.set("q", q);
          const query = params.toString();
          const count = tab.key === "SPAM" ? counts.SPAM : undefined;
          return (
            <ButtonLink
              key={tab.key || "inbox"}
              size="sm"
              variant={active ? "secondary" : "ghost"}
              href={query ? `${basePath}?${query}` : basePath}
            >
              {tab.label}
              {count ? (
                <span className="text-muted-foreground ml-1 tabular-nums">
                  {count}
                </span>
              ) : null}
            </ButtonLink>
          );
        })}
      </nav>

      <FilterForm
        // Remount on navigation so the dropdowns re-seed from the URL rather
        // than holding the values from before the last submit.
        key={`${siteId}|${formId}`}
        basePath={basePath}
        status={status}
        q={q}
        siteId={siteId}
        formId={formId}
        sites={sites}
        forms={forms}
      />
    </div>
  );
}
