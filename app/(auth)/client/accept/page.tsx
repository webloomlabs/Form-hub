import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { acceptInvite, lookupInvite } from "./actions";
import { AcceptForm } from "./accept-form";

export const metadata = { title: "Accept invite · FormHub" };

export default async function AcceptInvitePage({
  searchParams,
}: PageProps<"/client/accept">) {
  const { token } = await searchParams;
  const raw = typeof token === "string" ? token : "";
  const invite = await lookupInvite(raw);

  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Set your password</CardTitle>
          {invite.valid ? (
            <CardDescription>
              You&apos;ve been invited to view enquiries for {invite.clientName}.
            </CardDescription>
          ) : null}
        </CardHeader>
        <CardContent>
          {invite.valid ? (
            <AcceptForm action={acceptInvite} token={raw} email={invite.email} />
          ) : (
            <Alert variant="destructive">
              <AlertDescription>{invite.reason}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
