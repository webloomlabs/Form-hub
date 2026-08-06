/**
 * CSV export for submissions.
 *
 * Submissions are schemaless — each form has whatever fields the site chose —
 * so the column set is the union of every key across the rows being exported.
 */

function escapeCell(value: string): string {
  // Leading =, +, -, @ are interpreted as formulas by Excel/Sheets. Prefixing
  // with a single quote neutralises that without mangling the visible text.
  const guarded = /^[=+\-@]/.test(value) ? `'${value}` : value;
  if (/[",\n\r]/.test(guarded)) {
    return `"${guarded.replace(/"/g, '""')}"`;
  }
  return guarded;
}

function cellFor(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.join("; ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export type CsvSubmission = {
  id: string;
  createdAt: Date;
  status: string;
  submitterEmail: string | null;
  form: { name: string };
  site: { name: string };
  data: unknown;
};

export function submissionsToCsv(submissions: CsvSubmission[]): string {
  const dataKeys = new Set<string>();
  for (const s of submissions) {
    if (s.data && typeof s.data === "object" && !Array.isArray(s.data)) {
      for (const key of Object.keys(s.data as Record<string, unknown>)) {
        dataKeys.add(key);
      }
    }
  }
  const fieldColumns = [...dataKeys].sort();

  const header = [
    "id",
    "received_at",
    "status",
    "site",
    "form",
    "submitter_email",
    ...fieldColumns,
  ];

  const lines = [header.map(escapeCell).join(",")];

  for (const s of submissions) {
    const data = (s.data ?? {}) as Record<string, unknown>;
    const row = [
      s.id,
      s.createdAt.toISOString(),
      s.status,
      s.site.name,
      s.form.name,
      s.submitterEmail ?? "",
      ...fieldColumns.map((key) => cellFor(data[key])),
    ];
    lines.push(row.map((c) => escapeCell(cellFor(c))).join(","));
  }

  // CRLF and a BOM so Excel opens UTF-8 correctly.
  return `﻿${lines.join("\r\n")}\r\n`;
}
