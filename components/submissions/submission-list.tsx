import Link from "next/link";
import { Paperclip } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
      <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        No submissions match this view.
      </p>
    );
  }

  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[110px]">Status</TableHead>
            <TableHead>Submission</TableHead>
            {showSite ? <TableHead>Site</TableHead> : null}
            <TableHead>Form</TableHead>
            <TableHead className="w-[180px] text-right">Received</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((s) => (
            <TableRow
              key={s.id}
              className={s.status === "NEW" ? "font-medium" : undefined}
            >
              <TableCell>{statusBadge(s.status, s.spamReasons)}</TableCell>
              <TableCell>
                <Link
                  href={`${basePath}/${s.id}`}
                  className="underline-offset-4 hover:underline"
                >
                  {s.subjectPreview ?? "(no preview)"}
                </Link>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {s.submitterEmail ? <span>{s.submitterEmail}</span> : null}
                  {s._count.files > 0 ? (
                    <span className="inline-flex items-center gap-1">
                      <Paperclip className="size-3" />
                      {s._count.files}
                    </span>
                  ) : null}
                </div>
              </TableCell>
              {showSite ? (
                <TableCell className="text-muted-foreground">
                  {s.site.name}
                </TableCell>
              ) : null}
              <TableCell className="text-muted-foreground">
                {s.form.name}
              </TableCell>
              <TableCell className="text-right text-sm tabular-nums text-muted-foreground">
                {s.createdAt.toLocaleString()}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
