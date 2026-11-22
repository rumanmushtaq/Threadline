"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { logActivity } from "@/server/activity";
import { parseOrThrow, runAction } from "@/server/action";
import { getCurrentSession, getCurrentUser, requestMeta } from "@/server/auth/current";
import { login, loginSchema } from "@/server/auth/login";
import { forgotPasswordSchema, requestPasswordReset } from "@/server/auth/recovery";
import { db } from "@/server/db";
import { AppError } from "@/server/errors";
import { supabaseServer } from "@/server/supabase/next";
import { passwordSchema, setOwnPassword } from "@/server/users";
import { appUrl } from "@/server/app-url";

export async function loginAction(input: { email: string; password: string }) {
  return runAction(async () => {
    const data = parseOrThrow(loginSchema, input);
    await login(db, await supabaseServer(), data, await requestMeta());
    return null;
  });
}

export async function logoutAction() {
  const user = await getCurrentUser();
  // Ends this browser's Supabase session (other devices stay signed in) and clears its cookies.
  await (await supabaseServer()).auth.signOut({ scope: "local" });
  if (user) await logActivity(db, { userId: user.id, action: "user.logout", entityType: "user", entityId: user.id });
  redirect("/login");
}

export async function forgotPasswordAction(input: unknown) {
  return runAction(async () => {
    const { email } = parseOrThrow(forgotPasswordSchema, input);
    const { ip } = await requestMeta();
    await requestPasswordReset(db, await supabaseServer(), email, { ip, appUrl: appUrl() });
    return null;
  });
}

/** Last step of "forgot password": the email link signed this browser in; now pick a new password. */
export async function setNewPasswordAction(input: unknown) {
  return runAction(async () => {
    const session = await getCurrentSession();
    if (!session) throw new AppError("This reset link has expired. Ask for a new one.", "UNAUTHENTICATED");
    const { password } = parseOrThrow(z.object({ password: passwordSchema }), input);
    await setOwnPassword(db, await supabaseServer(), session.user.id, password, "user.password_recovered");
    return null;
  });
}
