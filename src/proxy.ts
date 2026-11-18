import { NextResponse, type NextRequest } from "next/server";
import { supabaseForCookies } from "@/server/supabase/clients";

/**
 * Keeps the Supabase session fresh: an expired access token is refreshed here and the new
 * cookies go both to the page being rendered and back to the browser (Server Components
 * cannot set cookies). This is only an early redirect for visitors without a session;
 * every page and action still verifies the session and the account on the server.
 */
export async function proxy(request: NextRequest) {
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
  if (!data?.claims) {
    const url = new URL("/login", request.url);
    if (request.nextUrl.pathname !== "/") url.searchParams.set("next", request.nextUrl.pathname);
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
  ],
};
