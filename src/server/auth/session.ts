import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, lt } from "drizzle-orm";
import type { Executor } from "../db";
import { sessions, users } from "../db/schema";

import { SESSION_COOKIE, SESSION_TTL_MS, sessionCookieOptions } from "@/lib/session-cookie";

export { SESSION_COOKIE, SESSION_TTL_MS, sessionCookieOptions };
const DAY = 24 * 60 * 60 * 1000;
const RENEW_WHEN_LEFT_MS = 15 * DAY;

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(
  db: Executor,
  userId: string,
  meta: { ip?: string | null; userAgent?: string | null } = {},
) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(sessions).values({
    tokenHash: hashToken(token),
    userId,
    expiresAt,
    ip: meta.ip?.slice(0, 64) ?? null,
    userAgent: meta.userAgent?.slice(0, 300) ?? null,
  });
  return { token, expiresAt };
}

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: "admin" | "staff";
  slot: number;
};

/** Returns the user for a valid token, renewing the session when it is getting old. */
export async function validateSessionToken(db: Executor, token: string) {
  const tokenHash = hashToken(token);
  const [row] = await db
    .select({
      sessionId: sessions.id,
      expiresAt: sessions.expiresAt,
      user: { id: users.id, name: users.name, email: users.email, role: users.role, slot: users.slot },
      isActive: users.isActive,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, new Date())))
    .limit(1);

  if (!row || !row.isActive) return null;

  let expiresAt = row.expiresAt;
  let renewed = false;
  if (expiresAt.getTime() - Date.now() < RENEW_WHEN_LEFT_MS) {
    expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    await db.update(sessions).set({ expiresAt }).where(eq(sessions.id, row.sessionId));
    renewed = true;
  }
  return { user: row.user as SessionUser, sessionId: row.sessionId, expiresAt, renewed };
}

export async function deleteSessionByToken(db: Executor, token: string) {
  await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
}

export async function deleteUserSessions(db: Executor, userId: string) {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}

export async function purgeExpiredSessions(db: Executor) {
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
}
