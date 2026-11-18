import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/current";
import { AuthCard } from "../auth-card";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = { title: "Set a new password" };

export default async function ResetPasswordPage() {
  // The email link (via /auth/confirm) signed this browser in; without that, the link has expired.
  const user = await getCurrentUser();
  if (!user) redirect("/forgot-password?error=expired");
  return (
    <AuthCard title="Set a new password" description={`For ${user.email}. Your other devices will be signed out.`}>
      <ResetPasswordForm />
    </AuthCard>
  );
}
