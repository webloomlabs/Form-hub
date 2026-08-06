import Link from "next/link";
import { notFound } from "next/navigation";
import { requireClient } from "@/lib/guards";
import { prisma } from "@/lib/prisma";
import { isR2Configured, signedFileUrl } from "@/lib/r2";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SubmissionDetail } from "@/components/submissions/submission-detail";
import { DeliveryLog } from "@/components/submissions/delivery-log";
import { markClientRead, setClientSubmissionStatus } from "../actions";

export const metadata = { title: "Enquiry · FormHub" };

export default async function ClientSubmissionPage({
  params,
}: PageProps<"/client/submissions/[id]">) {
  const { id } = await params;
  const { agencyId, clientId } = await requireClient();

  const submission = await prisma.submission.findFirst({
    where: { id, agencyId, site: { clientId } },
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

  await markClientRead(submission.id, agencyId, clientId);

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
          href="/client"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          ← Back to enquiries
        </Link>
        <div className="flex gap-2">
          {submission.status === "SPAM" ? (
            <form action={setClientSubmissionStatus}>
              <input type="hidden" name="id" value={submission.id} />
              <input type="hidden" name="status" value="READ" />
              <Button type="submit" variant="outline" size="sm">
                Not spam
              </Button>
            </form>
          ) : (
            <form action={setClientSubmissionStatus}>
              <input type="hidden" name="id" value={submission.id} />
              <input type="hidden" name="status" value="SPAM" />
              <Button type="submit" variant="outline" size="sm">
                Mark as spam
              </Button>
            </form>
          )}
          <form action={setClientSubmissionStatus}>
            <input type="hidden" name="id" value={submission.id} />
            <input
              type="hidden"
              name="status"
              value={submission.status === "ARCHIVED" ? "READ" : "ARCHIVED"}
            />
            <Button type="submit" variant="outline" size="sm">
              {submission.status === "ARCHIVED" ? "Unarchive" : "Archive"}
            </Button>
          </form>
        </div>
      </div>

      <SubmissionDetail submission={submission} fileUrls={fileUrls} />

      <Card>
        <CardHeader>
          <CardTitle>Notifications</CardTitle>
        </CardHeader>
        <CardContent>
          {/* No resendAction: only the agency can retry delivery. */}
          <DeliveryLog jobs={submission.jobs} submissionId={submission.id} />
        </CardContent>
      </Card>
    </div>
  );
}
