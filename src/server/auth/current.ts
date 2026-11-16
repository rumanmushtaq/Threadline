import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "../db";
import { AppError } from "../errors";
import { can, type Permission } from "./permissions";
import { SESSION_COOKIE, validateSessionToken, type SessionUser } from "./session";

/** Reads and validates the session once per request. */
export const getCurrentSession = cache(async () => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return validateSessionToken(db, token);
});

export const getCurrentUser = cache(async (): Promise<SessionUser | null> => (await getCurrentSession())?.user ?? null);

/** For pages: redirect to login, or show 403 when the permission is missing. */
export async function requirePageUser(permission?: Permission) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (permission && !can(user.role, permission)) redirect("/dashboard?denied=1");
  return user;
}

/** For actions and route handlers: throws AppError, which callers turn into a result. */
export async function requirePermission(permission: Permission) {
  const user = await getCurrentUser();
  if (!user) throw new AppError("Your session has expired. Sign in again.", "UNAUTHENTICATED");
  if (!can(user.role, permission)) throw new AppError("You do not have permission to do this.", "FORBIDDEN");
  return user;
}

export async function requestMeta() {
  const h = await headers();
  const ip = (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "unknown").trim();
  return { ip, userAgent: h.get("user-agent") };
}
