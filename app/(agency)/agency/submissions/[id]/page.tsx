import Link from "next/link";
import { MailOpen } from "lucide-react";
import { notFound } from "next/navigation";
import { requireAgency } from "@/lib/guards";
import { prisma } from "@/lib/prisma";
import { isR2Configured, signedFileUrl } from "@/lib/r2";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SubmissionDetail } from "@/components/submissions/submission-detail";
import { DeliveryLog } from "@/components/submissions/delivery-log";
import { markRead, resendDelivery, setSubmissionStatus } from "../actions";
import { submissionLabel } from "@/lib/submissions";
import { DeleteSubmissionButton } from "./delete-submission";

export const metadata = { title: "Submission · FormHub" };

export default async function AgencySubmissionPage({
  params,
}: PageProps<"/agency/submissions/[id]">) {
  const { id } = await params;
  const { agencyId } = await requireAgency();

  const submission = await prisma.submission.findFirst({
    where: { id, agencyId },
    include: {
      form: { select: { name: true } },
      site: { select: { name: true } },
      files: true,
      jobs: {
        orderBy: { createdAt: "asc" },
        include: { attemptLog: { orderBy: { attemptNo: "asc" } } },
      },
    },
  });

  if (!submission) notFound();

  // Opening a new submission marks it read.
  await markRead(submission.id, agencyId);

  // markRead has just flipped NEW -> READ, but `submission` was read before
  // that, so rendering from it would hide "Mark as unread" on first open.
  const status = submission.status === "NEW" ? "READ" : submission.status;

  const fileUrls: Record<string, string> = {};
  if (isR2Configured()) {
    for (const file of submission.files) {
      fileUrls[file.id] = await signedFileUrl(file.r2Key, 3600);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/agency/submissions"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          ← Back to submissions
        </Link>
        <div className="flex gap-2">
          {status === "SPAM" ? (
            <form action={setSubmissionStatus}>
              <input type="hidden" name="id" value={submission.id} />
              <input type="hidden" name="status" value="READ" />
              <Button type="submit" variant="outline" size="sm">
                Not spam
              </Button>
            </form>
          ) : (
            <form action={setSubmissionStatus}>
              <input type="hidden" name="id" value={submission.id} />
              <input type="hidden" name="status" value="SPAM" />
              <Button type="submit" variant="outline" size="sm">
                Mark as spam
              </Button>
            </form>
          )}
          {/* Always available: opening the page has already marked it read. */}
          <form action={setSubmissionStatus}>
            <input type="hidden" name="id" value={submission.id} />
            <input type="hidden" name="status" value="NEW" />
            <Button type="submit" variant="outline" size="sm">
              <MailOpen className="size-4" />
              Mark as unread
            </Button>
          </form>
          <form action={setSubmissionStatus}>
            <input type="hidden" name="id" value={submission.id} />
            <input
              type="hidden"
              name="status"
              value={status === "ARCHIVED" ? "READ" : "ARCHIVED"}
            />
            <Button type="submit" variant="outline" size="sm">
              {status === "ARCHIVED" ? "Unarchive" : "Archive"}
            </Button>
          </form>
          <DeleteSubmissionButton
            id={submission.id}
            label={submissionLabel(submission.data, submission.subjectPreview)}
            fileCount={submission.files.length}
          />
        </div>
      </div>

      <SubmissionDetail submission={submission} fileUrls={fileUrls} />

      <Card>
        <CardHeader>
          <CardTitle>Delivery</CardTitle>
        </CardHeader>
        <CardContent>
          <DeliveryLog
            jobs={submission.jobs}
            submissionId={submission.id}
            resendAction={resendDelivery}
          />
        </CardContent>
      </Card>
    </div>
  );
}
