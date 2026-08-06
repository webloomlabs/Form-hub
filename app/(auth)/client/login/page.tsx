import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { loginAction } from "../../actions";
import { LoginForm } from "../../login-form";

export const metadata = { title: "Website owner sign in · FormHub" };

export default async function ClientLoginPage({
  searchParams,
}: PageProps<"/client/login">) {
  const { next } = await searchParams;

  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Website owner sign in</CardTitle>
          <CardDescription>
            View the enquiries submitted through your website.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <LoginForm
            action={loginAction}
            portal="client"
            next={typeof next === "string" ? next : undefined}
          />
          <p className="text-sm text-muted-foreground">
            Work at the agency?{" "}
            <Link href="/agency/login" className="underline underline-offset-4">
              Sign in here
            </Link>
            .
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
