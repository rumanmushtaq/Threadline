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
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  // The cookie's lifetime is refreshed in proxy.ts on every page visit; the database
  // session (renewed in validateSessionToken) stays the source of truth.
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

/**
 * Client IP for rate limiting, read only from headers that the deployment's own proxy
 * sets. TRUSTED_PROXY: "vercel" (default on Vercel), "cloudflare", "nginx" (X-Real-IP),
 * "xff" (right-most X-Forwarded-For entry, added by the last proxy; default elsewhere)
 * or "none". Headers from other sources are ignored because clients can forge them.
 */
let warned = false;

export function clientIp(h: Headers, mode = process.env.TRUSTED_PROXY || (process.env.VERCEL ? "vercel" : "xff")) {
  if (!process.env.TRUSTED_PROXY && !process.env.VERCEL && process.env.NODE_ENV === "production" && !warned) {
    warned = true;
    console.warn(
      "[threadline] TRUSTED_PROXY is not set; using the right-most X-Forwarded-For entry. That is only safe behind a proxy that appends it. Set TRUSTED_PROXY (see README).",
    );
  }
  const first = (v: string | null) => v?.split(",")[0]?.trim().slice(0, 64) || null;
  const last = (v: string | null) => v?.split(",").map((p) => p.trim()).filter(Boolean).at(-1)?.slice(0, 64) || null;
  const ip =
    mode === "vercel"
      ? first(h.get("x-vercel-forwarded-for")) ?? first(h.get("x-real-ip"))
      : mode === "cloudflare"
        ? first(h.get("cf-connecting-ip"))
        : mode === "nginx"
          ? first(h.get("x-real-ip"))
          : mode === "xff"
            ? last(h.get("x-forwarded-for"))
            : null;
  return ip ?? "unknown";
}

export async function requestMeta() {
  const h = await headers();
  return { ip: clientIp(h), userAgent: h.get("user-agent") };
}
