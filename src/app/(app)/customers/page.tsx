import { Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, PageHeader } from "@/components/app/page-header";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate, formatMoney } from "@/lib/format";
import { requirePageUser } from "@/server/auth/current";
import { db } from "@/server/db";
import { customerFiltersSchema, listCustomers } from "@/server/orders";
import { getSettings } from "@/server/settings";
import { Pager } from "../products/products-table";

export const metadata: Metadata = { title: "Customers" };

export default async function CustomersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePageUser("customer.view");
  const filters = customerFiltersSchema.parse(await searchParams);
  const [result, settings] = await Promise.all([listCustomers(db, filters), getSettings(db)]);
  return (
    <>
      <PageHeader title="Customers" description="Customers are saved automatically from orders, matched by phone number." />
      <form className="mb-4 max-w-sm">
        <input
          name="q"
          defaultValue={filters.q}
          placeholder="Search name, phone or city"
          className="h-9 w-full rounded-md border bg-transparent px-3 text-sm"
          aria-label="Search customers"
        />
      </form>
      {result.rows.length === 0 ? (
        <EmptyState icon={Users} title="No customers yet" description="They appear here after their first order." />
      ) : (
        <div className="space-y-4">
          <div className="overflow-x-auto rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-4">Customer</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>City</TableHead>
                  <TableHead className="text-right">Orders</TableHead>
                  <TableHead className="text-right">Delivered value</TableHead>
                  <TableHead className="pr-4">Last order</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.rows.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="pl-4">
                      <div className="font-medium">{c.name}</div>
                      <div className="max-w-64 truncate text-xs text-muted-foreground">{c.address}</div>
                    </TableCell>
                    <TableCell>
                      <Link href={`/orders?q=${encodeURIComponent(c.phone)}`} className="hover:underline">
                        {c.phone}
                      </Link>
                    </TableCell>
                    <TableCell>{c.city}</TableCell>
                    <TableCell className="text-right tabular">{c.orders}</TableCell>
                    <TableCell className="text-right tabular">{formatMoney(c.delivered, settings.currencySymbol)}</TableCell>
                    <TableCell className="pr-4 text-muted-foreground">{c.lastOrderAt ? formatDate(c.lastOrderAt) : "—"}</TableCell>
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
