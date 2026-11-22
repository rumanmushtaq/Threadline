"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { safeNextPath } from "@/lib/safe-next";
import { parseOrThrow, runAction } from "@/server/action";
import { requestMeta } from "@/server/auth/current";
import { forgotPasswordSchema, requestPasswordReset } from "@/server/auth/recovery";
import {
  customerDetailsSchema,
  customerLoginSchema,
  customerSignUpSchema,
  googleSignInUrl,
  loginCustomer,
  setCustomerPassword,
  signUpCustomer,
  updateCustomerDetails,
} from "@/server/customer-accounts";
import { getCurrentCustomer } from "@/server/customer-session";
import { db } from "@/server/db";
import { AppError } from "@/server/errors";
import { supabaseServer } from "@/server/supabase/next";
import { passwordSchema } from "@/server/users";
import { appUrl } from "@/server/app-url";

export async function customerLoginAction(input: unknown) {
  return runAction(async () => {
    const data = parseOrThrow(customerLoginSchema, input);
    await loginCustomer(db, await supabaseServer(), data, await requestMeta());
    return null;
  });
}

export async function customerSignUpAction(input: unknown, next: string) {
  return runAction(async () => {
    const data = parseOrThrow(customerSignUpSchema, input);
    const { ip } = await requestMeta();
    return signUpCustomer(db, await supabaseServer(), data, { ip, appUrl: appUrl(), next: safeNextPath(next, "/shop") });
  });
}

/** "Continue with Google": a plain form post, so it works before the page's scripts load. */
export async function googleSignInAction(form: FormData) {
  const next = safeNextPath(form.get("next"), "/shop");
  const url = await googleSignInUrl(await supabaseServer(), { appUrl: appUrl(), next }).catch(() => null);
  redirect(url ?? `/account/login?error=google&next=${encodeURIComponent(next)}`);
}

export async function customerForgotPasswordAction(input: unknown) {
  return runAction(async () => {
    const { email } = parseOrThrow(forgotPasswordSchema, input);
    const { ip } = await requestMeta();
    await requestPasswordReset(db, await supabaseServer(), email, { ip, appUrl: appUrl(), kind: "customer" });
    return null;
  });
}

export async function customerSetPasswordAction(input: unknown) {
  return runAction(async () => {
    const account = await getCurrentCustomer();
    if (!account) throw new AppError("This reset link has expired. Ask for a new one.", "UNAUTHENTICATED");
    const { password } = parseOrThrow(z.object({ password: passwordSchema }), input);
    await setCustomerPassword(await supabaseServer(), account, password);
    return null;
  });
}

export async function updateDetailsAction(input: unknown) {
  return runAction(async () => {
    const account = await getCurrentCustomer();
    if (!account) throw new AppError("Sign in again to save your details.", "UNAUTHENTICATED");
    await updateCustomerDetails(db, account.id, parseOrThrow(customerDetailsSchema, input));
    revalidatePath("/account");
    return null;
  });
}

export async function customerSignOutAction() {
  await (await supabaseServer()).auth.signOut({ scope: "local" });
  redirect("/shop");
}
