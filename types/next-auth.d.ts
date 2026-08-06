import type { UserRole } from "@/app/generated/prisma/enums";
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface User {
    role: UserRole;
    agencyId?: string | null;
    clientId?: string | null;
  }

  interface Session {
    user: {
      id: string;
      role: UserRole;
      agencyId: string | null;
      clientId: string | null;
    } & DefaultSession["user"];
  }
}

// `next-auth/jwt` only re-exports `@auth/core/jwt`, so augmenting it would
// declare a second, unrelated JWT interface. Augment the source module.
declare module "@auth/core/jwt" {
  interface JWT {
    role: UserRole;
    agencyId: string | null;
    clientId: string | null;
  }
}

export {};
