import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { after } from "next/server";
import { cache } from "react";
import { formatMoney } from "@/lib/format";
import { AUDIENCE_LABEL } from "@/lib/sizes";
import { getCurrentCustomer } from "@/server/customer-session";
import { db } from "@/server/db";
import { getPublicProduct, recordView } from "@/server/public-products";
import { ProductView } from "./product-view";

const load = cache((slug: string) => getPublicProduct(db, slug));

export async function generateMetadata({ params }: { params: Promise<{ sku: string }> }): Promise<Metadata> {
  const p = await load((await params).sku);
  if (!p) return { title: "Product not found" };
  const image = p.images[0]?.url;
  const abs = image && image.startsWith("/") ? `${process.env.APP_URL ?? ""}${image}` : image;
  const description = `${formatMoney(p.price, p.currency)} · ${AUDIENCE_LABEL[p.audience]} · ${p.description.slice(0, 140)}`;
  return {
    title: { absolute: `${p.name} · ${p.brand}` },
    description,
    openGraph: { title: `${p.name} — ${formatMoney(p.price, p.currency)}`, description, images: abs ? [{ url: abs }] : undefined, type: "website" },
    twitter: { card: "summary_large_image", images: abs ? [abs] : undefined },
  };
}

export default async function PublicProductPage({ params }: { params: Promise<{ sku: string }> }) {
  const { sku } = await params;
  const [product, account] = await Promise.all([load(sku), getCurrentCustomer()]);
  if (!product) notFound();
  after(() => recordView(db, product.slug).catch(() => {}));
  // Only the shopper's own saved details go to the page, to fill in the order form.
  const customer = account && { name: account.name, phone: account.phone, whatsapp: account.whatsapp, address: account.address, city: account.city };
  return <ProductView product={product} customer={customer} />;
}
