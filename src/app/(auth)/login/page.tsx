import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { safeNextPath } from "@/lib/safe-next";
import { getCurrentUser } from "@/server/auth/current";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  if (await getCurrentUser()) redirect("/dashboard");
  const { next } = await searchParams;
  const safeNext = safeNextPath(next);

  return (
    <main className="grid min-h-svh lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden overflow-hidden bg-primary text-primary-foreground lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="flex items-center gap-2 text-sm font-medium tracking-wide">
          <span className="grid size-8 place-items-center rounded-lg bg-brand text-brand-foreground font-display text-lg">T</span>
          Threadline
        </div>
        <div className="max-w-md space-y-4">
          <p className="font-display text-4xl leading-tight">
            Every piece, every size, every order — in one calm place.
          </p>
          <p className="text-sm text-primary-foreground/70">
            Inventory, AI product photography and customer orders for your clothing business.
          </p>
        </div>
        <div className="pointer-events-none absolute -right-24 -bottom-24 size-96 rounded-full bg-brand/25 blur-3xl" />
        <p className="text-xs text-primary-foreground/50">Private workspace · 4 accounts</p>
      </section>
      <section className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-sm space-y-8">
          <div className="space-y-2">
            <h1 className="font-display text-3xl">Welcome back</h1>
            <p className="text-sm text-muted-foreground">Sign in with the account your admin created for you.</p>
          </div>
          <LoginForm next={safeNext} />
        </div>
      </section>
    </main>
  );
}
