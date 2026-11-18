import type { SupabaseClient } from "@supabase/supabase-js";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "../db";
import { customerAccounts, users } from "../db/schema";
import { allowPerHour } from "../rate-limit";

export const forgotPasswordSchema = z.object({
  email: z.email("Enter a valid email").max(254).transform((v) => v.trim().toLowerCase()),
});

const PER_IP = 5;
const PER_EMAIL = 3;

/** Where each kind of account finishes the reset: the team and shoppers have separate pages. */
const RESET_PAGE = { staff: "/reset-password", customer: "/account/reset-password" } as const;

/**
 * Sends a Supabase password-reset email, but only to an existing account of that kind
 * (an active team account, or a shopper account). The caller always shows the same answer,
 * so nobody can find out which emails exist. `supabase` must be bound to the browser's
 * cookies: the link is completed in that browser.
 */
export async function requestPasswordReset(
  db: Database,
  supabase: SupabaseClient,
  email: string,
  meta: { ip: string; appUrl: string; kind?: keyof typeof RESET_PAGE },
) {
  const kind = meta.kind ?? "staff";
  if (!(await allowPerHour(db, `reset:ip:${meta.ip}`, PER_IP)) || !(await allowPerHour(db, `reset:email:${email}`, PER_EMAIL))) return;
  const [account] =
    kind === "staff"
      ? await db.select({ id: users.id }).from(users).where(and(eq(sql`lower(${users.email})`, email), eq(users.isActive, true))).limit(1)
      : await db.select({ id: customerAccounts.id }).from(customerAccounts).where(eq(sql`lower(${customerAccounts.email})`, email)).limit(1);
  if (!account) return;
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${meta.appUrl}/auth/confirm?next=${RESET_PAGE[kind]}`,
  });
  if (error) console.error("[auth] password reset email failed", error.status, error.code, error.message);
}
