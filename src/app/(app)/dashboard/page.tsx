import { AlertTriangle, ArrowRight, Boxes, CircleDollarSign, PackageX, Plus, ShoppingBag, Shirt, Sparkles, TrendingUp, Wallet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Kpi } from "@/components/app/kpi";
import { MoneyCards } from "@/components/app/money-cards";
import { PageHeader } from "@/components/app/page-header";
import { OrderStatusBadge } from "@/components/orders/order-status-badge";
import { Button } from "@/components/ui/button";
import { activityLabel, activitySubject } from "@/lib/activity-labels";
import { rangeParamsSchema } from "@/lib/date-range";
import { formatMoney, formatNumber, timeAgo } from "@/lib/format";
import { requirePageUser } from "@/server/auth/current";
import { can } from "@/server/auth/permissions";
import { dashboardData } from "@/server/dashboard";
import { resolveRange } from "@/server/date-range";
import { db } from "@/server/db";
import { DashboardCharts } from "./dashboard-charts";
import { RangePicker } from "./range-picker";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePageUser("dashboard.view");
  const seeOrders = can(user.role, "order.view");
  const range = resolveRange(rangeParamsSchema.parse(await searchParams));
  const d = await dashboardData(db, { includeOrders: seeOrders, range });
  const m = d.money;
  const salesQuery = new URLSearchParams({ range: range.preset, ...(range.preset === "custom" ? { from: range.fromDay ?? "", to: range.toDay } : {}) }).toString();
  const s = d.stats;
  const cur = d.currency;
  const seeActivity = can(user.role, "activity.view");

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Hello, ${user.name.split(" ")[0]}`}
        description="Live numbers from your inventory and orders."
        actions={
          <>
            <RangePicker preset={range.preset} label={range.label} fromDay={range.fromDay} toDay={range.toDay} />
            {can(user.role, "product.create") && (
              <Button asChild>
                <Link href="/products/new">
                  <Plus /> Create product
                </Link>
              </Button>
            )}
          </>
        }
      />

      {m && (
        <section className="space-y-3">
          <SectionTitle title={`Money · ${range.label}`} note="Shop sales, delivered website orders and expenses in these dates." />
          <MoneyCards m={m} currency={cur} salesHref={(c) => `/sales?${salesQuery}&channel=${c}`} expensesHref={`/expenses?${salesQuery}`} />
        </section>
      )}

      <SectionTitle title="Stock right now" note="Live totals, not affected by the date filter." />

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi icon={Shirt} label="Total products" value={formatNumber(s.products)} note={`${s.kids} kids · ${s.youth} youth · ${s.adult} adult`} />
        <Kpi icon={Boxes} label="Available pieces" value={formatNumber(s.available)} note={`${formatNumber(s.pieces)} on hand · ${formatNumber(s.reserved)} reserved`} />
        <Kpi icon={Wallet} label="Stock value at cost" value={formatMoney(s.purchaseValue, cur)} note="what the stock on hand cost" />
        <Kpi icon={CircleDollarSign} label="Stock value at target sale price" value={formatMoney(s.salesValue, cur)} note="at target prices" />
        <Kpi icon={TrendingUp} label="Profit if all stock sells" value={formatMoney(s.estimatedProfit, cur)} note="at target prices" />
        <Kpi icon={AlertTriangle} label="Low stock products" value={formatNumber(s.lowStock)} note={`${d.threshold} or fewer pieces left`} href="/inventory?stock=low" tone={s.lowStock ? "warn" : undefined} />
        <Kpi icon={PackageX} label="Out of stock" value={formatNumber(s.outOfStock)} note="no pieces available" href="/inventory?stock=out" tone={s.outOfStock ? "bad" : undefined} />
        {seeOrders ? (
          <Kpi icon={ShoppingBag} label="Orders" value={formatNumber(s.orders)} note={`${s.pendingOrders} pending`} href="/orders?status=pending" tone={s.pendingOrders ? "warn" : undefined} />
        ) : (
          <Kpi icon={Boxes} label="Reserved pieces" value={formatNumber(s.reserved)} note="held for customer orders" href="/inventory" />
        )}
      </section>

      <DashboardCharts movement={d.movement.points} movementUnit={d.movement.unit} rangeLabel={range.label} byCategory={d.byCategory} byAudience={d.byAudience} />

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Panel title="Recent products" href="/products">
          {d.recentProducts.length === 0 ? (
            <Empty text="No products yet." />
          ) : (
            <ul className="divide-y">
              {d.recentProducts.map((p) => (
                <li key={p.id}>
                  <Link href={`/products/${p.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40">
                    {p.thumbUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- storage URL
                      <img src={p.thumbUrl} alt="" className="h-11 w-9 rounded object-cover" />
                    ) : (
                      <div className="h-11 w-9 rounded bg-muted" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{p.name}</p>
                      <p className="text-xs text-muted-foreground">
                        <span className="font-mono">{p.sku}</span> · {p.creator} · {timeAgo(p.createdAt)}
                      </p>
                    </div>
                    <span className="text-sm tabular">{formatMoney(p.sellingPriceMinor, cur)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Low-stock alerts" href="/inventory?stock=low">
          {d.lowStock.length === 0 ? (
            <Empty text="Every product has healthy stock." />
          ) : (
            <ul className="divide-y">
              {d.lowStock.map((p) => (
                <li key={p.id}>
                  <Link href={`/products/${p.id}#inventory`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/40">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{p.name}</p>
                      <p className="text-xs text-muted-foreground">
                        <span className="font-mono">{p.sku}</span>
                        {p.sizes_out && ` · out in ${p.sizes_out}`}
                      </p>
                    </div>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${p.available === 0 ? "bg-destructive/10 text-destructive" : "bg-warning/15"}`}>
                      {p.available === 0 ? "Out" : `${p.available} left`}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Recently generated AI images" href="/ai-images">
          {d.recentAi.length === 0 ? (
            <Empty text="AI marketing images appear here once generated." icon={Sparkles} />
          ) : (
            <div className="grid grid-cols-3 gap-2 p-4">
              {d.recentAi.map((img) => (
                <Link key={img.id} href={`/products/${img.productId}`} className="overflow-hidden rounded-md border" title={img.name}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- storage URL */}
                  <img src={img.url} alt={img.name} className="aspect-[4/5] w-full object-cover transition hover:scale-105" />
                </Link>
              ))}
            </div>
          )}
        </Panel>

        {seeOrders && (
          <Panel title="Recent customer orders" href="/orders" className="lg:col-span-2">
            {d.recentOrders.length === 0 ? (
              <Empty text="Orders placed from public product links appear here." />
            ) : (
              <ul className="divide-y">
                {d.recentOrders.map((o) => (
                  <li key={o.id}>
                    <Link href={`/orders/${o.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/40">
                      <div>
                        <p className="text-sm font-medium">
                          <span className="font-mono">{o.orderNumber}</span> · {o.customerName}
                        </p>
                        <p className="text-xs text-muted-foreground">{timeAgo(o.createdAt)}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm tabular">{formatMoney(o.totalMinor, cur)}</span>
                        <OrderStatusBadge status={o.status} />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        )}

        {seeActivity && (
          <Panel title="Recent activity" href="/activity">
            <ul className="divide-y">
              {d.recentActivity.map((a) => (
                <li key={a.id} className="px-4 py-2.5 text-sm">
                  <span className="font-medium">{a.userName ?? (a.action.startsWith("order.") ? "Customer" : "System")}</span> {activityLabel(a.action)}
                  {activitySubject(a.metadata) && <span className="font-mono text-xs"> {activitySubject(a.metadata)}</span>}
                  <span className="block text-xs text-muted-foreground">{timeAgo(a.createdAt)}</span>
                </li>
              ))}
            </ul>
          </Panel>
        )}
      </section>
    </div>
  );
}

function SectionTitle({ title, note }: { title: string; note: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
      <h2 className="text-sm font-medium">{title}</h2>
      <p className="text-xs text-muted-foreground">{note}</p>
    </div>
  );
}

function Panel({ title, href, children, className = "" }: { title: string; href?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`overflow-hidden rounded-xl border bg-card ${className}`}>
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h2 className="text-sm font-medium">{title}</h2>
        {href && (
          <Link href={href} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            View all <ArrowRight className="size-3" />
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

function Empty({ text, icon: Icon }: { text: string; icon?: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-10 text-center text-sm text-muted-foreground">
      {Icon && <Icon className="size-5" />}
      {text}
    </div>
  );
}
