import type { Metadata } from "next";
import { ForgotPasswordForm } from "../../../(auth)/forgot-password/forgot-password-form";
import { AccountShell } from "../account-shell";
import { customerForgotPasswordAction } from "../actions";

export const metadata: Metadata = { title: "Forgot password" };

export default function CustomerForgotPasswordPage() {
  return (
    <AccountShell title="Forgot your password?" description="Enter your account email and we'll send you a link to set a new password.">
      <ForgotPasswordForm action={customerForgotPasswordAction} loginHref="/account/login" />
    </AccountShell>
  );
}
