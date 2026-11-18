import type { Metadata } from "next";
import { forgotPasswordAction } from "../actions";
import { AuthCard } from "../auth-card";
import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata: Metadata = { title: "Forgot password" };

export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <AuthCard title="Forgot your password?" description="Enter your account email and we'll send you a link to set a new password.">
      {error === "expired" && (
        <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          That reset link has expired or was already used. Ask for a new one.
        </p>
      )}
      <ForgotPasswordForm action={forgotPasswordAction} loginHref="/login" />
    </AuthCard>
  );
}
