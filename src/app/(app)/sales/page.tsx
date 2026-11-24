import { Banknote, Globe, Store } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";
import { MoneyCards } from "@/components/app/money-cards";
import { EmptyState, PageHeader } from "@/components/app/page-header";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { rangeParamsSchema } from "@/lib/date-range";
import { formatDateTime, formatMoney, formatNumber } from "@/lib/format";
import { SALE_CHANNELS } from "@/lib/validation/sale";
import { requirePageUser } from "@/server/auth/current";
import { can } from "@/server/auth/permissions";
import { moneyInRange } from "@/server/dashboard";
import { db } from "@/server/db";
import { businessToday, resolveRange } from "@/server/date-range";
import { getSettings } from "@/server/settings";
import { listSales, saleOptions } from "@/server/shop-sales";
import { RangePicker } from "../dashboard/range-picker";
import { CancelSale } from "./cancel-sale";
import { RecordSale } from "./record-sale";

export const metadata: Metadata = { title: "Sales" };

const CHANNEL_LABEL = { all: "All sales", shop: "Shop (in person)", website: "Website orders" } as const;

export default async function SalesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePageUser("sale.view");
  const params = await searchParams;
  const range = resolveRange(rangeParamsSchema.parse(params));
  const channel = z.enum(SALE_CHANNELS).catch("all").parse(params.channel);
  const [settings, money, rows, options] = await Promise.all([
    getSettings(db),
    moneyInRange(db, range),
    listSales(db, range, channel),
    can(user.role, "sale.record") ? saleOptions(db) : [],
  ]);
  const cur = settings.currencySymbol;
  const rangeQuery = { range: range.preset, ...(range.preset === "custom" ? { from: range.fromDay ?? "", to: range.toDay } : {}) };
  const href = (c: string) => `/sales?${new URLSearchParams({ ...rangeQuery, channel: c })}`;
  const counted = rows.filter((r) => !r.cancelled);
  const totals = counted.reduce(
    (t, r) => ({ qty: t.qty + r.quantity, sales: t.sales + r.totalMinor, cost: t.cost + r.unitCostMinor * r.quantity, profit: t.profit + r.profitMinor }),
    { qty: 0, sales: 0, cost: 0, profit: 0 },
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sales"
        description="Every sale, from the shop and from the website, with its price, cost and profit."
        actions={
          <>
            <RangePicker preset={range.preset} label={range.label} fromDay={range.fromDay} toDay={range.toDay} />
            {can(user.role, "sale.record") && <RecordSale options={options} currency={cur} today={businessToday()} />}
          </>
        }
      />

      <MoneyCards m={money} currency={cur} salesHref={href} expensesHref={`/expenses?${new URLSearchParams(rangeQuery)}`} />

      <nav className="flex flex-wrap gap-2" aria-label="Sales channel">
        {SALE_CHANNELS.map((c) => (
          <Link
            key={c}
            href={href(c)}
            scroll={false}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm ${c === channel ? "border-foreground bg-foreground text-background" : "hover:bg-muted"}`}
          >
            {c === "shop" ? <Store className="size-3.5" /> : c === "website" ? <Globe className="size-3.5" /> : <Banknote className="size-3.5" />}
            {CHANNEL_LABEL[c]}
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <EmptyState icon={Banknote} title={`No sales · ${range.label}`} description="Record shop sales with the button above. Website orders appear here once delivered." />
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-4">Sale</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Size</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Sell price</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Profit</TableHead>
                <TableHead>By / customer</TableHead>
                <TableHead className="pr-4" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={`${r.channel}-${r.id}`} className={r.cancelled ? "text-muted-foreground line-through decoration-muted-foreground/60" : ""}>
                  <TableCell className="pl-4">
                    <div className="flex items-center gap-2">
                      {r.channel === "shop" ? <Store className="size-3.5 shrink-0" aria-label="Shop sale" /> : <Globe className="size-3.5 shrink-0" aria-label="Website order" />}
                      {r.orderId ? (
                        <Link href={`/orders/${r.orderId}`} className="font-mono font-medium hover:underline">
                          {r.number}
                        </Link>
                      ) : (
                        <span className="font-mono font-medium">{r.number}</span>
                      )}
                    </div>
                    {r.cancelled && <span className="text-xs no-underline">Cancelled</span>}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{formatDateTime(r.soldAt)}</TableCell>
                  <TableCell>
                    <Link href={`/products/${r.productId}`} className="font-medium hover:underline">
                      {r.productName}
                    </Link>
                    <div className="font-mono text-xs text-muted-foreground">{r.sku}</div>
                    {r.note && <div className="max-w-56 truncate text-xs text-muted-foreground">{r.note}</div>}
                  </TableCell>
                  <TableCell>{r.size}</TableCell>
                  <TableCell className="text-right tabular">{formatNumber(r.quantity)}</TableCell>
                  <TableCell className="text-right tabular">{formatMoney(r.unitPriceMinor, cur)}</TableCell>
                  <TableCell className="text-right tabular text-muted-foreground">{formatMoney(r.unitCostMinor, cur)}</TableCell>
                  <TableCell className="text-right tabular font-medium">{formatMoney(r.totalMinor, cur)}</TableCell>
                  <TableCell className={`text-right tabular font-medium ${!r.cancelled && r.profitMinor < 0 ? "text-destructive" : ""}`}>{formatMoney(r.profitMinor, cur)}</TableCell>
                  <TableCell className="text-sm">{r.who ?? "—"}</TableCell>
                  <TableCell className="pr-4 text-right">
                    {r.channel === "shop" && !r.cancelled && can(user.role, "sale.cancel") && <CancelSale id={r.id} number={r.number} quantity={r.quantity} />}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow className="hover:bg-transparent">
                <TableCell className="pl-4 font-medium" colSpan={4}>
                  Total · {formatNumber(counted.length)} line{counted.length === 1 ? "" : "s"}
                  {rows.length > counted.length && <span className="font-normal text-muted-foreground"> (cancelled not counted)</span>}
                </TableCell>
                <TableCell className="text-right tabular">{formatNumber(totals.qty)}</TableCell>
                <TableCell />
                <TableCell className="text-right tabular text-muted-foreground">{formatMoney(totals.cost, cur)}</TableCell>
                <TableCell className="text-right tabular font-semibold">{formatMoney(totals.sales, cur)}</TableCell>
                <TableCell className={`text-right tabular font-semibold ${totals.profit < 0 ? "text-destructive" : ""}`}>{formatMoney(totals.profit, cur)}</TableCell>
                <TableCell colSpan={2} />
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      )}
    </div>
  );
}
