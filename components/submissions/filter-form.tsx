"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { FilterOption, FormFilterOption } from "@/lib/submissions";

/**
 * The site/form/search row. A plain GET form, so every view stays a shareable
 * URL and still works with client JS off — the Search button submits all three
 * at once. The one thing JS adds is submitting the moment a dropdown changes,
 * which is what people expect a filter to do.
 *
 * `cursor` is deliberately absent: changing a filter must start at page one.
 */
export function FilterForm({
  basePath,
  status,
  q,
  siteId,
  formId,
  sites,
  forms,
}: {
  basePath: string;
  status: string;
  q: string;
  siteId: string;
  formId: string;
  /** Omitted for the client portal — a client only ever sees its own sites. */
  sites?: FilterOption[];
  forms: FormFilterOption[];
}) {
  // Held in state only so picking a site can narrow the form list in the same
  // render. The parent keys this component on the URL values, so a navigation
  // remounts it rather than leaving these stale.
  const [site, setSite] = useState(siteId);
  const [form, setForm] = useState(formId);

  const showSites = Boolean(sites && sites.length > 0);
  const visibleForms = site
    ? forms.filter((f) => f.siteId === site || f.id === form)
    : forms;

  const submit = (el: HTMLElement | null) => el?.closest("form")?.requestSubmit();

  const selectClass =
    "border-input dark:bg-input/30 focus-visible:ring-ring/50 h-9 max-w-45 rounded-md border bg-transparent px-2 text-sm shadow-xs outline-none focus-visible:ring-[3px]";

  return (
    <form
      action={basePath}
      method="get"
      className="flex flex-wrap items-center gap-2"
    >
      {status ? <input type="hidden" name="status" value={status} /> : null}

      {showSites ? (
        <select
          name="siteId"
          aria-label="Filter by site"
          value={site}
          onChange={(e) => {
            const next = e.target.value;
            setSite(next);
            // The old form almost certainly belongs to another site; keeping it
            // would silently AND the two into an empty list.
            setForm("");
            submit(e.target);
          }}
          className={selectClass}
        >
          <option value="">All sites</option>
          {sites?.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      ) : null}

      <select
        name="formId"
        aria-label="Filter by form"
        value={form}
        onChange={(e) => {
          setForm(e.target.value);
          submit(e.target);
        }}
        className={selectClass}
      >
        <option value="">All forms</option>
        {visibleForms.map((f) => (
          <option key={f.id} value={f.id}>
            {f.name}
          </option>
        ))}
      </select>

      <div className="flex items-center gap-2">
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
      </div>
    </form>
  );
}
