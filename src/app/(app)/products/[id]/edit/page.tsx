import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/app/page-header";
import { fromMinor } from "@/lib/format";
import { AUDIENCE_LABEL } from "@/lib/sizes";
import { requirePageUser } from "@/server/auth/current";
import { db } from "@/server/db";
import { getProductDetail, listCategories } from "@/server/products";
import { getSettings } from "@/server/settings";
import { EditProductForm } from "./edit-form";

export const metadata: Metadata = { title: "Edit product" };

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePageUser("product.edit");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [product, categories, settings] = await Promise.all([getProductDetail(db, id), listCategories(db), getSettings(db)]);
  if (!product) notFound();
  return (
    <div className="max-w-3xl">
      <PageHeader
        title={`Edit ${product.name}`}
        description={`${product.sku} · ${AUDIENCE_LABEL[product.audience]}. The SKU, group and public link never change. Stock is changed from the inventory section.`}
      />
      <EditProductForm
        currency={settings.currencySymbol}
        categories={categories}
        defaults={{
          id: product.id,
          name: product.name,
          description: product.description,
          categoryId: product.categoryId,
          purchasePrice: fromMinor(product.purchasePriceMinor),
          sellingPrice: fromMinor(product.sellingPriceMinor),
        }}
      />
    </div>
  );
}
