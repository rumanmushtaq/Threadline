import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { safeNextPath } from "@/lib/safe-next";
import { getCurrentCustomer } from "@/server/customer-session";
import { AccountShell } from "../account-shell";
import { GoogleButton, OrDivider } from "../google-button";
import { CustomerLoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

const ERRORS: Record<string, string> = {
  link: "That link has expired or was already used. Sign in, or ask for a new link.",
  google: "Google sign-in is unavailable right now. Try email instead.",
  team: "That Google account belongs to a team member. Team members sign in on the team page.",
};

type Search = { next?: string | string[]; error?: string; reason?: string };

export default async function CustomerLoginPage({ searchParams }: { searchParams: Promise<Search> }) {
  const { next: rawNext, error, reason } = await searchParams;
  const next = safeNextPath(rawNext, "/shop");
  if (await getCurrentCustomer()) redirect(next);
  const qs = `?next=${encodeURIComponent(next)}`;
  return (
    <AccountShell
      title="Sign in"
      description={reason === "order" ? "Sign in or create an account to place your order. Browsing never needs an account." : "Welcome back. Sign in to order and follow your orders."}
    >
      {error && ERRORS[error] && (
        <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {ERRORS[error]}
        </p>
      )}
      <GoogleButton next={next} />
      <OrDivider />
      <CustomerLoginForm next={next} />
      <p className="text-center text-sm text-muted-foreground">
        New here?{" "}
        <Link href={`/account/signup${qs}`} className="font-medium text-foreground underline underline-offset-4">
          Create an account
        </Link>
      </p>
    </AccountShell>
  );
}
