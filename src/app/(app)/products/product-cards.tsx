import { AlertTriangle, EyeOff, Loader2, Shirt, XCircle } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { formatMoney } from "@/lib/format";
import { AUDIENCE_LABEL, SIZES_BY_AUDIENCE } from "@/lib/sizes";
import { cn } from "@/lib/utils";
import type { Row } from "./products-table";

/** Shop-window grid: big photo first, then name, prices and sizes, with "Sold" at the foot of each card. */
export function ProductGrid(props: {
  rows: Row[];
  threshold: number;
  currency: string;
  actions: (r: Row) => ReactNode;
  sold: (r: Row) => ReactNode;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 2xl:grid-cols-5">
      {props.rows.map((r, i) => (
        <ProductCard key={r.id} row={r} index={i} {...props} />
      ))}
    </div>
  );
}

function ProductCard({ row: r, index, threshold, currency, actions, sold }: { row: Row; index: number } & Omit<Parameters<typeof ProductGrid>[0], "rows">) {
  const out = r.available <= 0;
  const profit = r.sellingPriceMinor - r.purchasePriceMinor;
  const margin = r.sellingPriceMinor > 0 ? Math.round((profit / r.sellingPriceMinor) * 100) : 0;
  const href = `/products/${r.id}`;
  const soldNode = sold(r);

  return (
    <article
      className="group relative flex flex-col overflow-hidden rounded-2xl border bg-card shadow-xs transition-[translate,box-shadow,border-color] duration-300 hover:-translate-y-1 hover:border-foreground/15 hover:shadow-xl hover:shadow-foreground/[0.06] motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-3 motion-safe:fill-mode-both"
      style={{ animationDelay: `${Math.min(index, 12) * 40}ms` }}
    >
      <div className="relative aspect-[4/5] overflow-hidden bg-muted">
        <Link href={href} aria-label={`Open ${r.name}`} className="absolute inset-0 focus-visible:outline-none">
          {r.thumbUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- storage URLs may be local or CDN
            <img
              src={r.thumbUrl}
              alt={r.name}
              loading={index < 4 ? "eager" : "lazy"}
              className={cn("size-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.05]", out && "opacity-60 grayscale")}
            />
          ) : (
            <div className="grid size-full place-items-center bg-gradient-to-br from-muted to-accent">
              <Shirt className="size-10 text-muted-foreground/40" strokeWidth={1.25} />
            </div>
          )}
        </Link>
        {/* Soft shade at the top and bottom so the glass pills stay readable on light photos. */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/20 via-transparent via-30% to-black/25" />

        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-2 sm:p-2.5">
          <div className="flex flex-col items-start gap-1.5">
            <LinkPill active={!!r.linkActive && r.isPublished} />
            <AiPill status={r.aiStatus} />
          </div>
          <div className="pointer-events-auto rounded-full bg-background/85 shadow-sm backdrop-blur-md transition-colors hover:bg-background">{actions(r)}</div>
        </div>

        {out ? (
          <span className="pointer-events-none absolute inset-x-0 bottom-3 mx-auto w-fit rounded-full bg-foreground/90 px-3 py-1 text-[11px] font-semibold tracking-[0.14em] text-background uppercase backdrop-blur">
            Sold out
          </span>
        ) : (
          <StockPill available={r.available} threshold={threshold} />
        )}
      </div>

      <div className="flex flex-1 flex-col gap-3 p-3 sm:p-4">
        <div className="min-w-0 space-y-1">
          <p className="truncate text-[10px] font-medium tracking-[0.14em] text-muted-foreground uppercase sm:text-[11px]">
            {AUDIENCE_LABEL[r.audience]}
            {r.categoryName && <> · {r.categoryName}</>}
          </p>
          <Link href={href} className="block">
            <h3 className="line-clamp-2 font-display text-[15px] leading-snug tracking-tight decoration-brand/50 underline-offset-4 group-hover:underline sm:text-lg">
              {r.name}
            </h3>
          </Link>
          <p className="truncate font-mono text-[11px] text-muted-foreground">{r.sku}</p>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-end justify-between gap-2">
            <p className="tabular text-lg leading-none font-semibold tracking-tight sm:text-xl">{formatMoney(r.sellingPriceMinor, currency)}</p>
            <span
              className={cn(
                "tabular rounded-md px-1.5 py-0.5 text-[11px] font-semibold",
                profit >= 0 ? "bg-success/12 text-success" : "bg-destructive/10 text-destructive",
              )}
              title="Profit share of the target sale price"
            >
              {profit >= 0 ? "+" : "−"}
              {Math.abs(margin)}%
            </span>
          </div>
          <p className="flex flex-wrap gap-x-2 text-[11px] text-muted-foreground sm:text-xs">
            <span className="tabular">Cost {formatMoney(r.purchasePriceMinor, currency)}</span>
            <span className={cn("tabular font-medium", profit >= 0 ? "text-success" : "text-destructive")}>
              {profit >= 0 ? "Profit" : "Loss"} {formatMoney(Math.abs(profit), currency)}
            </span>
          </p>
        </div>

        <SizeRow carried={SIZES_BY_AUDIENCE[r.audience]} available={r.sizes} />

        {soldNode && <div className="mt-auto pt-1">{soldNode}</div>}
      </div>
    </article>
  );
}

/** Every size the group comes in: in-stock sizes solid, sold-out ones faded and struck through. */
function SizeRow({ carried, available }: { carried: readonly string[]; available: string[] }) {
  return (
    <div className="flex flex-wrap gap-1" aria-label={`Sizes in stock: ${available.join(", ") || "none"}`}>
      {carried.map((s) => {
        const has = available.includes(s);
        return (
          <span
            key={s}
            className={cn(
              "grid h-6 min-w-7 place-items-center rounded-md border px-1 text-[11px] font-semibold",
              has ? "border-foreground/20 bg-background text-foreground" : "border-dashed text-muted-foreground/50 line-through",
            )}
          >
            {s}
          </span>
        );
      })}
    </div>
  );
}

const glass = "rounded-full bg-background/85 px-2 py-0.5 text-[11px] font-medium shadow-sm backdrop-blur-md";

function LinkPill({ active }: { active: boolean }) {
  return active ? (
    <span className={cn(glass, "flex items-center gap-1.5 text-success")}>
      <span className="relative flex size-1.5">
        <span className="absolute inline-flex size-full rounded-full bg-success opacity-60 motion-safe:animate-ping" />
        <span className="relative inline-flex size-1.5 rounded-full bg-success" />
      </span>
      Live
    </span>
  ) : (
    <span className={cn(glass, "flex items-center gap-1 text-muted-foreground")}>
      <EyeOff className="size-3" /> Hidden
    </span>
  );
}

function AiPill({ status }: { status: Row["aiStatus"] }) {
  if (status === "processing" || status === "pending")
    return (
      <span className={cn(glass, "flex items-center gap-1 text-brand")}>
        <Loader2 className="size-3 animate-spin" /> {status === "pending" ? "AI queued" : "AI photos"}
      </span>
    );
  if (status === "failed")
    return (
      <span className={cn(glass, "flex items-center gap-1 text-destructive")}>
        <XCircle className="size-3" /> AI failed
      </span>
    );
  return null;
}

function StockPill({ available, threshold }: { available: number; threshold: number }) {
  const low = available <= threshold;
  return (
    <span
      className={cn(
        glass,
        "pointer-events-none absolute bottom-2 left-2 flex items-center gap-1 sm:bottom-2.5 sm:left-2.5",
        low ? "text-warning-foreground dark:text-warning" : "text-foreground",
      )}
    >
      {low && <AlertTriangle className="size-3" />}
      <span className="tabular font-semibold">{available}</span> {low ? "left" : "in stock"}
    </span>
  );
}
