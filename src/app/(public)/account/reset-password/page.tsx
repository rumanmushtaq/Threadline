import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentCustomer } from "@/server/customer-session";
import { ResetPasswordForm } from "../../../(auth)/reset-password/reset-password-form";
import { AccountShell } from "../account-shell";
import { customerSetPasswordAction } from "../actions";

export const metadata: Metadata = { title: "Set a new password" };

export default async function CustomerResetPasswordPage() {
  // The email link (via /auth/confirm) signed this browser in; without that, the link has expired.
  const account = await getCurrentCustomer();
  if (!account) redirect("/account/login?error=link");
  return (
    <AccountShell title="Set a new password" description={`For ${account.email}. Your other devices will be signed out.`}>
      <ResetPasswordForm action={customerSetPasswordAction} doneHref="/account" />
    </AccountShell>
  );
}
