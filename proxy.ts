import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig, isPublicPath, portalForPath } from "@/auth.config";

// Next 16 renamed `middleware.ts` to `proxy.ts`. Same semantics.
// Only the edge-safe half of the auth config is imported here — pulling in
// `auth.ts` (and therefore Prisma/bcrypt) would break the edge build.
const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const user = req.auth?.user;

  if (isPublicPath(pathname)) {
    // Already signed in and sitting on a login page? Send them home.
    if (user && (pathname === "/agency/login" || pathname === "/client/login")) {
      const home = user.role === "CLIENT" ? "/client" : "/agency";
      return NextResponse.redirect(new URL(home, req.nextUrl));
    }
    return NextResponse.next();
  }

  const portal = portalForPath(pathname);
  if (!portal) return NextResponse.next();

  if (!user) {
    const loginUrl = new URL(`/${portal}/login`, req.nextUrl);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // A signed-in user poking at the other portal gets bounced to their own.
  const userPortal = user.role === "CLIENT" ? "client" : "agency";
  if (userPortal !== portal) {
    return NextResponse.redirect(new URL(`/${userPortal}`, req.nextUrl));
  }

  return NextResponse.next();
});

export const config = {
  // Skip static assets and image optimisation; everything else passes through.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|svg|ico)$).*)"],
};
