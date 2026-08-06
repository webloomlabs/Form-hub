import type { NextAuthConfig } from "next-auth";

/**
 * EDGE-SAFE half of the auth setup.
 *
 * This file is the ONLY thing `proxy.ts` may import. It must never reach
 * Prisma, bcrypt, nodemailer or any Node-only API, directly or transitively —
 * doing so breaks the edge build. Providers live in `auth.ts`.
 */

/** Paths reachable without a session. */
const PUBLIC_PREFIXES = [
  "/agency/login",
  "/client/login",
  "/client/accept",
  "/api/auth",
  "/api/cron",
  "/f/", // the ingest endpoint is deliberately unauthenticated
];

export function isPublicPath(pathname: string): boolean {
  if (pathname === "/") return true;
  return PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
}

/** Which portal a path belongs to, if any. */
export function portalForPath(pathname: string): "agency" | "client" | null {
  if (pathname.startsWith("/agency")) return "agency";
  if (pathname.startsWith("/client")) return "client";
  return null;
}

export const authConfig = {
  session: { strategy: "jwt" },
  pages: {
    signIn: "/agency/login",
    error: "/agency/login",
  },
  callbacks: {
    // Tenancy travels in the JWT so route guards never need a DB round-trip.
    jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.agencyId = user.agencyId ?? null;
        token.clientId = user.clientId ?? null;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub as string;
        session.user.role = token.role;
        session.user.agencyId = token.agencyId;
        session.user.clientId = token.clientId;
      }
      return session;
    },
  },
  providers: [],
} satisfies NextAuthConfig;

export default authConfig;
