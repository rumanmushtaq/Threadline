import { and, desc, eq, sql } from "drizzle-orm";
import { sortSizes, type Audience, type Size } from "@/lib/sizes";
import type { Executor } from "./db";
import { categories, productImages, products, productSizes, publicProductLinks } from "./db/schema";
import { getSettings } from "./settings";
import { fileUrl } from "./storage";

/** Exactly what a customer may see. No costs, margins, users or internal ids. */
export type PublicProduct = {
  slug: string;
  sku: string;
  name: string;
  description: string;
  audience: Audience;
  category: string | null;
  price: number;
  currency: string;
  brand: string;
  tagline: string | null;
  maxOrderQuantity: number;
  sizes: { size: Size; available: number }[];
  images: { kind: "marketing" | "ai_model" | "original"; url: string; width: number | null; height: number | null }[];
};

export async function getPublicProduct(db: Executor, slug: string): Promise<PublicProduct | null> {
  if (!/^[A-Za-z0-9-]{1,40}$/.test(slug)) return null;
  const [row] = await db
    .select({
      productId: products.id,
      slug: publicProductLinks.slug,
      sku: products.sku,
      name: products.name,
      description: products.description,
      audience: products.audience,
      category: categories.name,
      price: products.sellingPriceMinor,
    })
    .from(publicProductLinks)
    .innerJoin(products, eq(products.id, publicProductLinks.productId))
    .leftJoin(categories, eq(categories.id, products.categoryId))
    .where(
      and(
        sql`upper(${publicProductLinks.slug}) = upper(${slug})`,
        eq(publicProductLinks.isActive, true),
        eq(products.isPublished, true),
        eq(products.status, "active"),
      ),
    );
  if (!row) return null;

  const [sizes, images, settings] = await Promise.all([
    db.select({ size: productSizes.size, onHand: productSizes.onHand, reserved: productSizes.reserved }).from(productSizes).where(eq(productSizes.productId, row.productId)),
    db
      .select({ kind: productImages.kind, key: productImages.storageKey, width: productImages.width, height: productImages.height, variant: productImages.variant, createdAt: productImages.createdAt })
      .from(productImages)
      .where(eq(productImages.productId, row.productId)),
    getSettings(db),
  ]);

  // Newest AI set first (marketing cards, then model photos), the original last.
  const rank = { marketing: 0, ai_model: 1, original: 2 } as const;
  const sorted = images.sort((a, b) => rank[a.kind] - rank[b.kind] || b.createdAt.getTime() - a.createdAt.getTime() || a.variant - b.variant);

  return {
    slug: row.slug,
    sku: row.sku,
    name: row.name,
    description: row.description,
    audience: row.audience,
    category: row.category,
    price: row.price,
    currency: settings.currencySymbol,
    brand: settings.brandName,
    tagline: settings.brandTagline,
    maxOrderQuantity: settings.maxOrderQuantity,
    sizes: sortSizes(sizes).map((s) => ({ size: s.size, available: Math.max(0, s.onHand - s.reserved) })),
    images: sorted.slice(0, 8).map((i) => ({ kind: i.kind, url: fileUrl(i.key)!, width: i.width, height: i.height })),
  };
}

export async function recordView(db: Executor, slug: string) {
  await db
    .update(publicProductLinks)
    .set({ viewCount: sql`${publicProductLinks.viewCount} + 1` })
    .where(sql`upper(${publicProductLinks.slug}) = upper(${slug})`);
}

export async function listLinks(db: Executor) {
  return db
    .select({
      productId: products.id,
      name: products.name,
      sku: products.sku,
      slug: publicProductLinks.slug,
      isActive: publicProductLinks.isActive,
      isPublished: products.isPublished,
      status: products.status,
      viewCount: publicProductLinks.viewCount,
      createdAt: publicProductLinks.createdAt,
      thumbKey: sql<string | null>`(SELECT coalesce(pi.thumb_key, pi.storage_key) FROM product_images pi WHERE pi.product_id = products.id ORDER BY (pi.kind = 'marketing') DESC, pi.created_at DESC LIMIT 1)`,
    })
    .from(publicProductLinks)
    .innerJoin(products, eq(products.id, publicProductLinks.productId))
    .orderBy(desc(publicProductLinks.createdAt))
    .limit(200);
}
