import { and, asc, count, desc, eq, ilike, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { AUDIENCES, sortSizes, type Audience, type Size } from "@/lib/sizes";
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
  images: { kind: "marketing" | "ai_model" | "photo" | "original"; url: string; width: number | null; height: number | null }[];
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
      .select({ kind: productImages.kind, key: sql<string | null>`CASE WHEN ${productImages.kind} = 'marketing' THEN ${productImages.storageKey} ELSE ${productImages.displayKey} END`, width: productImages.width, height: productImages.height, variant: productImages.variant, createdAt: productImages.createdAt })
      .from(productImages)
      // Customers only ever see photos the team has approved.
      .where(and(eq(productImages.productId, row.productId), eq(productImages.review, "approved"))),
    getSettings(db),
  ]);

  // Newest AI set first (marketing cards, then model photos and hand-added photos), the original last.
  const rank = { marketing: 0, ai_model: 1, photo: 1, original: 2 } as const;
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
    // Photos without a metadata-free copy yet (saved before copies existed) stay hidden until the backfill runs.
    images: sorted
      .filter((i) => i.key)
      .slice(0, 8)
      .map((i) => ({ kind: i.kind, url: fileUrl(i.key)!, width: i.width, height: i.height })),
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
      thumbKey: sql<string | null>`(SELECT coalesce(pi.thumb_key, pi.storage_key) FROM product_images pi WHERE pi.product_id = products.id AND pi.review = 'approved' ORDER BY (pi.kind = 'marketing') DESC, pi.created_at DESC LIMIT 1)`,
    })
    .from(publicProductLinks)
    .innerJoin(products, eq(products.id, publicProductLinks.productId))
    .orderBy(desc(publicProductLinks.createdAt))
    .limit(200);
}

// ---------------------------------------------------------------------------
// Shop: every published product, for customers. Same rule as the product page:
// only what a customer may see (no costs, margins, users or internal ids).
// ---------------------------------------------------------------------------

export const SHOP_PAGE_SIZE = 24;
export const SHOP_SORTS = ["newest", "price-asc", "price-desc"] as const;

/** Shop URL parameters. Anything unexpected falls back to the default instead of failing. */
export const shopFiltersSchema = z.object({
  q: z.string().trim().max(80).catch("").default(""),
  category: z.string().trim().max(80).catch("").default(""),
  audience: z.enum(AUDIENCES).optional().catch(undefined),
  sort: z.enum(SHOP_SORTS).catch("newest").default("newest"),
  page: z.coerce.number().int().min(1).max(1000).catch(1).default(1),
});
export type ShopFilters = z.infer<typeof shopFiltersSchema>;

export type ShopItem = {
  slug: string;
  name: string;
  category: string | null;
  audience: Audience;
  price: number;
  available: number;
  imageUrl: string | null;
};

const onSale = and(eq(publicProductLinks.isActive, true), eq(products.isPublished, true), eq(products.status, "active"));

export async function listShop(db: Executor, f: ShopFilters) {
  const where: SQL[] = [onSale!];
  if (f.q) where.push(ilike(products.name, `%${f.q.replace(/[\\%_]/g, (c) => "\\" + c)}%`));
  if (f.category) where.push(eq(categories.slug, f.category));
  if (f.audience) where.push(eq(products.audience, f.audience));

  const available = sql<number>`coalesce((SELECT sum(greatest(ps.on_hand - ps.reserved, 0)) FROM product_sizes ps WHERE ps.product_id = ${products.id}), 0)::int`;
  // A customer-safe, approved photo: the newest AI or hand-added model photo, else the uploaded
  // original (all re-encoded, no metadata).
  const image = sql<string | null>`(SELECT pi.thumb_key FROM product_images pi
     WHERE pi.product_id = ${products.id} AND pi.kind IN ('ai_model', 'photo', 'original') AND pi.display_key IS NOT NULL AND pi.review = 'approved'
     ORDER BY (pi.kind <> 'original') DESC, pi.created_at DESC, pi.variant LIMIT 1)`;
  const order =
    f.sort === "price-asc" ? asc(products.sellingPriceMinor) : f.sort === "price-desc" ? desc(products.sellingPriceMinor) : desc(products.createdAt);

  const base = () =>
    db
      .select({
        slug: publicProductLinks.slug,
        name: products.name,
        category: categories.name,
        audience: products.audience,
        price: products.sellingPriceMinor,
        available,
        image,
      })
      .from(publicProductLinks)
      .innerJoin(products, eq(products.id, publicProductLinks.productId))
      .leftJoin(categories, eq(categories.id, products.categoryId))
      .where(and(...where));

  const [rows, [{ total }], cats, settings] = await Promise.all([
    base()
      // Sold-out items go last, so the first screen shows what can be ordered.
      .orderBy(sql`(${available} = 0)`, order, desc(products.id))
      .limit(SHOP_PAGE_SIZE)
      .offset((f.page - 1) * SHOP_PAGE_SIZE),
    db
      .select({ total: count() })
      .from(publicProductLinks)
      .innerJoin(products, eq(products.id, publicProductLinks.productId))
      .leftJoin(categories, eq(categories.id, products.categoryId))
      .where(and(...where)),
    // Only categories that have something on sale.
    db
      .select({ name: categories.name, slug: categories.slug, n: count() })
      .from(publicProductLinks)
      .innerJoin(products, eq(products.id, publicProductLinks.productId))
      .innerJoin(categories, eq(categories.id, products.categoryId))
      .where(and(onSale, eq(categories.isActive, true)))
      .groupBy(categories.name, categories.slug)
      .orderBy(asc(categories.name)),
    getSettings(db),
  ]);

  return {
    items: rows.map(({ image, ...r }): ShopItem => ({ ...r, imageUrl: fileUrl(image) })),
    total,
    pages: Math.max(1, Math.ceil(total / SHOP_PAGE_SIZE)),
    categories: cats.map((c) => ({ name: c.name, slug: c.slug, count: c.n })),
    currency: settings.currencySymbol,
    brand: settings.brandName,
    tagline: settings.brandTagline,
  };
}
