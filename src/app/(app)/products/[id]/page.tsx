import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AiStatusBadge, StockBadge } from "@/components/products/badges";
import { StockMovementDialog } from "@/components/products/stock-movement-dialog";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime, formatMoney, formatPercent } from "@/lib/format";
import { AUDIENCE_LABEL } from "@/lib/sizes";
import { requirePageUser } from "@/server/auth/current";
import { db } from "@/server/db";
import { stockHistory } from "@/server/inventory";
import { getProductDetail } from "@/server/products";
import { getSettings } from "@/server/settings";
import { ProductActions } from "./product-actions";
import { ProductGallery } from "./product-gallery";

export const metadata: Metadata = { title: "Product" };

const TXN_LABEL: Record<string, string> = {
  initial: "Initial stock",
  stock_in: "Stock added",
  adjustment: "Adjustment",
  stock_out: "Stock out",
  reserve: "Reserved for order",
  release: "Reservation released",
  sale: "Sold (delivered)",
};

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePageUser("product.view");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [product, settings] = await Promise.all([getProductDetail(db, id), getSettings(db)]);
  if (!product) notFound();
  const history = await stockHistory(db, id, 50);

  const cur = settings.currencySymbol;
  const onHand = product.sizes.reduce((s, r) => s + r.onHand, 0);
  const reserved = product.sizes.reduce((s, r) => s + r.reserved, 0);
  const sold = product.sizes.reduce((s, r) => s + r.sold, 0);
  const available = onHand - reserved;
  const profit = product.sellingPriceMinor - product.purchasePriceMinor;
  const latestJob = product.jobs[0];
  const appUrl = process.env.APP_URL ?? "";

  return (
    <div className="space-y-6">
      <div>
        <Link href="/products" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Products
        </Link>
        <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm text-muted-foreground">{product.sku}</span>
              {product.status === "archived" && <Badge variant="secondary">Archived</Badge>}
              <StockBadge available={available} threshold={settings.lowStockThreshold} />
              <AiStatusBadge status={latestJob?.status} />
            </div>
            <h1 className="font-display text-3xl tracking-tight">{product.name}</h1>
            <p className="text-sm text-muted-foreground">
              {AUDIENCE_LABEL[product.audience]}
              {product.category && ` · ${product.category.name}`} · added by {product.creator.name} on {formatDateTime(product.createdAt)}
            </p>
          </div>
          <ProductActions
            id={product.id}
            name={product.name}
            archived={product.status === "archived"}
            published={product.isPublished}
            publicUrl={`${appUrl}/p/${product.link?.slug ?? product.sku}`}
            aiBusy={latestJob?.status === "pending" || latestJob?.status === "processing"}
          />
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <ProductGallery
          images={product.images.map((i) => ({ id: i.id, kind: i.kind, url: i.url, thumbUrl: i.thumbUrl, variant: i.variant }))}
          job={latestJob ? { status: latestJob.status, attempts: latestJob.attempts, maxAttempts: latestJob.maxAttempts, lastError: latestJob.lastError } : null}
        />

        <div className="space-y-6">
          <section className="rounded-xl border bg-card p-5">
            <h2 className="mb-2 text-sm font-medium">Description</h2>
            <p className="text-sm leading-relaxed whitespace-pre-line text-muted-foreground">{product.description}</p>
          </section>

          <section className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border">
            <Stat label="Selling price" value={formatMoney(product.sellingPriceMinor, cur)} />
            <Stat label="Purchase price" value={formatMoney(product.purchasePriceMinor, cur)} note="internal" />
            <Stat label="Profit per piece" value={formatMoney(profit, cur)} note={formatPercent(profit / product.sellingPriceMinor) + " margin"} />
            <Stat label="Est. gross profit (on hand)" value={formatMoney(profit * onHand, cur)} note="estimate" />
            <Stat label="Purchase value (on hand)" value={formatMoney(product.purchasePriceMinor * onHand, cur)} />
            <Stat label="Potential sales value" value={formatMoney(product.sellingPriceMinor * onHand, cur)} />
          </section>
        </div>
      </div>

      <section id="inventory" className="scroll-mt-20 rounded-xl border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
          <div>
            <h2 className="font-medium">Size-wise stock</h2>
            <p className="text-sm text-muted-foreground tabular">
              {onHand} on hand · {reserved} reserved · {available} available · {sold} sold
            </p>
          </div>
          {product.status === "active" && (
            <StockMovementDialog productId={product.id} productName={product.name} sizes={product.sizes} />
          )}
        </div>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-5">Size</TableHead>
              <TableHead className="text-right">On hand</TableHead>
              <TableHead className="text-right">Reserved</TableHead>
              <TableHead className="text-right">Available</TableHead>
              <TableHead className="pr-5 text-right">Sold</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {product.sizes.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="pl-5 font-medium">{s.size}</TableCell>
                <TableCell className="text-right tabular">{s.onHand}</TableCell>
                <TableCell className="text-right tabular text-muted-foreground">{s.reserved}</TableCell>
                <TableCell className="text-right tabular font-medium">{s.onHand - s.reserved}</TableCell>
                <TableCell className="pr-5 text-right tabular text-muted-foreground">{s.sold}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>

      <section className="rounded-xl border bg-card">
        <div className="border-b px-5 py-4">
          <h2 className="font-medium">Stock history</h2>
          <p className="text-sm text-muted-foreground">Every change is recorded and can never be edited or deleted.</p>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-5">When</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Size</TableHead>
                <TableHead className="text-right">Change</TableHead>
                <TableHead className="text-right">On hand after</TableHead>
                <TableHead>By</TableHead>
                <TableHead className="pr-5">Reason</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.map((h) => {
                const delta = h.onHandDelta !== 0 ? h.onHandDelta : h.reservedDelta;
                const unit = h.onHandDelta === 0 && h.reservedDelta !== 0 ? " reserved" : "";
                return (
                  <TableRow key={h.id}>
                    <TableCell className="pl-5 whitespace-nowrap text-muted-foreground">{formatDateTime(h.createdAt)}</TableCell>
                    <TableCell>{TXN_LABEL[h.type]}</TableCell>
                    <TableCell className="font-medium">{h.size}</TableCell>
                    <TableCell className={`text-right tabular ${delta < 0 ? "text-destructive" : "text-success"}`}>
                      {delta > 0 ? "+" : ""}
                      {delta}
                      {unit}
                    </TableCell>
                    <TableCell className="text-right tabular">{h.onHandAfter}</TableCell>
                    <TableCell>{h.userName ?? (h.orderId ? "Customer order" : "System")}</TableCell>
                    <TableCell className="max-w-64 truncate pr-5 text-muted-foreground">{h.reason ?? "—"}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular">{value}</p>
      {note && <p className="text-xs text-muted-foreground">{note}</p>}
    </div>
  );
}
