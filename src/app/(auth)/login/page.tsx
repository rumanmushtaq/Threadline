import { ArrowUpRight, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { safeNextPath } from "@/lib/safe-next";
import { getCurrentUser } from "@/server/auth/current";
import { LogoMark } from "@/server/brand/logo";
import { db } from "@/server/db";
import { listShop, shopFiltersSchema } from "@/server/public-products";
import { LoginForm } from "./login-form";
import { Lookbook } from "@/components/shop/lookbook";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  if (await getCurrentUser()) redirect("/dashboard");
  const { next } = await searchParams;
  const safeNext = safeNextPath(next);
  // Only customer-safe, approved shop photos: the same ones anyone sees in the shop.
  const shop = await listShop(db, shopFiltersSchema.parse({})).catch(() => null);
  const photos = (shop?.items ?? []).map((i) => i.imageUrl).filter((u): u is string => !!u).slice(0, 15);
  const brand = shop?.brand ?? "Threadline";

  return (
    <main className="grid min-h-svh bg-background lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden overflow-hidden bg-[#1c1612] text-[#f8f4ee] lg:flex lg:flex-col lg:justify-between lg:p-12">
        {photos.length >= 3 && <Lookbook photos={photos} className="inset-y-[-20%] right-[-6%] w-[62%] opacity-70" />}
        {/* Readable text over the photos */}
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#1c1612] via-[#1c1612]/85 to-[#1c1612]/20" />
        <div aria-hidden className="pointer-events-none absolute -bottom-32 -left-24 size-[28rem] rounded-full bg-[#b4532a]/25 blur-3xl" />

        <div className="relative flex items-center gap-3">
          <LogoMark size={44} />
          <span className="font-display text-xl tracking-wide">{brand}</span>
        </div>

        <div className="relative max-w-md space-y-6">
          <Stitch />
          <h2 className="font-display text-5xl leading-[1.05] tracking-tight">
            Every piece, every size, <span className="text-[#e08a5f] italic">every order</span> — in one calm place.
          </h2>
          <p className="max-w-sm text-base text-[#f8f4ee]/70">Stock, photos, shop sales and customer orders for your clothing business, all in one workspace.</p>
          <ul className="flex flex-wrap gap-2 text-xs text-[#f8f4ee]/80">
            {["Inventory by size", "Shop & website sales", "Photo studio", "Live dashboard"].map((t) => (
              <li key={t} className="rounded-full border border-[#f8f4ee]/15 bg-[#f8f4ee]/5 px-3 py-1 backdrop-blur">
                {t}
              </li>
            ))}
          </ul>
        </div>

        <div className="relative flex items-center justify-between text-xs text-[#f8f4ee]/55">
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="size-3.5" /> Private workspace · team accounts only
          </span>
          <Link href="/shop" className="inline-flex items-center gap-1 hover:text-[#f8f4ee]">
            Visit the shop <ArrowUpRight className="size-3.5" />
          </Link>
        </div>
      </section>

      <section className="relative flex items-center justify-center p-6 sm:p-12">
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_80%_10%,color-mix(in_oklab,var(--brand)_10%,transparent),transparent_45%)]" />
        <div className="relative w-full max-w-sm space-y-8">
          <div className="space-y-5">
            <div className="flex items-center gap-3 lg:hidden">
              <LogoMark size={40} />
              <span className="font-display text-xl">{brand}</span>
            </div>
            <div className="space-y-2">
              <p className="text-xs font-medium tracking-[0.2em] text-brand uppercase">Team sign in</p>
              <h1 className="font-display text-4xl tracking-tight">Welcome back</h1>
              <p className="text-sm text-muted-foreground">Sign in with the account your admin created for you.</p>
            </div>
          </div>
          <LoginForm next={safeNext} />
          <p className="border-t pt-5 text-center text-sm text-muted-foreground">
            Shopping with us?{" "}
            <Link href="/account/login" className="font-medium text-foreground underline-offset-4 hover:underline">
              Customer sign in
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}

/** A stitched line with a needle eye: the logo's thread, as a small accent. */
function Stitch() {
  return (
    <svg aria-hidden width="140" height="14" viewBox="0 0 140 14" className="text-[#e08a5f]">
      <path d="M2 7 H120" stroke="currentColor" strokeWidth="2" strokeDasharray="7 6" strokeLinecap="round" />
      <ellipse cx="130" cy="7" rx="7" ry="3.5" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}
