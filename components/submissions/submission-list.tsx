import Link from "next/link";
import { Inbox, Paperclip } from "lucide-react";
import { EmptyState } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { submissionLabel } from "@/lib/submissions";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export type SubmissionListItem = {
  id: string;
  createdAt: Date;
  status: string;
  spamReasons: string[];
  subjectPreview: string | null;
  submitterEmail: string | null;
  data: unknown;
  form: { id: string; name: string };
  site: { id: string; name: string };
  _count: { files: number; jobs: number };
};

function statusBadge(status: string, reasons: string[]) {
  if (status === "NEW") return <Badge>New</Badge>;
  if (status === "SPAM") {
    return (
      <Badge variant="destructive" title={reasons.join(", ")}>
        Spam
      </Badge>
    );
  }
  if (status === "ARCHIVED") return <Badge variant="outline">Archived</Badge>;
  return <Badge variant="secondary">Read</Badge>;
}

export function SubmissionList({
  items,
  basePath,
  showSite = true,
}: {
  items: SubmissionListItem[];
  /** "/agency/submissions" or "/client/submissions" */
  basePath: string;
  showSite?: boolean;
}) {
  if (items.length === 0) {
    return (
      <EmptyState
        icon={Inbox}
        title="Nothing here"
        description="No submissions match this view. Try a different filter or clear your search."
      />
    );
  }

  return (
    <div className="bg-card overflow-x-auto rounded-xl border shadow-xs">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-27.5">Status</TableHead>
            <TableHead>Submission</TableHead>
            {showSite ? (
              <TableHead className="hidden md:table-cell">Site</TableHead>
            ) : null}
            <TableHead className="hidden md:table-cell">Form</TableHead>
            <TableHead className="w-45 text-right">Received</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((s) => {
            const label = submissionLabel(s.data, s.subjectPreview);
            return (
              // `relative` anchors the stretched link below, which is what
              // makes the whole row clickable without turning this into a
              // client component or nesting interactive elements.
              <TableRow
                key={s.id}
                className="hover:bg-muted/50 focus-within:bg-muted/50 relative cursor-pointer transition-colors"
              >
                <TableCell>{statusBadge(s.status, s.spamReasons)}</TableCell>

                {/*
                  A table cell only truncates when it has a max-width, so the
                  long message bodies that used to push Site/Form off-screen
                  are clipped here instead.
                */}
                <TableCell className="max-w-55 sm:max-w-85 lg:max-w-130">
                  <Link
                    href={`${basePath}/${s.id}`}
                    title={label}
                    // after:absolute + inset-0 stretches the hit area over the
                    // entire row while keeping a real, focusable anchor.
                    className="after:absolute after:inset-0 focus-visible:outline-none"
                  >
                    <span
                      className={
                        s.status === "NEW"
                          ? "block truncate font-medium"
                          : "block truncate"
                      }
                    >
                      {label}
                    </span>
                  </Link>
                  <div className="text-muted-foreground flex items-center gap-2 text-xs">
                    {s.submitterEmail && s.submitterEmail !== label ? (
                      <span className="truncate">{s.submitterEmail}</span>
                    ) : null}
                    {s._count.files > 0 ? (
                      <span className="inline-flex shrink-0 items-center gap-1">
                        <Paperclip className="size-3" />
                        {s._count.files}
                      </span>
                    ) : null}
                  </div>
                </TableCell>

                {showSite ? (
                  <TableCell className="text-muted-foreground hidden max-w-45 truncate md:table-cell">
                    {s.site.name}
                  </TableCell>
                ) : null}
                <TableCell className="text-muted-foreground hidden max-w-45 truncate md:table-cell">
                  {s.form.name}
                </TableCell>
                <TableCell className="text-muted-foreground text-right text-sm whitespace-nowrap tabular-nums">
                  {s.createdAt.toLocaleString()}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
