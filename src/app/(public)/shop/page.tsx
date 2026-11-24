import { ArrowUpRight, ChevronLeft, ChevronRight, Search, Shirt } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatMoney } from "@/lib/format";
import { AUDIENCE_LABEL, AUDIENCES } from "@/lib/sizes";
import { cn } from "@/lib/utils";
import { db } from "@/server/db";
import { getCurrentCustomer } from "@/server/customer-session";
import { getSettings } from "@/server/settings";
import { listShop, shopFiltersSchema, type ShopFilters, type ShopItem } from "@/server/public-products";
import { PublicHeader } from "../public-header";

export async function generateMetadata(): Promise<Metadata> {
  const s = await getSettings(db);
  return {
    title: { absolute: `Shop · ${s.brandName}` },
    description: s.brandTagline ?? `Everything on sale at ${s.brandName}.`,
    openGraph: { title: `${s.brandName} — shop`, description: s.brandTagline ?? undefined, type: "website" },
  };
}

const SORT_LABEL = { newest: "Newest", "price-asc": "Price: low to high", "price-desc": "Price: high to low" } as const;

/** Builds a shop URL from the current filters plus changes; changing a filter goes back to page 1. */
function shopHref(f: ShopFilters, change: Partial<ShopFilters>) {
  const next = { ...f, page: 1, ...change };
  const qs = new URLSearchParams();
  if (next.q) qs.set("q", next.q);
  if (next.category) qs.set("category", next.category);
  if (next.audience) qs.set("audience", next.audience);
  if (next.sort !== "newest") qs.set("sort", next.sort);
  if (next.page > 1) qs.set("page", String(next.page));
  const s = qs.toString();
  return s ? `/shop?${s}` : "/shop";
}

function Chip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "shrink-0 rounded-full border px-3.5 py-1.5 text-sm whitespace-nowrap transition",
        active ? "border-foreground bg-foreground text-background" : "hover:border-foreground/50",
      )}
    >
      {children}
    </Link>
  );
}

/** Shop card: photo first (a second photo fades in on hover), then name, price and the sizes still in stock. */
function ProductCard({ item, currency, index }: { item: ShopItem; currency: string; index: number }) {
  const soldOut = item.available <= 0;
  const few = !soldOut && item.available <= 3;
  return (
    <Link
      href={`/p/${item.slug}`}
      className="group block rounded-3xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:outline-none motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-4 motion-safe:fill-mode-both motion-safe:duration-500"
      style={{ animationDelay: `${Math.min(index, 12) * 50}ms` }}
    >
      <div className="relative overflow-hidden rounded-3xl bg-muted ring-1 ring-foreground/5 transition-shadow duration-500 group-hover:shadow-2xl group-hover:shadow-foreground/10">
        {item.imageUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- CDN or local storage URL */}
            <img
              src={item.imageUrl}
              alt={item.name}
              loading={index < 4 ? "eager" : "lazy"}
              className={cn(
                "aspect-[4/5] w-full object-cover transition duration-700 ease-out group-hover:scale-[1.06]",
                item.hoverUrl && "group-hover:opacity-0",
                soldOut && "opacity-55 grayscale",
              )}
            />
            {item.hoverUrl && !soldOut && (
              // eslint-disable-next-line @next/next/no-img-element -- CDN or local storage URL
              <img
                src={item.hoverUrl}
                alt=""
                aria-hidden
                loading="lazy"
                className="absolute inset-0 size-full scale-[1.06] object-cover opacity-0 transition duration-700 ease-out group-hover:scale-100 group-hover:opacity-100"
              />
            )}
          </>
        ) : (
          <div className="grid aspect-[4/5] place-items-center bg-gradient-to-br from-muted to-accent">
            <Shirt className="size-10 text-muted-foreground/40" strokeWidth={1.25} />
          </div>
        )}

        {/* One badge at most, so the photo stays clean: scarcity first, then "New in". */}
        {few ? (
          <span className="absolute top-3 left-3 rounded-full bg-background/90 px-2.5 py-1 text-[11px] font-semibold text-warning-foreground shadow-sm backdrop-blur-md dark:text-warning">
            Only {item.available} left
          </span>
        ) : (
          item.isNew &&
          !soldOut && (
            <span className="absolute top-3 left-3 rounded-full bg-brand px-2.5 py-1 text-[10px] font-semibold tracking-[0.16em] text-brand-foreground uppercase shadow-sm">
              New in
            </span>
          )
        )}

        {soldOut ? (
          <span className="absolute inset-x-0 bottom-4 mx-auto w-fit rounded-full bg-foreground/90 px-4 py-1.5 text-[11px] font-semibold tracking-[0.18em] text-background uppercase">
            Sold out
          </span>
        ) : (
          <>
            {/* Laptop: a bar slides up on hover. Phone (no hover): a small arrow sits top right, clear of the photo's logo. */}
            <span className="absolute inset-x-3 bottom-3 hidden translate-y-[calc(100%+1rem)] items-center justify-between rounded-full bg-background/90 py-1.5 pr-1.5 pl-4 text-sm font-medium shadow-lg backdrop-blur-md transition-transform duration-500 ease-out group-hover:translate-y-0 sm:flex">
              View &amp; order
              <span className="grid size-8 place-items-center rounded-full bg-foreground text-background">
                <ArrowUpRight className="size-4" />
              </span>
            </span>
            <span className="absolute top-2.5 right-2.5 grid size-8 place-items-center rounded-full bg-background/90 shadow-md backdrop-blur-md sm:hidden">
              <ArrowUpRight className="size-4" />
            </span>
          </>
        )}
      </div>

      <div className="mt-3 space-y-1.5 px-1">
        <p className="truncate text-[10px] font-medium tracking-[0.16em] text-muted-foreground uppercase sm:text-[11px]">
          {[item.category, AUDIENCE_LABEL[item.audience]].filter(Boolean).join(" · ")}
        </p>
        <h2 className="line-clamp-2 font-display text-[15px] leading-snug tracking-tight decoration-brand/50 underline-offset-4 group-hover:underline sm:text-lg">
          {item.name}
        </h2>
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
          <p className={cn("text-base font-semibold tracking-tight tabular sm:text-lg", soldOut && "text-muted-foreground")}>{formatMoney(item.price, currency)}</p>
          {!soldOut && item.sizes.length > 0 && (
            <div className="flex gap-1" aria-label={`Sizes: ${item.sizes.join(", ")}`}>
              {item.sizes.map((s) => (
                <span key={s} className="grid h-6 min-w-6 place-items-center rounded-md border px-1 text-[10px] font-semibold text-muted-foreground">
                  {s}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}

export default async function ShopPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const f = shopFiltersSchema.parse({ q: one(raw.q), category: one(raw.category), audience: one(raw.audience), sort: one(raw.sort), page: one(raw.page) });
  const [shop, customer] = await Promise.all([listShop(db, f), getCurrentCustomer()]);
  const filtered = !!(f.q || f.category || f.audience);

  return (
    <>
      <PublicHeader brand={shop.brand} tagline={shop.tagline} customer={customer} />
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6 md:py-12">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1">
            <h1 className="font-display text-4xl tracking-tight sm:text-5xl">Shop</h1>
            <p className="text-sm text-muted-foreground">
              {shop.total} {shop.total === 1 ? "product" : "products"}
              {filtered ? " found" : ""}
            </p>
          </div>
          {/* A plain GET form: works before scripts load, and the result is a shareable URL. */}
          <form action="/shop" method="get" role="search" className="relative w-full sm:w-72">
            {f.category && <input type="hidden" name="category" value={f.category} />}
            {f.audience && <input type="hidden" name="audience" value={f.audience} />}
            {f.sort !== "newest" && <input type="hidden" name="sort" value={f.sort} />}
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input name="q" defaultValue={f.q} maxLength={80} placeholder="Search products" aria-label="Search products" className="h-10 rounded-full pl-9" />
          </form>
        </div>

        <div className="space-y-3">
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0" aria-label="Categories">
            <Chip href={shopHref(f, { category: "" })} active={!f.category}>
              All
            </Chip>
            {shop.categories.map((c) => (
              <Chip key={c.slug} href={shopHref(f, { category: c.slug })} active={f.category === c.slug}>
                {c.name} <span className="opacity-60">{c.count}</span>
              </Chip>
            ))}
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="-mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0" aria-label="Who it's for">
              <Chip href={shopHref(f, { audience: undefined })} active={!f.audience}>
                Everyone
              </Chip>
              {AUDIENCES.map((a) => (
                <Chip key={a} href={shopHref(f, { audience: a })} active={f.audience === a}>
                  {AUDIENCE_LABEL[a]}
                </Chip>
              ))}
            </div>
            <div className="flex gap-1 text-sm" aria-label="Sort">
              {(Object.keys(SORT_LABEL) as (keyof typeof SORT_LABEL)[]).map((s) => (
                <Link
                  key={s}
                  href={shopHref(f, { sort: s })}
                  aria-current={f.sort === s ? "true" : undefined}
                  className={cn("rounded-md px-2.5 py-1.5", f.sort === s ? "bg-muted font-medium" : "text-muted-foreground hover:text-foreground")}
                >
                  {SORT_LABEL[s]}
                </Link>
              ))}
            </div>
          </div>
        </div>

        {shop.items.length ? (
          <div className="grid grid-cols-2 gap-x-3 gap-y-8 sm:gap-x-6 sm:gap-y-12 md:grid-cols-3 lg:grid-cols-4">
            {shop.items.map((item, i) => (
              <ProductCard key={item.slug} item={item} currency={shop.currency} index={i} />
            ))}
          </div>
        ) : (
          <div className="grid place-items-center gap-3 rounded-2xl border border-dashed py-20 text-center">
            <Shirt className="size-8 text-muted-foreground" />
            <p className="font-medium">{filtered ? "Nothing matches these filters" : "New arrivals are coming soon"}</p>
            {filtered && (
              <Button asChild variant="outline" size="sm">
                <Link href="/shop">Show all products</Link>
              </Button>
            )}
          </div>
        )}

        {shop.pages > 1 && (
          <nav className="flex items-center justify-center gap-3 pt-4" aria-label="Pages">
            <Button asChild variant="outline" size="sm" className={cn(f.page <= 1 && "pointer-events-none opacity-50")}>
              <Link href={shopHref(f, { page: f.page - 1 })} aria-disabled={f.page <= 1}>
                <ChevronLeft /> Previous
              </Link>
            </Button>
            <span className="text-sm text-muted-foreground tabular">
              Page {Math.min(f.page, shop.pages)} of {shop.pages}
            </span>
            <Button asChild variant="outline" size="sm" className={cn(f.page >= shop.pages && "pointer-events-none opacity-50")}>
              <Link href={shopHref(f, { page: f.page + 1 })} aria-disabled={f.page >= shop.pages}>
                Next <ChevronRight />
              </Link>
            </Button>
          </nav>
        )}
      </main>
    </>
  );
}
