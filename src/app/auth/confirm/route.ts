import type { EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { safeNextPath } from "@/lib/safe-next";
import { supabaseServer } from "@/server/supabase/next";

/**
 * Where Supabase's password-reset email lands. Two link styles are accepted:
 * - `?token_hash=…&type=recovery` (recommended email template; works in any browser)
 * - `?code=…` (Supabase's default link; must be opened in the browser that asked for it)
 * Either way the browser is signed in and sent on to set a new password.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const next = safeNextPath(params.get("next"), "/reset-password");
  const tokenHash = params.get("token_hash");
  const type = params.get("type") as EmailOtpType | null;
  const code = params.get("code");
  const supabase = await supabaseServer();

  let ok = false;
  if (tokenHash && type === "recovery") {
    ok = !(await supabase.auth.verifyOtp({ type, token_hash: tokenHash })).error;
  } else if (code) {
    ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
  }
  redirect(ok ? next : "/forgot-password?error=expired");
}
