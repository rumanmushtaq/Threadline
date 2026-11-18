import { LogOut, PackageOpen } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { OrderStatusBadge } from "@/components/orders/order-status-badge";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/format";
import { listCustomerOrders } from "@/server/customer-accounts";
import { getCurrentCustomer } from "@/server/customer-session";
import { db } from "@/server/db";
import { getSettings } from "@/server/settings";
import { PublicHeader } from "../public-header";
import { customerSignOutAction } from "./actions";
import { DetailsForm } from "./details-form";

export const metadata: Metadata = { title: "My account" };

const dateFmt = new Intl.DateTimeFormat("en-PK", { day: "numeric", month: "short", year: "numeric" });

export default async function AccountPage() {
  const account = await getCurrentCustomer();
  if (!account) redirect("/account/login?next=/account");
  const [orders, settings] = await Promise.all([listCustomerOrders(db, account.id), getSettings(db)]);

  return (
    <>
      <PublicHeader brand={settings.brandName} tagline={settings.brandTagline} customer={account} />
      <main className="mx-auto grid max-w-6xl gap-10 px-4 py-8 sm:px-6 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] md:py-12">
        <section className="space-y-5">
          <div className="space-y-1">
            <h1 className="font-display text-4xl tracking-tight">My orders</h1>
            <p className="text-sm text-muted-foreground">We call or WhatsApp you to confirm before dispatch.</p>
          </div>
          {orders.length ? (
            <ul className="divide-y rounded-2xl border">
              {orders.map((o) => (
                <li key={o.orderNumber} className="flex flex-wrap items-start justify-between gap-3 p-4">
                  <div className="space-y-1">
                    <p className="font-mono text-sm font-semibold">{o.orderNumber}</p>
                    {o.items.map((i) => (
                      <p key={`${i.productName}-${i.size}`} className="text-sm">
                        {i.productName} · {i.size} × {i.quantity}
                      </p>
                    ))}
                    <p className="text-xs text-muted-foreground">{dateFmt.format(o.createdAt)}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    <OrderStatusBadge status={o.status} />
                    <span className="text-sm font-semibold tabular">{formatMoney(o.totalMinor, settings.currencySymbol)}</span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="grid place-items-center gap-3 rounded-2xl border border-dashed py-14 text-center">
              <PackageOpen className="size-7 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No orders yet.</p>
              <Button asChild size="sm">
                <Link href="/shop">Browse products</Link>
              </Button>
            </div>
          )}
        </section>

        <section className="space-y-5">
          <div className="space-y-1">
            <h2 className="font-display text-2xl">Delivery details</h2>
            <p className="text-sm text-muted-foreground">{account.email} · filled in on your next order.</p>
          </div>
          <DetailsForm
            defaults={{ name: account.name, phone: account.phone ?? "", whatsapp: account.whatsapp ?? "", address: account.address ?? "", city: account.city ?? "" }}
          />
          <form action={customerSignOutAction}>
            <Button type="submit" variant="ghost" className="text-muted-foreground">
              <LogOut /> Sign out
            </Button>
          </form>
        </section>
      </main>
    </>
  );
}
