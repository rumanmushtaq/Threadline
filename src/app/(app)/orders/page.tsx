import { ShoppingBag } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, PageHeader } from "@/components/app/page-header";
import { OrderStatusBadge, ORDER_STATUS_LABEL, type OrderStatus } from "@/components/orders/order-status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime, formatMoney } from "@/lib/format";
import { requirePageUser } from "@/server/auth/current";
import { db } from "@/server/db";
import { listOrders, orderFiltersSchema } from "@/server/orders";
import { getSettings } from "@/server/settings";
import { Pager } from "../products/products-table";
import { OrderFilters } from "./order-filters";

export const metadata: Metadata = { title: "Orders" };

export default async function OrdersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePageUser("order.view");
  const filters = orderFiltersSchema.parse(await searchParams);
  const [result, settings] = await Promise.all([listOrders(db, filters), getSettings(db)]);
  const statuses = Object.keys(ORDER_STATUS_LABEL) as OrderStatus[];

  return (
    <>
      <PageHeader title="Orders" description="Orders placed from public product links. Stock is reserved, released and deducted as orders move." />
      <OrderFilters counts={Object.fromEntries(statuses.map((s) => [s, result.counts[s] ?? 0]))} />
      {result.rows.length === 0 ? (
        <EmptyState icon={ShoppingBag} title="No orders here yet" description="Share a product link — orders placed by customers appear here instantly." />
      ) : (
        <div className="space-y-4">
          <div className="overflow-x-auto rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-4">Order</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="pr-4">Placed</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.rows.map((o) => (
                  <TableRow key={o.id} className="cursor-pointer">
                    <TableCell className="pl-4">
                      <Link href={`/orders/${o.id}`} className="font-mono font-medium hover:underline">
                        {o.orderNumber}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{o.customerName}</div>
                      <div className="text-xs text-muted-foreground">
                        {o.phone} · {o.city}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-64 truncate text-sm text-muted-foreground">{o.items}</TableCell>
                    <TableCell className="text-right tabular font-medium">{formatMoney(o.totalMinor, settings.currencySymbol)}</TableCell>
                    <TableCell>
                      <OrderStatusBadge status={o.status} />
                    </TableCell>
                    <TableCell className="pr-4 whitespace-nowrap text-muted-foreground">{formatDateTime(o.createdAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <Pager page={result.page} pageCount={result.pageCount} total={result.total} />
        </div>
      )}
    </>
  );
}
