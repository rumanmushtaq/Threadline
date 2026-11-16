import { NextResponse, type NextRequest } from "next/server";

// Optimistic check only: real session validation happens on the server for every page and action.
export function proxy(request: NextRequest) {
  if (!request.cookies.has("tl_session")) {
    const url = new URL("/login", request.url);
    if (request.nextUrl.pathname !== "/") url.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
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
