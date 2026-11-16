import { and, count, eq, gt, sql } from "drizzle-orm";
import { z } from "zod";
import { logActivity } from "../activity";
import type { Database } from "../db";
import { loginAttempts, users } from "../db/schema";
import { AppError } from "../errors";
import { burnPasswordCheck, verifyPassword } from "./password";
import { createSession } from "./session";

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

/**
 * Reserves a login attempt. Runs under a short per-email lock so parallel requests cannot
 * all pass the limit check, and records the attempt as a failure before the password is
 * checked (it is flipped to success afterwards). The slow argon2 check happens outside
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

export async function login(db: Database, input: z.infer<typeof loginSchema>, meta: { ip: string; userAgent?: string | null }) {
  const attemptId = await reserveAttempt(db, input.email, meta.ip);
  if (attemptId === null) throw new AppError("Too many failed attempts. Try again in 15 minutes.", "RATE_LIMITED");

  const [user] = await db.select().from(users).where(eq(sql`lower(${users.email})`, input.email)).limit(1);
  const valid = user ? await verifyPassword(user.passwordHash, input.password) : (await burnPasswordCheck(input.password), false);
  // A deactivated account looks exactly like a wrong password, so the message never confirms a password.
  if (!user || !valid || !user.isActive) throw new AppError(INVALID, "UNAUTHENTICATED");

  await db.update(loginAttempts).set({ success: true }).where(eq(loginAttempts.id, attemptId));
  const session = await createSession(db, user.id, meta);
  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
  await logActivity(db, { userId: user.id, action: "user.login", entityType: "user", entityId: user.id, ip: meta.ip });
  return session;
}
