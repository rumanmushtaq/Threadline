"use client";

import { Boxes, ChevronLeft, ChevronRight, Copy, Eye, MoreHorizontal, Pencil, ShoppingBag, Sparkles } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { useCan } from "@/components/app/permissions";
import { AiStatusBadge, StockBadge } from "@/components/products/badges";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatMoney } from "@/lib/format";
import { AUDIENCE_LABEL, type Audience } from "@/lib/sizes";
import { type SaleOption, SoldButton } from "../sales/record-sale";
import { regenerateImagesAction } from "./actions";
import { ProductGrid } from "./product-cards";

export type Row = {
  id: string;
  sku: string;
  name: string;
  audience: Audience;
  categoryName: string | null;
  creatorName: string | null;
  purchasePriceMinor: number;
  sellingPriceMinor: number;
  available: number;
  onHand: number;
  sizes: string[];
  thumbUrl: string | null;
  aiStatus: "pending" | "processing" | "completed" | "failed" | null;
  linkActive: boolean | null;
  isPublished: boolean;
  slug: string | null;
  createdAt: string;
};

export function ProductsTable(props: {
  rows: Row[];
  page: number;
  pageCount: number;
  total: number;
  threshold: number;
  currency: string;
  appUrl: string;
  /** "grid" shows photo cards; "list" the compact table. */
  view: "grid" | "list";
  /** Set when the user may record sales: adds a "Sold" button to each row. */
  sale: { options: SaleOption[]; today: string } | null;
}) {
  const { rows, threshold, currency, sale } = props;
  const sold = (r: Row) => sale && <SoldButton option={sale.options.find((o) => o.id === r.id)} currency={currency} today={sale.today} />;
  if (props.view === "grid") {
    return (
      <div className="space-y-6">
        <ProductGrid
          rows={rows}
          threshold={threshold}
          currency={currency}
          actions={(r) => <RowActions row={r} appUrl={props.appUrl} />}
          sold={(r) => sale && <SoldButton option={sale.options.find((o) => o.id === r.id)} currency={currency} today={sale.today} className="w-full" />}
        />
        <Pager page={props.page} pageCount={props.pageCount} total={props.total} />
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <div className="hidden overflow-hidden rounded-xl border bg-card md:block">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-[34%]">Product</TableHead>
              <TableHead>Group</TableHead>
              <TableHead>Sizes</TableHead>
              <TableHead>Stock</TableHead>
              <TableHead className="text-right">Cost</TableHead>
              <TableHead className="text-right">Target price</TableHead>
              <TableHead>AI photos</TableHead>
              <TableHead>Link</TableHead>
              <TableHead className={sale ? "w-32" : "w-10"} />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell>
                  <Link href={`/products/${r.id}`} className="flex items-center gap-3">
                    <Thumb url={r.thumbUrl} name={r.name} />
                    <div className="min-w-0">
                      <p className="truncate font-medium hover:underline">{r.name}</p>
                      <p className="font-mono text-xs text-muted-foreground">
                        {r.sku}
                        {r.creatorName && <span className="font-sans"> · by {r.creatorName}</span>}
                      </p>
                    </div>
                  </Link>
                </TableCell>
                <TableCell>
                  <div className="text-sm">{AUDIENCE_LABEL[r.audience]}</div>
                  {r.categoryName && <div className="text-xs text-muted-foreground">{r.categoryName}</div>}
                </TableCell>
                <TableCell>
                  <SizeChips sizes={r.sizes} />
                </TableCell>
                <TableCell>
                  <StockBadge available={r.available} threshold={threshold} />
                </TableCell>
                <TableCell className="text-right tabular text-muted-foreground">{formatMoney(r.purchasePriceMinor, currency)}</TableCell>
                <TableCell className="text-right tabular font-medium">{formatMoney(r.sellingPriceMinor, currency)}</TableCell>
                <TableCell>
                  <AiStatusBadge status={r.aiStatus} />
                </TableCell>
                <TableCell>
                  <LinkStatus active={!!r.linkActive && r.isPublished} />
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-1">
                    {sold(r)}
                    <RowActions row={r} appUrl={props.appUrl} />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="grid gap-3 md:hidden">
        {rows.map((r) => (
          <div key={r.id} className="flex gap-3 rounded-xl border bg-card p-3">
            <Link href={`/products/${r.id}`}>
              <Thumb url={r.thumbUrl} name={r.name} size="lg" />
            </Link>
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="flex items-start justify-between gap-2">
                <Link href={`/products/${r.id}`} className="min-w-0">
                  <p className="truncate font-medium">{r.name}</p>
                  <p className="font-mono text-xs text-muted-foreground">{r.sku}</p>
                </Link>
                <RowActions row={r} appUrl={props.appUrl} />
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <StockBadge available={r.available} threshold={threshold} />
                <AiStatusBadge status={r.aiStatus} />
              </div>
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm tabular">
                  {formatMoney(r.sellingPriceMinor, currency)}
                  <span className="text-xs text-muted-foreground"> · cost {formatMoney(r.purchasePriceMinor, currency)}</span>
                </p>
                {sold(r)}
              </div>
            </div>
          </div>
        ))}
      </div>

      <Pager page={props.page} pageCount={props.pageCount} total={props.total} />
    </div>
  );
}

export function Thumb({ url, name, size = "md" }: { url: string | null; name: string; size?: "md" | "lg" }) {
  const cls = size === "lg" ? "h-20 w-16" : "h-12 w-10";
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element -- storage URLs may be local or CDN
    <img src={url} alt={name} loading="lazy" className={`${cls} shrink-0 rounded-md border object-cover`} />
  ) : (
    <div className={`${cls} shrink-0 rounded-md border bg-muted`} />
  );
}

export function SizeChips({ sizes }: { sizes: string[] }) {
  if (!sizes.length) return <span className="text-xs text-muted-foreground">None available</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {sizes.map((s) => (
        <span key={s} className="rounded border px-1.5 py-0.5 text-[11px] font-medium">
          {s}
        </span>
      ))}
    </div>
  );
}

function LinkStatus({ active }: { active: boolean }) {
  return active ? (
    <Badge variant="outline" className="border-transparent bg-success/12 text-success">Live</Badge>
  ) : (
    <Badge variant="outline" className="border-transparent bg-muted text-muted-foreground">Hidden</Badge>
  );
}

function RowActions({ row, appUrl }: { row: Row; appUrl: string }) {
  const can = useCan();
  const router = useRouter();
  const url = `${appUrl || window.location.origin}/p/${row.slug ?? row.sku}`;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-8" aria-label={`Actions for ${row.name}`}>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem asChild>
          <Link href={`/products/${row.id}`}>
            <Eye /> View
          </Link>
        </DropdownMenuItem>
        {can("product.edit") && (
          <DropdownMenuItem asChild>
            <Link href={`/products/${row.id}/edit`}>
              <Pencil /> Edit
            </Link>
          </DropdownMenuItem>
        )}
        {can("ai.regenerate") && (
          <DropdownMenuItem
            onSelect={async () => {
              const res = await regenerateImagesAction({ id: row.id });
              if (res.ok) toast.success("AI photo generation queued");
              else toast.error(res.error);
              router.refresh();
            }}
          >
            <Sparkles /> Generate AI images
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          onSelect={async () => {
            await navigator.clipboard.writeText(url);
            toast.success("Public link copied", { description: url });
          }}
        >
          <Copy /> Copy public link
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href={`/products/${row.id}#inventory`}>
            <Boxes /> View inventory
          </Link>
        </DropdownMenuItem>
        {can("order.view") && (
          <DropdownMenuItem asChild>
            <Link href={`/orders?product=${row.id}`}>
              <ShoppingBag /> View orders
            </Link>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function Pager({ page, pageCount, total }: { page: number; pageCount: number; total: number }) {
  const params = useSearchParams();
  const pathname = usePathname();
  if (pageCount <= 1) return null;
  const href = (p: number) => {
    const next = new URLSearchParams(params);
    next.set("page", String(p));
    return `${pathname}?${next}`;
  };
  return (
    <div className="flex items-center justify-between text-sm text-muted-foreground">
      <span>
        Page {page} of {pageCount} · {total} total
      </span>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" asChild={page > 1} disabled={page <= 1}>
          {page > 1 ? (
            <Link href={href(page - 1)}>
              <ChevronLeft /> Previous
            </Link>
          ) : (
            // No wrapper: the icon and text must sit in the button's own flex row.
            <>
              <ChevronLeft /> Previous
            </>
          )}
        </Button>
        <Button variant="outline" size="sm" asChild={page < pageCount} disabled={page >= pageCount}>
          {page < pageCount ? (
            <Link href={href(page + 1)}>
              Next <ChevronRight />
            </Link>
          ) : (
            <>
              Next <ChevronRight />
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
