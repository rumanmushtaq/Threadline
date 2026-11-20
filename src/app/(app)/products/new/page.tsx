import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-header";
import { aiConfigured } from "@/server/ai/provider";
import { requirePageUser } from "@/server/auth/current";
import { db } from "@/server/db";
import { listCategories } from "@/server/products";
import { getSettings } from "@/server/settings";
import { ProductWizard } from "./product-wizard";

export const metadata: Metadata = { title: "Create product" };

export default async function NewProductPage() {
  await requirePageUser("product.create");
  const [categories, settings] = await Promise.all([listCategories(db), getSettings(db)]);
  const ai = aiConfigured();
  return (
    <>
      <PageHeader
        title="Create a product"
        description={`Six quick steps. The SKU${ai ? ", public link and AI photos are" : " and public link are"} created for you after saving.`}
      />
      <ProductWizard categories={categories} currency={settings.currencySymbol} aiEnabled={ai} />
    </>
  );
}
