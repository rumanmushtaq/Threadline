import { ArrowUpRight, LockKeyhole, Package, ShoppingBag, Sparkles } from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";
import { LogoMark } from "@/components/brand/logo-mark";
import { Lookbook } from "@/components/shop/lookbook";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { db } from "@/server/db";
import { listShop, shopFiltersSchema } from "@/server/public-products";
import { PublicHeader } from "../public-header";

const PERKS = [
  { icon: ShoppingBag, text: "Order any piece in a few taps" },
  { icon: Package, text: "Follow every order to your door" },
  { icon: Sparkles, text: "Your delivery details, saved for next time" },
];

/**
 * The shopper sign-in pages: a card on the right, and on wide screens a lookbook of the
 * shop's own photos with a "Just in" strip on the left, so signing in still feels like shopping.
 */
export async function AccountShell({
  title,
  description,
  children,
  tab,
  next,
}: {
  title: string;
  description: React.ReactNode;
  children: React.ReactNode;
  /** Shows the Sign in / New account switch. */
  tab?: "login" | "signup";
  next?: string;
}) {
  // Render on each request: the brand and photos come from the database, which the build cannot reach.
  await connection();
  const shop = await listShop(db, shopFiltersSchema.parse({})).catch(() => null);
  const brand = shop?.brand ?? "Threadline";
  const items = (shop?.items ?? []).filter((i) => i.imageUrl);
  const photos = items.map((i) => i.imageUrl!).slice(0, 15);
  const justIn = items.filter((i) => i.available > 0).slice(0, 3);
  const qs = next ? `?next=${encodeURIComponent(next)}` : "";

  return (
    <>
      <PublicHeader brand={brand} tagline={shop?.tagline} customer={null} />
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 md:py-10">
        <div className="grid overflow-hidden rounded-[2rem] border bg-card shadow-[0_30px_80px_-40px_rgba(0,0,0,0.45)] lg:grid-cols-[1fr_1.05fr]">
          <aside className="relative hidden min-h-[640px] flex-col justify-between overflow-hidden bg-[#1c1612] p-10 text-[#f8f4ee] lg:flex">
            {photos.length >= 3 && <Lookbook photos={photos} className="inset-y-[-25%] -right-[30%] w-[95%] opacity-60" />}
            <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[#1c1612] via-[#1c1612]/80 to-[#1c1612]/30" />
            <div aria-hidden className="pointer-events-none absolute -bottom-28 -left-20 size-96 rounded-full bg-[#b4532a]/30 blur-3xl" />

            <div className="relative flex items-center gap-3">
              <LogoMark size={40} />
              <span className="font-display text-xl">{brand}</span>
            </div>

            <div className="relative space-y-6">
              <p className="text-xs font-medium tracking-[0.25em] text-[#e08a5f] uppercase">New season · fresh pieces</p>
              <h2 className="max-w-sm font-display text-5xl leading-[1.05] tracking-tight">
                Dress well. <span className="text-[#e08a5f] italic">Order easy.</span>
              </h2>
              <ul className="space-y-3 text-sm text-[#f8f4ee]/80">
                {PERKS.map(({ icon: Icon, text }) => (
                  <li key={text} className="flex items-center gap-3">
                    <span className="grid size-8 place-items-center rounded-full border border-[#f8f4ee]/15 bg-[#f8f4ee]/5">
                      <Icon className="size-4 text-[#e08a5f]" />
                    </span>
                    {text}
                  </li>
                ))}
              </ul>
            </div>

            {justIn.length > 0 ? (
              <div className="relative space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="tracking-[0.2em] text-[#f8f4ee]/60 uppercase">Just in</span>
                  <Link href="/shop" className="inline-flex items-center gap-1 text-[#f8f4ee]/70 hover:text-[#f8f4ee]">
                    Shop all <ArrowUpRight className="size-3.5" />
                  </Link>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {justIn.map((i) => (
                    <Link key={i.slug} href={`/p/${i.slug}`} className="group rounded-2xl bg-[#f8f4ee]/5 p-2 ring-1 ring-[#f8f4ee]/10 backdrop-blur transition hover:bg-[#f8f4ee]/10">
                      {/* eslint-disable-next-line @next/next/no-img-element -- CDN or local storage URL */}
                      <img src={i.imageUrl!} alt="" className="aspect-[4/5] w-full rounded-xl object-cover" />
                      <p className="mt-2 truncate text-xs">{i.name}</p>
                      <p className="text-xs font-semibold text-[#e08a5f]">{formatMoney(i.price, shop!.currency)}</p>
                    </Link>
                  ))}
                </div>
              </div>
            ) : (
              <span />
            )}
          </aside>

          <section className="relative flex items-center px-5 py-8 sm:px-10 sm:py-12">
            <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_85%_0%,color-mix(in_oklab,var(--brand)_10%,transparent),transparent_45%)]" />
            <div className="relative mx-auto w-full max-w-sm space-y-7">
              {tab && (
                <nav className="grid grid-cols-2 rounded-full border bg-muted/60 p-1 text-sm" aria-label="Account">
                  <TabLink href={`/account/login${qs}`} active={tab === "login"}>
                    Sign in
                  </TabLink>
                  <TabLink href={`/account/signup${qs}`} active={tab === "signup"}>
                    New account
                  </TabLink>
                </nav>
              )}
              <div className="space-y-2">
                <h1 className="font-display text-4xl tracking-tight">{title}</h1>
                <div className="text-sm text-muted-foreground">{description}</div>
              </div>
              {children}
              <p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
                <LockKeyhole className="size-3.5" /> Your details are only used for your orders.
              </p>
            </div>
          </section>
        </div>
      </main>
    </>
  );
}

function TabLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn("rounded-full py-2 text-center font-medium transition", active ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground")}
    >
      {children}
    </Link>
  );
}
