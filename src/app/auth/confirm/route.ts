import type { EmailOtpType } from "@supabase/supabase-js";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { safeNextPath } from "@/lib/safe-next";
import { db } from "@/server/db";
import { users } from "@/server/db/schema";
import { supabaseServer } from "@/server/supabase/next";

const EMAIL_LINK_TYPES: EmailOtpType[] = ["recovery", "signup", "email", "magiclink", "email_change"];

/**
 * Where Supabase sends people back to: email links (password reset, sign-up confirmation)
 * and "Continue with Google". Accepted forms:
 * - `?token_hash=…&type=…` (recommended email templates; works in any browser)
 * - `?code=…` (Supabase's default links and Google; must finish in the browser that started)
 * The browser is signed in and sent on to `next`.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const next = safeNextPath(params.get("next"), "/shop");
  const shopper = !next.startsWith("/reset-password");
  const failed = shopper ? `/account/login?error=link&next=${encodeURIComponent(next.startsWith("/account/") ? "/shop" : next)}` : "/forgot-password?error=expired";

  const tokenHash = params.get("token_hash");
  const type = params.get("type") as EmailOtpType | null;
  const code = params.get("code");
  const supabase = await supabaseServer();

  let ok = false;
  let userId: string | undefined;
  let viaGoogle = false;
  if (tokenHash && type && EMAIL_LINK_TYPES.includes(type)) {
    const { data, error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    ok = !error;
    userId = data.user?.id;
  } else if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    ok = !error;
    userId = data.user?.id;
    viaGoogle = data.session?.user.app_metadata?.provider === "google" || !!data.user?.identities?.some((i) => i.provider === "google");
  }
  if (!ok || !userId) redirect(failed);

  const [team] = await db.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1);
  // Team accounts sign in with their password only. If a team member's email is also used
  // with Google on the shop, that Google session must not open the team area.
  if (team && viaGoogle) {
    await supabase.auth.signOut({ scope: "local" });
    redirect("/account/login?error=team");
  }
  // Supabase has one reset-email template for everyone: send each person to their own page.
  if (type === "recovery" || next.endsWith("/reset-password")) redirect(team ? "/reset-password" : "/account/reset-password");
  redirect(next);
}
