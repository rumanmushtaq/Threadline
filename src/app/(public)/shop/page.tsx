import { ChevronLeft, ChevronRight, Search, Shirt } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { StockBadge } from "@/components/shop/stock-badge";
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

function ProductCard({ item, currency }: { item: ShopItem; currency: string }) {
  const soldOut = item.available <= 0;
  return (
    <Link href={`/p/${item.slug}`} className="group space-y-3">
      <div className="relative overflow-hidden rounded-2xl bg-muted">
        {item.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- CDN or local storage URL
          <img
            src={item.imageUrl}
            alt={item.name}
            loading="lazy"
            className={cn("aspect-[4/5] w-full object-cover transition duration-300 group-hover:scale-[1.03]", soldOut && "opacity-60")}
          />
        ) : (
          <div className="grid aspect-[4/5] place-items-center">
            <Shirt className="size-8 text-muted-foreground" />
          </div>
        )}
        <StockBadge available={item.available} className="absolute top-3 left-3" />
      </div>
      <div className="space-y-1 px-0.5">
        <p className="text-xs text-muted-foreground">{[item.category, AUDIENCE_LABEL[item.audience]].filter(Boolean).join(" · ")}</p>
        <h2 className="leading-snug font-medium group-hover:underline group-hover:underline-offset-4">{item.name}</h2>
        <p className="font-semibold tabular">{formatMoney(item.price, currency)}</p>
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
          <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:gap-x-6 md:grid-cols-3 lg:grid-cols-4">
            {shop.items.map((item) => (
              <ProductCard key={item.slug} item={item} currency={shop.currency} />
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
