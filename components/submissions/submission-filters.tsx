import Link from "next/link";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
  counts,
}: {
  basePath: string;
  status: string;
  q: string;
  counts: Record<string, number>;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <nav className="flex flex-wrap gap-1">
        {TABS.map((tab) => {
          const active = status === tab.key;
          const href = tab.key ? `${basePath}?status=${tab.key}` : basePath;
          const count = tab.key === "SPAM" ? counts.SPAM : undefined;
          return (
            <Button
              key={tab.key || "inbox"}
              size="sm"
              variant={active ? "secondary" : "ghost"}
              render={<Link href={href} />}
            >
              {tab.label}
              {count ? (
                <span className="ml-1 tabular-nums text-muted-foreground">
                  {count}
                </span>
              ) : null}
            </Button>
          );
        })}
      </nav>

      <form action={basePath} method="get" className="flex items-center gap-2">
        {status ? <input type="hidden" name="status" value={status} /> : null}
        <Input
          name="q"
          defaultValue={q}
          placeholder="Search subject or email"
          className="h-9 w-56"
        />
        <Button type="submit" size="sm" variant="outline">
          <Search className="size-4" />
          Search
        </Button>
      </form>
    </div>
  );
}
