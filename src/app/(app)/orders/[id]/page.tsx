import { ArrowLeft, MapPin, MessageCircle, Phone } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OrderStatusBadge } from "@/components/orders/order-status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime, formatMoney } from "@/lib/format";
import { requirePageUser } from "@/server/auth/current";
import { can } from "@/server/auth/permissions";
import { db } from "@/server/db";
import { getOrder, NEXT_STATUSES } from "@/server/orders";
import { getSettings } from "@/server/settings";
import { OrderActions } from "./order-actions";

export const metadata: Metadata = { title: "Order" };

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageUser("order.view");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [order, settings] = await Promise.all([getOrder(db, id), getSettings(db)]);
  if (!order) notFound();
  const cur = settings.currencySymbol;
  const cost = order.items.reduce((s, i) => s + i.unitCostMinor * i.quantity, 0);
  const wa = (order.whatsapp ?? order.phone).replace(/^0/, "92").replace(/\D/g, "");

  const timeline = [
    { label: "Placed", at: order.createdAt },
    { label: "Confirmed", at: order.confirmedAt },
    { label: "Dispatched", at: order.dispatchedAt },
    { label: "Delivered", at: order.deliveredAt },
    { label: "Cancelled", at: order.cancelledAt },
  ].filter((t) => t.at);

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <Link href="/orders" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Orders
        </Link>
        <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <h1 className="font-mono text-2xl font-semibold">{order.orderNumber}</h1>
              <OrderStatusBadge status={order.status} />
            </div>
            <p className="text-sm text-muted-foreground">
              Placed {formatDateTime(order.createdAt)} · stock {order.stockReserved ? "reserved" : order.status === "delivered" ? "deducted" : "not reserved"}
            </p>
          </div>
          {can(user.role, "order.manage") && <OrderActions id={order.id} orderNumber={order.orderNumber} next={NEXT_STATUSES[order.status]} />}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="overflow-hidden rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-4">Item</TableHead>
                <TableHead>Size</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead className="pr-4 text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {order.items.map((i) => (
                <TableRow key={i.id}>
                  <TableCell className="pl-4">
                    <Link href={`/products/${i.productId}`} className="font-medium hover:underline">
                      {i.productName}
                    </Link>
                    <div className="font-mono text-xs text-muted-foreground">{i.sku}</div>
                  </TableCell>
                  <TableCell className="font-medium">{i.size}</TableCell>
                  <TableCell className="text-right tabular">{i.quantity}</TableCell>
                  <TableCell className="text-right tabular">{formatMoney(i.unitPriceMinor, cur)}</TableCell>
                  <TableCell className="pr-4 text-right tabular font-medium">{formatMoney(i.unitPriceMinor * i.quantity, cur)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="space-y-1.5 border-t px-4 py-4 text-sm">
            <div className="flex justify-between font-semibold">
              <span>Order total</span>
              <span className="tabular">{formatMoney(order.totalMinor, cur)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Cost at time of order (internal)</span>
              <span className="tabular">{formatMoney(cost, cur)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>{order.status === "delivered" ? "Realized profit" : "Profit if delivered"}</span>
              <span className="tabular">{formatMoney(order.totalMinor - cost, cur)}</span>
            </div>
          </div>
          {order.notes && (
            <div className="border-t px-4 py-4 text-sm">
              <p className="mb-1 text-xs font-medium text-muted-foreground uppercase">Customer notes</p>
              <p className="whitespace-pre-line">{order.notes}</p>
            </div>
          )}
          {order.cancelReason && (
            <div className="border-t px-4 py-4 text-sm text-muted-foreground">Cancelled: {order.cancelReason}</div>
          )}
        </section>

        <aside className="space-y-4">
          <section className="space-y-3 rounded-xl border bg-card p-4 text-sm">
            <p className="font-medium">{order.customerName}</p>
            <a href={`tel:${order.phone}`} className="flex items-center gap-2 hover:underline">
              <Phone className="size-4 text-muted-foreground" /> {order.phone}
            </a>
            <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 hover:underline">
              <MessageCircle className="size-4 text-muted-foreground" /> WhatsApp {order.whatsapp ? order.whatsapp : "(same number)"}
            </a>
            <p className="flex items-start gap-2">
              <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <span>
                {order.address}
                <br />
                {order.city}
              </span>
            </p>
          </section>
          <section className="rounded-xl border bg-card p-4">
            <p className="mb-3 text-sm font-medium">Timeline</p>
            <ol className="space-y-3 border-l pl-4">
              {timeline.map((t) => (
                <li key={t.label} className="relative text-sm">
                  <span className="absolute top-1.5 -left-[21px] size-2.5 rounded-full bg-brand" />
                  <span className="font-medium">{t.label}</span>
                  <span className="block text-xs text-muted-foreground">{formatDateTime(t.at!)}</span>
                </li>
              ))}
            </ol>
          </section>
        </aside>
      </div>
    </div>
  );
}
