"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { runAction, parseOrThrow } from "@/server/action";
import { getCurrentUser, requestMeta } from "@/server/auth/current";
import { login, loginSchema } from "@/server/auth/login";
import { deleteSessionByToken, SESSION_COOKIE, sessionCookieOptions } from "@/server/auth/session";
import { logActivity } from "@/server/activity";
import { db } from "@/server/db";

export async function loginAction(input: { email: string; password: string }) {
  const result = await runAction(async () => {
    const data = parseOrThrow(loginSchema, input);
    const meta = await requestMeta();
    const { token, expiresAt } = await login(db, data, meta);
    (await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions(expiresAt));
    return null;
  });
  return result;
}

export async function logoutAction() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    const user = await getCurrentUser();
    await deleteSessionByToken(db, token);
    if (user) await logActivity(db, { userId: user.id, action: "user.logout", entityType: "user", entityId: user.id });
  }
  jar.delete(SESSION_COOKIE);
  redirect("/login");
}
