import { Plus, Shirt } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { requirePageUser } from "@/server/auth/current";
import { can } from "@/server/auth/permissions";
import { db } from "@/server/db";
import { listCategories, listProducts, productFiltersSchema } from "@/server/products";
import { getSettings } from "@/server/settings";
import { businessToday } from "@/server/date-range";
import { saleOptions } from "@/server/shop-sales";
import { ProductFiltersBar } from "./product-filters";
import { ProductsTable } from "./products-table";
import { appUrl } from "@/server/app-url";

export const metadata: Metadata = { title: "Products" };

export default async function ProductsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePageUser("product.view");
  const params = await searchParams;
  const filters = productFiltersSchema.parse(params);
  const view = params.view === "list" ? "list" : "grid";
  const [result, categories, settings, sellable] = await Promise.all([
    listProducts(db, filters),
    listCategories(db),
    getSettings(db),
    can(user.role, "sale.record") ? saleOptions(db) : null,
  ]);
  const filtered = Object.entries(filters).some(([k, v]) => v !== undefined && !(k === "page" && v === 1) && !(k === "status" && v === "active"));

  return (
    <>
      <PageHeader
        title="Products"
        description={`${result.total} ${filters.status === "archived" ? "archived" : "active"} product${result.total === 1 ? "" : "s"}`}
        actions={
          can(user.role, "product.create") && (
            <Button asChild>
              <Link href="/products/new">
                <Plus /> Create product
              </Link>
            </Button>
          )
        }
      />
      <ProductFiltersBar categories={categories} />
      {result.rows.length === 0 ? (
        <EmptyState
          icon={Shirt}
          title={filtered ? "No products match these filters" : "No products yet"}
          description={filtered ? "Try a different search or clear the filters." : "Create your first product: upload a photo, set sizes and prices, and share the link."}
          action={
            !filtered && can(user.role, "product.create") ? (
              <Button asChild>
                <Link href="/products/new">
                  <Plus /> Create product
                </Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ProductsTable
          rows={result.rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }))}
          page={result.page}
          pageCount={result.pageCount}
          total={result.total}
          threshold={result.lowStockThreshold}
          currency={settings.currencySymbol}
          appUrl={appUrl()}
          view={view}
          // Only this page's products, so the "Sold" form knows each one's sizes and stock.
          sale={sellable ? { options: sellable.filter((o) => result.rows.some((r) => r.id === o.id)), today: businessToday() } : null}
        />
      )}
    </>
  );
}
