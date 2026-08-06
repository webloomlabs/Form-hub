import { z } from "zod";
import { AuthError } from "@/lib/guards";

/** The shape every server action returns, for `useActionState`. */
export type ActionState = {
  ok?: boolean;
  message?: string;
  errors?: Record<string, string[] | undefined>;
};

export function fieldErrors(error: z.ZodError): ActionState {
  return { errors: z.flattenError(error).fieldErrors };
}

/**
 * Wraps an action body so a guard rejection becomes a message rather than an
 * unhandled server error. Anything else still throws — an unexpected failure
 * should not be quietly rendered as a form validation message.
 */
export async function withAction(
  fn: () => Promise<ActionState>,
): Promise<ActionState> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof AuthError) {
      return { ok: false, message: error.message };
    }
    throw error;
  }
}
