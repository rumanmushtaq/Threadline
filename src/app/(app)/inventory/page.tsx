import { Boxes } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, PageHeader } from "@/components/app/page-header";
import { StockBadge } from "@/components/products/badges";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime } from "@/lib/format";
import { AUDIENCE_LABEL } from "@/lib/sizes";
import { requirePageUser } from "@/server/auth/current";
import { db } from "@/server/db";
import { inventoryFiltersSchema, listInventory, recentMovements } from "@/server/inventory";
import { getSettings } from "@/server/settings";
import { Pager } from "../products/products-table";
import { InventoryFilters } from "./inventory-filters";
import { RowStockButton } from "./row-stock-button";

export const metadata: Metadata = { title: "Inventory" };

const TYPE_LABEL: Record<string, string> = {
  initial: "Initial",
  stock_in: "Added",
  adjustment: "Adjusted",
  stock_out: "Stock out",
  reserve: "Reserved",
  release: "Released",
  sale: "Sold",
};

export default async function InventoryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePageUser("inventory.view");
  const settings = await getSettings(db);
  const filters = inventoryFiltersSchema.parse(await searchParams);
  const [inv, moves] = await Promise.all([listInventory(db, filters, settings.lowStockThreshold), recentMovements(db)]);

  // Group sizes per product so one "Update stock" dialog covers all its sizes.
  const sizesByProduct = new Map<string, { size: (typeof inv.rows)[number]["size"]; onHand: number; reserved: number }[]>();
  for (const r of inv.rows) {
    const list = sizesByProduct.get(r.product_id) ?? [];
    list.push({ size: r.size, onHand: r.on_hand, reserved: r.reserved });
    sizesByProduct.set(r.product_id, list);
  }

  return (
    <>
      <PageHeader title="Inventory" description="Size-wise stock across all active products. Every change is written to the stock ledger." />
      <InventoryFilters />
      <div className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_380px]">
        {inv.rows.length === 0 ? (
          <EmptyState icon={Boxes} title="No stock rows match" description="Create products or change the filters." />
        ) : (
          <div className="space-y-4">
            <div className="overflow-x-auto rounded-xl border bg-card">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="pl-4">Product</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Group</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead className="text-right">Available</TableHead>
                    <TableHead className="text-right">Reserved</TableHead>
                    <TableHead className="text-right">Sold</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-10 pr-4" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {inv.rows.map((r) => (
                    <TableRow key={r.product_size_id}>
                      <TableCell className="pl-4">
                        <Link href={`/products/${r.product_id}#inventory`} className="hover:underline">
                          <span className="font-medium">{r.name}</span>
                        </Link>
                        <div className="font-mono text-xs text-muted-foreground">{r.sku}</div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{r.category ?? "—"}</TableCell>
                      <TableCell>{AUDIENCE_LABEL[r.audience]}</TableCell>
                      <TableCell className="font-medium">{r.size}</TableCell>
                      <TableCell className="text-right tabular font-medium">{r.on_hand - r.reserved}</TableCell>
                      <TableCell className="text-right tabular text-muted-foreground">{r.reserved}</TableCell>
                      <TableCell className="text-right tabular text-muted-foreground">{r.sold}</TableCell>
                      <TableCell>
                        <StockBadge available={r.on_hand - r.reserved} threshold={settings.lowStockThreshold} />
                      </TableCell>
                      <TableCell className="pr-4">
                        <RowStockButton productId={r.product_id} productName={r.name} sizes={sizesByProduct.get(r.product_id)!} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <Pager page={inv.page} pageCount={inv.pageCount} total={inv.total} />
          </div>
        )}
        <aside className="rounded-xl border bg-card">
          <div className="border-b px-4 py-3">
            <h2 className="text-sm font-medium">Latest stock movements</h2>
          </div>
          <ul className="divide-y">
            {moves.length === 0 && <li className="px-4 py-6 text-center text-sm text-muted-foreground">No movements yet.</li>}
            {moves.map((m) => {
              const d = m.onHandDelta || m.reservedDelta;
              return (
                <li key={m.id} className="flex items-start justify-between gap-3 px-4 py-3 text-sm">
                  <div className="min-w-0">
                    <Link href={`/products/${m.productId}#inventory`} className="block truncate font-medium hover:underline">
                      {m.productName} · {m.size}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {TYPE_LABEL[m.type]} · {m.userName ?? "Order"} · {formatDateTime(m.createdAt)}
                    </p>
                  </div>
                  <span className={`shrink-0 tabular font-medium ${d < 0 ? "text-destructive" : "text-success"}`}>
                    {d > 0 ? "+" : ""}
                    {d}
                  </span>
                </li>
              );
            })}
          </ul>
        </aside>
      </div>
    </>
  );
}
