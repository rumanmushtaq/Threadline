import type { SupabaseClient } from "@supabase/supabase-js";
import { and, eq, sql } from "drizzle-orm";
import type { Executor } from "../db";
import { users } from "../db/schema";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: "admin" | "staff";
  slot: number;
};

/**
 * Asks Supabase Auth whether the session is valid (getUser checks with the Auth server,
 * so signed-out, revoked and banned sessions fail), then loads the Threadline account.
 * A Supabase user without an active account here has no access at all.
 */
export async function resolveSession(db: Executor, supabase: SupabaseClient) {
  const {
    data: { user: authUser },
    error,
  } = await supabase.auth.getUser();
  if (error || !authUser) return null;
  const [user] = await db
    .select({ id: users.id, name: users.name, email: users.email, role: users.role, slot: users.slot })
    .from(users)
    .where(and(eq(users.id, authUser.id), eq(users.isActive, true)))
    .limit(1);
  return user ? { user: user as SessionUser } : null;
}

/** The Supabase session id of the signed-in browser (from its access token). */
export async function currentSessionId(supabase: SupabaseClient) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const payload = session?.access_token.split(".")[1];
  if (!payload) return undefined;
  const claims = JSON.parse(Buffer.from(payload, "base64url").toString()) as { session_id?: string };
  return claims.session_id;
}

/**
 * Signs a user out everywhere (optionally keeping one session). Deleting the Supabase
 * session also deletes its refresh tokens, and getUser() rejects its access tokens.
 */
export async function revokeSessions(db: Executor, userId: string, keepSessionId?: string) {
  await db.execute(
    keepSessionId
      ? sql`DELETE FROM auth.sessions WHERE user_id = ${userId} AND id <> ${keepSessionId}`
      : sql`DELETE FROM auth.sessions WHERE user_id = ${userId}`,
  );
}
