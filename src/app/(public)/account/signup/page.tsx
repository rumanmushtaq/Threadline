import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { safeNextPath } from "@/lib/safe-next";
import { getCurrentCustomer } from "@/server/customer-session";
import { AccountShell } from "../account-shell";
import { GoogleButton, OrDivider } from "../google-button";
import { SignUpForm } from "./signup-form";

export const metadata: Metadata = { title: "Create an account" };

export default async function SignUpPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const next = safeNextPath((await searchParams).next, "/shop");
  if (await getCurrentCustomer()) redirect(next);
  return (
    <AccountShell tab="signup" next={next} title="Create an account" description="One account to order, save your delivery address and follow your orders.">
      <GoogleButton next={next} />
      <OrDivider />
      <SignUpForm next={next} />
      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href={`/account/login?next=${encodeURIComponent(next)}`} className="font-medium text-foreground underline underline-offset-4">
          Sign in
        </Link>
      </p>
    </AccountShell>
  );
}
