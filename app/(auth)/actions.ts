"use server";

import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { z } from "zod";
import { signIn } from "@/auth";

export type LoginState = {
  message?: string;
  errors?: { email?: string[]; password?: string[] };
  values?: { email?: string };
};

const schema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(1, "Enter your password"),
  portal: z.enum(["agency", "client"]),
  next: z.string().optional(),
});

/**
 * Shared by both login pages. `portal` decides which roles `authorize()`
 * will accept, so a client cannot sign in through the agency page.
 */
export async function loginAction(
  _state: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const flat = z.flattenError(parsed.error);
    return {
      errors: flat.fieldErrors,
      values: { email: String(formData.get("email") ?? "") },
    };
  }

  const { email, password, portal, next } = parsed.data;

  try {
    await signIn("credentials", {
      email,
      password,
      portal,
      redirect: false,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      // Deliberately vague: never reveal whether the account exists or
      // whether it simply belongs to the other portal.
      return {
        message: "Incorrect email or password.",
        values: { email },
      };
    }
    throw error;
  }

  // `redirect` throws, so it must sit outside the try/catch.
  const fallback = portal === "client" ? "/client" : "/agency";
  // Must be a same-origin absolute path. "//evil.com" is protocol-relative
  // and would leave the site, so a single leading slash is not enough.
  const safeNext =
    next && next.startsWith("/") && !next.startsWith("//") ? next : null;
  redirect(safeNext ?? fallback);
}
