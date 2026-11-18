import type { SupabaseClient } from "@supabase/supabase-js";
import { and, count, eq, gt, sql } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "../db";
import { rateLimitEvents, users } from "../db/schema";

export const forgotPasswordSchema = z.object({
  email: z.email("Enter a valid email").max(254).transform((v) => v.trim().toLowerCase()),
});

const HOUR_MS = 60 * 60 * 1000;
const PER_IP = 5;
const PER_EMAIL = 3;

/** Counts and records one use of `key`; false when the hourly limit is reached. */
async function allow(db: Database, key: string, limit: number) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${key}))`);
    const [{ n }] = await tx
      .select({ n: count() })
      .from(rateLimitEvents)
      .where(and(eq(rateLimitEvents.key, key), gt(rateLimitEvents.createdAt, new Date(Date.now() - HOUR_MS))));
    if (n >= limit) return false;
    await tx.insert(rateLimitEvents).values({ key });
    return true;
  });
}

/**
 * Sends a Supabase password-reset email, but only to an active Threadline account.
 * The caller always shows the same answer, so nobody can find out which emails exist.
 * `supabase` must be bound to the browser's cookies: the link is completed in that browser.
 */
export async function requestPasswordReset(
  db: Database,
  supabase: SupabaseClient,
  email: string,
  meta: { ip: string; appUrl: string },
) {
  if (!(await allow(db, `reset:ip:${meta.ip}`, PER_IP)) || !(await allow(db, `reset:email:${email}`, PER_EMAIL))) return;
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(sql`lower(${users.email})`, email), eq(users.isActive, true)))
    .limit(1);
  if (!user) return;
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${meta.appUrl}/auth/confirm?next=/reset-password`,
  });
  if (error) console.error("[auth] password reset email failed", error.status, error.code, error.message);
}
