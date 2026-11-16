import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-header";
import { requirePageUser } from "@/server/auth/current";
import { db } from "@/server/db";
import { listCategories } from "@/server/products";
import { getSettings } from "@/server/settings";
import { ProductWizard } from "./product-wizard";

export const metadata: Metadata = { title: "Create product" };

export default async function NewProductPage() {
  await requirePageUser("product.create");
  const [categories, settings] = await Promise.all([listCategories(db), getSettings(db)]);
  return (
    <>
      <PageHeader
        title="Create a product"
        description="Six quick steps. The SKU, public link and AI photos are created for you after saving."
      />
      <ProductWizard categories={categories} currency={settings.currencySymbol} />
    </>
  );
}
