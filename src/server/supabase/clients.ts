import { createServerClient, type CookieMethodsServer, type CookieOptions } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase Auth settings. The keys come from Project Settings → API Keys; the legacy
 * anon / service_role names are accepted too. Only the server talks to Supabase, so
 * none of this is sent to the browser.
 */
export function supabaseConfig() {
  const url = process.env.SUPABASE_URL;
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !publishableKey) {
    throw new Error("Supabase Auth is not configured: set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY (see README).");
  }
  return { url, publishableKey };
}

/** The auth cookies hold the Supabase session; scripts in the page never need to read them. */
export const authCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
};

/** A Supabase client whose session lives in the given cookies (request cookies, or a test jar). */
export function supabaseForCookies(cookies: CookieMethodsServer) {
  const { url, publishableKey } = supabaseConfig();
  return createServerClient(url, publishableKey, { cookies, cookieOptions: authCookieOptions });
}

/** A client that keeps its session in memory only, for checking a password without signing the browser in. */
export function supabaseStateless() {
  const { url, publishableKey } = supabaseConfig();
  return createClient(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

let admin: SupabaseClient | undefined;

/** Service client for account management (create, ban, set password). Server only. */
export function supabaseAdmin() {
  if (!admin) {
    const { url } = supabaseConfig();
    const secretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!secretKey) throw new Error("Set SUPABASE_SECRET_KEY to manage accounts (see README).");
    admin = createClient(url, secretKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  }
  return admin.auth.admin;
}
