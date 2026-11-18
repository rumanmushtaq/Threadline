import { NextResponse, type NextRequest } from "next/server";
import { supabaseForCookies } from "@/server/supabase/clients";

/** Shop pages anyone may open; signed-in shoppers still get their session refreshed there. */
const PUBLIC = ["/", "/shop", "/p/", "/account"];

/**
 * Keeps the Supabase session fresh: an expired access token is refreshed here and the new
 * cookies go both to the page being rendered and back to the browser (Server Components
 * cannot set cookies). On team pages it also sends visitors without a session to the team
 * login — an early redirect only; every page and action still checks on the server.
 */
export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC.some((p) => path === p || (p !== "/" && path.startsWith(p.endsWith("/") ? p : `${p}/`)));
  // Visitors without any Supabase cookie: nothing to refresh, so no call to Supabase.
  const hasSession = request.cookies.getAll().some((c) => c.name.startsWith("sb-"));
  if (isPublic && !hasSession) return NextResponse.next();

  let response = NextResponse.next({ request });
  const supabase = supabaseForCookies({
    getAll: () => request.cookies.getAll(),
    setAll: (list) => {
      for (const { name, value } of list) request.cookies.set(name, value);
      response = NextResponse.next({ request });
      for (const { name, value, options } of list) response.cookies.set(name, value, options);
    },
  });
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims && !isPublic) {
    const url = new URL("/login", request.url);
    url.searchParams.set("next", path);
    const redirect = NextResponse.redirect(url);
    // Carry over cookie changes (e.g. a dead session being cleared).
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
    return redirect;
  }
  return response;
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
    "/shop",
    "/p/:path*",
    "/account/:path*",
    "/account",
  ],
};
