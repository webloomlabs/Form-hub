import { AlertTriangle, CheckCircle2, Clock, RotateCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export type DeliveryJobView = {
  id: string;
  kind: string;
  status: string;
  attempts: number;
  maxAttempts: number;
  runAfter: Date;
  lastError: string | null;
  attemptLog: {
    id: string;
    attemptNo: number;
    status: string;
    startedAt: Date;
    finishedAt: Date | null;
    error: string | null;
    responseCode: number | null;
  }[];
};

function StatusIcon({ status }: { status: string }) {
  if (status === "SUCCEEDED")
    return <CheckCircle2 className="size-4 text-muted-foreground" />;
  if (status === "DEAD") return <AlertTriangle className="size-4 text-destructive" />;
  return <Clock className="size-4 text-muted-foreground" />;
}

function statusBadge(status: string) {
  if (status === "SUCCEEDED") return <Badge variant="secondary">Delivered</Badge>;
  if (status === "DEAD") return <Badge variant="destructive">Failed</Badge>;
  if (status === "PROCESSING") return <Badge variant="outline">Sending…</Badge>;
  return <Badge variant="outline">Queued</Badge>;
}

/**
 * The whole point of the delivery log: every attempt is visible, so a failure
 * is something you can see and act on rather than something you discover when
 * a client complains.
 */
export function DeliveryLog({
  jobs,
  submissionId,
  resendAction,
}: {
  jobs: DeliveryJobView[];
  submissionId: string;
  /** Omitted for the client portal, which can view but not resend. */
  resendAction?: (formData: FormData) => Promise<void>;
}) {
  if (jobs.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No delivery was queued for this submission — it was filed as spam, or the
        form has no recipients.
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {jobs.map((job) => (
        <li key={job.id} className="rounded-md border">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
            <div className="flex items-center gap-2">
              <StatusIcon status={job.status} />
              <span className="text-sm font-medium">
                {job.kind === "EMAIL_ALERT" ? "Email alert" : "Webhook forward"}
              </span>
              {statusBadge(job.status)}
              <span className="text-xs text-muted-foreground">
                attempt {job.attempts} of {job.maxAttempts}
              </span>
            </div>
            {resendAction && job.status !== "SUCCEEDED" ? (
              <form action={resendAction}>
                <input type="hidden" name="jobId" value={job.id} />
                <input type="hidden" name="submissionId" value={submissionId} />
                <Button type="submit" size="sm" variant="outline">
                  <RotateCw className="size-4" />
                  Resend now
                </Button>
              </form>
            ) : null}
          </div>

          {job.status === "PENDING" && job.attempts > 0 ? (
            <p className="border-b px-4 py-2 text-xs text-muted-foreground">
              Next retry at {job.runAfter.toLocaleString()}
            </p>
          ) : null}

          {job.attemptLog.length > 0 ? (
            <ol className="divide-y text-xs">
              {job.attemptLog.map((a) => (
                <li key={a.id} className="flex gap-3 px-4 py-2">
                  <span className="w-6 shrink-0 tabular-nums text-muted-foreground">
                    #{a.attemptNo}
                  </span>
                  <span
                    className={
                      a.status === "SUCCEEDED"
                        ? "w-20 shrink-0 text-muted-foreground"
                        : "w-20 shrink-0 text-destructive"
                    }
                  >
                    {a.status === "SUCCEEDED" ? "sent" : "failed"}
                  </span>
                  <span className="w-40 shrink-0 tabular-nums text-muted-foreground">
                    {a.startedAt.toLocaleString()}
                  </span>
                  <span className="min-w-0 flex-1 break-words text-muted-foreground">
                    {a.error ??
                      (a.responseCode ? `HTTP ${a.responseCode}` : "delivered")}
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="px-4 py-2 text-xs text-muted-foreground">
              Not attempted yet.
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}
