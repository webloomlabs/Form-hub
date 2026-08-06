import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authConfig } from "@/auth.config";

/**
 * NODE half of the auth setup: providers + database access.
 * Never import this from `proxy.ts` — see auth.config.ts.
 *
 * Sessions are JWT-only and the sole provider is Credentials, so no
 * @auth/prisma-adapter is wired up: it would sit unused and would force
 * Account/Session/VerificationToken tables into the schema for nothing.
 * Adding an OAuth provider later means adding those models and the adapter.
 */

class InvalidLogin extends CredentialsSignin {
  code = "invalid_credentials";
}

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  portal: z.enum(["agency", "client"]),
});

/** Which roles may enter through which login page. */
const PORTAL_ROLES = {
  agency: ["SUPER_ADMIN", "AGENCY_OWNER", "AGENCY_STAFF"],
  client: ["CLIENT"],
} as const;

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: {},
        password: {},
        portal: {},
      },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) throw new InvalidLogin();
        const { email, password, portal } = parsed.data;

        const user = await prisma.user.findUnique({
          where: { email: email.toLowerCase().trim() },
          include: { agency: true, client: true },
        });

        // Always run a hash comparison so a missing user and a wrong password
        // take the same amount of time.
        const hash =
          user?.passwordHash ??
          "$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinv";
        const ok = await bcrypt.compare(password, hash);
        if (!user || !user.passwordHash || !ok) throw new InvalidLogin();

        // A client must not be able to sign in through the agency portal,
        // and vice versa.
        const allowed = PORTAL_ROLES[portal] as readonly string[];
        if (!allowed.includes(user.role)) throw new InvalidLogin();

        if (user.agency && user.agency.status !== "ACTIVE") throw new InvalidLogin();
        if (user.client && user.client.status !== "ACTIVE") throw new InvalidLogin();

        await prisma.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        });

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          agencyId: user.agencyId,
          clientId: user.clientId,
        };
      },
    }),
  ],
});
