import type { AuthError, SupabaseClient } from "@supabase/supabase-js";
import { and, count, eq, gt, sql } from "drizzle-orm";
import { z } from "zod";
import { logActivity } from "../activity";
import type { Database } from "../db";
import { loginAttempts, users } from "../db/schema";
import { AppError } from "../errors";
import { supabaseStateless } from "../supabase/clients";

export const loginSchema = z.object({
  email: z.email("Enter a valid email").max(254).transform((v) => v.trim().toLowerCase()),
  password: z.string().min(1, "Enter your password").max(200),
});

const WINDOW_MS = 15 * 60 * 1000;
const TRUSTED_MS = 30 * 24 * 60 * 60 * 1000;
/** Failures allowed from one connection for one email. */
const MAX_PER_IP = 5;
/** Failures allowed for one email from connections that never signed in to it before. */
const MAX_PER_EMAIL = 20;

const INVALID = "Email or password is incorrect.";
/** Supabase answers that mean "these credentials do not sign in" (a banned account looks like a wrong password). */
const CREDENTIAL_ERRORS = new Set(["invalid_credentials", "user_banned", "email_not_confirmed", "user_not_found", "validation_failed"]);

/**
 * Reserves a login attempt. Runs under a short per-email lock so parallel requests cannot
 * all pass the limit check, and records the attempt as a failure before the password is
 * checked (it is flipped to success afterwards). The call to Supabase happens outside
 * any transaction, so no database connection waits on it.
 */
async function reserveAttempt(db: Database, email: string, ip: string) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"login:" + email}))`);
    const since = new Date(Date.now() - WINDOW_MS);
    const failed = and(eq(loginAttempts.email, email), eq(loginAttempts.success, false), gt(loginAttempts.createdAt, since));
    const [[{ fromIp }], [{ total }], [{ trusted }]] = await Promise.all([
      tx.select({ fromIp: count() }).from(loginAttempts).where(and(failed, eq(loginAttempts.ip, ip))),
      tx.select({ total: count() }).from(loginAttempts).where(failed),
      tx
        .select({ trusted: count() })
        .from(loginAttempts)
        .where(and(eq(loginAttempts.email, email), eq(loginAttempts.ip, ip), eq(loginAttempts.success, true), gt(loginAttempts.createdAt, new Date(Date.now() - TRUSTED_MS)))),
    ]);
    // Guessing from many connections locks the email, except for connections that signed
    // in successfully before, so an attacker cannot lock the real owner out.
    if (fromIp >= MAX_PER_IP || (total >= MAX_PER_EMAIL && trusted === 0)) return null;
    const [row] = await tx.insert(loginAttempts).values({ email, ip, success: false }).returning({ id: loginAttempts.id });
    return row.id;
  });
}

/** Turns a Supabase sign-in error into the message the person sees. */
async function signInFailed(db: Database, attemptId: number, error: AuthError | null): Promise<never> {
  if (!error || CREDENTIAL_ERRORS.has(error.code ?? "") || error.status === 400) {
    throw new AppError(INVALID, "UNAUTHENTICATED");
  }
  // Supabase is down or rate limited: not the person's fault, so it must not count towards a lockout.
  await db.delete(loginAttempts).where(eq(loginAttempts.id, attemptId));
  console.error("[auth] Supabase sign-in failed", error.status, error.code, error.message);
  throw new AppError("Sign-in is unavailable right now. Try again in a minute.", "UNAVAILABLE");
}

/**
 * Signs in with Supabase Auth. `supabase` stores the session in the browser's cookies.
 * Only people with an active Threadline account (one of the four slots) get in.
 */
export async function login(
  db: Database,
  supabase: SupabaseClient,
  input: z.infer<typeof loginSchema>,
  meta: { ip: string; userAgent?: string | null },
) {
  const attemptId = await reserveAttempt(db, input.email, meta.ip);
  if (attemptId === null) throw new AppError("Too many failed attempts. Try again in 15 minutes.", "RATE_LIMITED");

  const { data, error } = await supabase.auth.signInWithPassword({ email: input.email, password: input.password });
  if (error || !data.user) return signInFailed(db, attemptId, error);

  const [user] = await db.select().from(users).where(eq(users.id, data.user.id)).limit(1);
  if (!user || !user.isActive) {
    await supabase.auth.signOut({ scope: "local" });
    throw new AppError(INVALID, "UNAUTHENTICATED");
  }

  await db.update(loginAttempts).set({ success: true }).where(eq(loginAttempts.id, attemptId));
  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
  await logActivity(db, { userId: user.id, action: "user.login", entityType: "user", entityId: user.id, ip: meta.ip });
  return { id: user.id, role: user.role };
}

/**
 * Checks a signed-in person's current password (e.g. before changing it) with the same
 * lockout as the login form. The check uses a throwaway session that is ended at once.
 */
export async function verifyPassword(db: Database, email: string, password: string, ip: string) {
  const attemptId = await reserveAttempt(db, email, ip);
  if (attemptId === null) throw new AppError("Too many failed attempts. Try again in 15 minutes.", "RATE_LIMITED");
  const probe = supabaseStateless();
  const { data, error } = await probe.auth.signInWithPassword({ email, password });
  if (error || !data.session) {
    try {
      await signInFailed(db, attemptId, error);
    } catch (err) {
      if (err instanceof AppError && err.code === "UNAUTHENTICATED") {
        throw new AppError("Your current password is incorrect.", "VALIDATION", { current: ["Incorrect password"] });
      }
      throw err;
    }
  }
  await probe.auth.signOut({ scope: "local" });
  await db.update(loginAttempts).set({ success: true }).where(eq(loginAttempts.id, attemptId));
}
