import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, SESSION_TTL_MS, sessionCookieOptions } from "@/lib/session-cookie";

/**
 * Optimistic check only: real session validation happens on the server for every page
 * and action. Each visit also slides the cookie's expiry forward, so active people stay
 * signed in; the database session (renewed on use) decides whether the token is valid.
 */
export function proxy(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) {
    const url = new URL("/login", request.url);
    if (request.nextUrl.pathname !== "/") url.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  const res = NextResponse.next();
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(new Date(Date.now() + SESSION_TTL_MS)));
  return res;
}

export const config = {
  matcher: [
    "/",
    "/dashboard/:path*",
    "/products/:path*",
    "/inventory/:path*",
    "/ai-images/:path*",
    "/links/:path*",
    "/orders/:path*",
    "/customers/:path*",
    "/activity/:path*",
    "/users/:path*",
    "/settings/:path*",
  ],
};
