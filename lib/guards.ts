import { auth } from "@/auth";

/**
 * Tenant guards. Every server action and every page that reads tenant data
 * opens with one of these — they are the single place that turns a session
 * into the ids that scope every query.
 */

export type AgencyContext = {
  userId: string;
  agencyId: string;
  role: "SUPER_ADMIN" | "AGENCY_OWNER" | "AGENCY_STAFF";
};

export type ClientContext = {
  userId: string;
  agencyId: string;
  clientId: string;
};

export class AuthError extends Error {}

export async function requireAgency(): Promise<AgencyContext> {
  const session = await auth();
  const user = session?.user;
  if (!user) throw new AuthError("Unauthenticated");
  if (user.role === "CLIENT") throw new AuthError("Forbidden: agency users only");
  if (!user.agencyId) {
    // SUPER_ADMIN has no agency of its own; it must act through one.
    throw new AuthError("No agency on session");
  }
  return {
    userId: user.id,
    agencyId: user.agencyId,
    role: user.role as AgencyContext["role"],
  };
}

/** Agency owners and super admins only — for destructive or billing-ish actions. */
export async function requireAgencyOwner(): Promise<AgencyContext> {
  const ctx = await requireAgency();
  if (ctx.role === "AGENCY_STAFF") {
    throw new AuthError("Forbidden: agency owners only");
  }
  return ctx;
}

export async function requireClient(): Promise<ClientContext> {
  const session = await auth();
  const user = session?.user;
  if (!user) throw new AuthError("Unauthenticated");
  if (user.role !== "CLIENT") throw new AuthError("Forbidden: clients only");
  if (!user.agencyId || !user.clientId) {
    throw new AuthError("Incomplete client session");
  }
  return { userId: user.id, agencyId: user.agencyId, clientId: user.clientId };
}
