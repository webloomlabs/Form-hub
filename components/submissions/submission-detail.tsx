import { Paperclip } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export type SubmissionDetailData = {
  id: string;
  createdAt: Date;
  status: string;
  spamReasons: string[];
  uploadError: string | null;
  submitterEmail: string | null;
  ip: string | null;
  origin: string | null;
  userAgent: string | null;
  data: unknown;
  form: { name: string };
  site: { name: string };
  files: {
    id: string;
    fieldName: string;
    fileName: string;
    sizeBytes: number;
  }[];
};

function renderValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value);
}

export function SubmissionDetail({
  submission,
  fileUrls,
}: {
  submission: SubmissionDetailData;
  /** Presigned URLs keyed by file id; absent when R2 isn't configured. */
  fileUrls?: Record<string, string>;
}) {
  const data = (submission.data ?? {}) as Record<string, unknown>;
  const entries = Object.entries(data);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Submission</CardTitle>
          <CardDescription>
            {submission.site.name} · {submission.form.name} ·{" "}
            {submission.createdAt.toLocaleString()}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {submission.status === "SPAM" ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
              Filed as spam
              {submission.spamReasons.length > 0
                ? ` — ${submission.spamReasons.join(", ")}`
                : ""}
              . Mark it as not spam if this was a real enquiry.
            </div>
          ) : null}

          {submission.uploadError ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
              Attachments failed to store: {submission.uploadError}. The message
              text below was saved.
            </div>
          ) : null}

          {entries.length === 0 ? (
            <p className="text-sm text-muted-foreground">No fields.</p>
          ) : (
            <dl className="divide-y rounded-md border">
              {entries.map(([key, value]) => (
                <div
                  key={key}
                  className="grid gap-1 px-4 py-3 sm:grid-cols-[200px_1fr] sm:gap-4"
                >
                  <dt className="text-sm font-medium break-words">{key}</dt>
                  <dd className="text-sm whitespace-pre-wrap break-words text-muted-foreground">
                    {renderValue(value)}
                  </dd>
                </div>
              ))}
            </dl>
          )}

          {submission.files.length > 0 ? (
            <div className="space-y-2">
              <p className="text-sm font-medium">Attachments</p>
              <ul className="divide-y rounded-md border">
                {submission.files.map((file) => {
                  const url = fileUrls?.[file.id];
                  return (
                    <li
                      key={file.id}
                      className="flex items-center justify-between gap-3 px-4 py-2 text-sm"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <Paperclip className="size-4 shrink-0 text-muted-foreground" />
                        <span className="truncate">{file.fileName}</span>
                        <Badge variant="outline">{file.fieldName}</Badge>
                      </span>
                      <span className="flex shrink-0 items-center gap-3">
                        <span className="tabular-nums text-muted-foreground">
                          {Math.ceil(file.sizeBytes / 1024)} KB
                        </span>
                        {url ? (
                          <a
                            href={url}
                            className="underline underline-offset-4"
                            target="_blank"
                            rel="noreferrer"
                          >
                            Download
                          </a>
                        ) : (
                          <span className="text-muted-foreground">
                            unavailable
                          </span>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Metadata</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Reply-to</dt>
              <dd>{submission.submitterEmail ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Origin</dt>
              <dd className="break-words">{submission.origin ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">IP</dt>
              <dd>{submission.ip ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">User agent</dt>
              <dd className="break-words">{submission.userAgent ?? "—"}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
