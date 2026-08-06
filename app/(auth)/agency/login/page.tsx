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

export const metadata = { title: "Agency sign in · FormHub" };

export default async function AgencyLoginPage({
  searchParams,
}: PageProps<"/agency/login">) {
  const { next } = await searchParams;

  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Agency sign in</CardTitle>
          <CardDescription>
            Manage your clients, sites and form endpoints.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <LoginForm
            action={loginAction}
            portal="agency"
            next={typeof next === "string" ? next : undefined}
          />
          <p className="text-sm text-muted-foreground">
            Are you a website owner?{" "}
            <Link href="/client/login" className="underline underline-offset-4">
              Sign in here
            </Link>
            .
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
