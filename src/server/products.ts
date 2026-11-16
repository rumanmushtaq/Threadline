import { randomUUID } from "node:crypto";
import { and, asc, count, desc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { AUDIENCES, SIZES, SIZES_BY_AUDIENCE, sortSizes, type Size } from "@/lib/sizes";
import { toMinor } from "@/lib/format";
import { productUpdateSchema, type ProductInput } from "@/lib/validation/product";
import { logActivity } from "./activity";
import { enqueueGeneration } from "./ai/jobs";
import type { Database, Executor } from "./db";
import {
  aiGenerationJobs,
  categories,
  productImages,
  products,
  productSizes,
  publicProductLinks,
  users,
} from "./db/schema";
import { AppError, pgCode, pgConstraint } from "./errors";
import { deleteStoredImage, inspectImage, storeDerivatives, storeImage, type StoredImage } from "./images";
import { applyStockChange } from "./inventory";
import { getSettings } from "./settings";
import { fileUrl } from "./storage";

export type CreatedProduct = { id: string; sku: string; slug: string; jobId: string | null };

/**
 * Saves a new product in one transaction: product + SKU, size rows, original image,
 * initial stock ledger, public link and the AI job. The image is uploaded first and
 * removed again if the transaction fails, so no orphan files and no lost originals.
 */
export async function createProduct(
  db: Database,
  actorId: string,
  input: ProductInput,
  image: Buffer | { storageKey: string; data: Buffer },
  meta: { ip?: string | null } = {},
): Promise<CreatedProduct> {
  const productId = randomUUID();
  let stored: StoredImage;
  if (Buffer.isBuffer(image)) {
    await inspectImage(image);
    // Storage folders use their own random id so public image URLs never reveal database ids.
    stored = await storeImage(`products/${randomUUID()}/original`, image);
  } else {
    // Already uploaded straight to storage by the browser; add thumbnail and display copy.
    // A ticket can only be used once: replaying it must never touch another product's photo.
    if (await storageKeyInUse(db, image.storageKey)) {
      throw new AppError("This photo upload was already used. Please upload the picture again.", "CONFLICT", { image: ["Upload again"] });
    }
    const info = await inspectImage(image.data);
    const d = await storeDerivatives(image.storageKey, image.data, true);
    stored = { storageKey: image.storageKey, ...d, ...info };
  }

  try {
    return await db.transaction(async (tx) => {
      if (input.categoryId) {
        const [cat] = await tx.select({ id: categories.id }).from(categories).where(eq(categories.id, input.categoryId));
        if (!cat) throw new AppError("That category no longer exists.", "VALIDATION", { categoryId: ["Choose another category"] });
      }
      const settings = await getSettings(tx);

      const [product] = await tx
        .insert(products)
        .values({
          id: productId,
          name: input.name,
          description: input.description,
          audience: input.audience,
          categoryId: input.categoryId,
          purchasePriceMinor: toMinor(input.purchasePrice),
          sellingPriceMinor: toMinor(input.sellingPrice),
          isPublished: settings.autoPublishProducts,
          createdBy: actorId,
        })
        .returning({ id: products.id, sku: products.sku });

      // Every size of the group gets a row (possibly 0) so stock can be added later.
      const quantities = new Map(input.sizes.map((s) => [s.size, s.quantity]));
      const sizeRows = await tx
        .insert(productSizes)
        .values(SIZES_BY_AUDIENCE[input.audience].map((size) => ({ productId, size })))
        .returning({ id: productSizes.id, size: productSizes.size });

      for (const row of sizeRows) {
        const q = quantities.get(row.size) ?? 0;
        if (q > 0) {
          await applyStockChange(tx, {
            productSizeId: row.id,
            type: "initial",
            onHand: q,
            reason: "Initial stock",
            userId: actorId,
          });
        }
      }

      await tx.insert(productImages).values({ productId, kind: "original", ...stored });

      const [link] = await tx
        .insert(publicProductLinks)
        .values({ productId, slug: product.sku })
        .returning({ slug: publicProductLinks.slug });

      const job = await enqueueGeneration(tx, productId, actorId);

      await logActivity(tx, {
        userId: actorId,
        action: "product.created",
        entityType: "product",
        entityId: productId,
        metadata: { sku: product.sku, name: input.name, quantity: input.quantity, audience: input.audience },
        ip: meta.ip,
      });

      return { id: productId, sku: product.sku, slug: link.slug, jobId: job?.id ?? null };
    });
  } catch (err) {
    if (Buffer.isBuffer(image)) {
      await deleteStoredImage(stored);
    } else {
      // Remove only our own copies. The uploaded original is left for the orphan-file sweep,
      // which deletes it a day later if no product points at it: a concurrent request using
      // the same upload may still be about to commit.
      await deleteStoredImage({ storageKey: "", thumbKey: stored.thumbKey, displayKey: stored.displayKey });
    }
    if (pgCode(err) === "23505" && pgConstraint(err) === "product_images_storage_key_unique") {
      throw new AppError("This photo upload was already used. Please upload the picture again.", "CONFLICT", { image: ["Upload again"] });
    }
    throw err;
  }
}

async function storageKeyInUse(db: Executor, key: string) {
  const [row] = await db.select({ id: productImages.id }).from(productImages).where(eq(productImages.storageKey, key)).limit(1);
  return !!row;
}


export async function updateProduct(db: Database, actorId: string, input: z.infer<typeof productUpdateSchema>) {
  await db.transaction(async (tx) => {
    const [before] = await tx.select().from(products).where(eq(products.id, input.id)).for("update");
    if (!before) throw new AppError("Product not found.", "NOT_FOUND");
    const next = {
      name: input.name,
      description: input.description,
      categoryId: input.categoryId,
      purchasePriceMinor: toMinor(input.purchasePrice),
      sellingPriceMinor: toMinor(input.sellingPrice),
    };
    await tx.update(products).set(next).where(eq(products.id, input.id));
    const changed = Object.fromEntries(
      Object.entries(next)
        .filter(([k, v]) => before[k as keyof typeof before] !== v)
        .map(([k, v]) => [k, { from: before[k as keyof typeof before], to: v }]),
    );
    await logActivity(tx, {
      userId: actorId,
      action: "product.updated",
      entityType: "product",
      entityId: input.id,
      metadata: { sku: before.sku, changed },
    });
  });
}

export async function setProductArchived(db: Database, actorId: string, id: string, archived: boolean) {
  await db.transaction(async (tx) => {
    const [row] = await tx
      .update(products)
      .set({ status: archived ? "archived" : "active", archivedAt: archived ? new Date() : null })
      .where(eq(products.id, id))
      .returning({ sku: products.sku });
    if (!row) throw new AppError("Product not found.", "NOT_FOUND");
    await logActivity(tx, {
      userId: actorId,
      action: archived ? "product.archived" : "product.restored",
      entityType: "product",
      entityId: id,
      metadata: { sku: row.sku },
    });
  });
}

export async function setProductPublished(db: Database, actorId: string, id: string, published: boolean) {
  await db.transaction(async (tx) => {
    const [row] = await tx
      .update(products)
      .set({ isPublished: published })
      .where(eq(products.id, id))
      .returning({ sku: products.sku });
    if (!row) throw new AppError("Product not found.", "NOT_FOUND");
    await tx.update(publicProductLinks).set({ isActive: published }).where(eq(publicProductLinks.productId, id));
    await logActivity(tx, {
      userId: actorId,
      action: published ? "product.published" : "product.unpublished",
      entityType: "product",
      entityId: id,
      metadata: { sku: row.sku },
    });
  });
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export const productFiltersSchema = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  audience: z.enum(AUDIENCES).optional().catch(undefined),
  category: z.uuid().optional().catch(undefined),
  size: z.enum(SIZES).optional().catch(undefined),
  stock: z.enum(["in", "low", "out"]).optional().catch(undefined),
  status: z.enum(["active", "archived"]).optional().catch("active"),
  page: z.coerce.number().int().min(1).optional().catch(1),
});
export type ProductFilters = z.infer<typeof productFiltersSchema>;

export const PAGE_SIZE = 20;

const totals = {
  onHand: sql<number>`coalesce((SELECT sum(ps.on_hand) FROM product_sizes ps WHERE ps.product_id = products.id), 0)::int`,
  reserved: sql<number>`coalesce((SELECT sum(ps.reserved) FROM product_sizes ps WHERE ps.product_id = products.id), 0)::int`,
};
const availableSql = sql`(${totals.onHand} - ${totals.reserved})`;

export async function listProducts(db: Executor, f: ProductFilters) {
  const settings = await getSettings(db);
  const where: SQL[] = [eq(products.status, f.status ?? "active")];
  if (f.q) {
    const term = `%${f.q.replace(/[%_\\]/g, "\\$&")}%`;
    where.push(or(ilike(products.name, term), ilike(products.sku, term), ilike(products.description, term))!);
  }
  if (f.audience) where.push(eq(products.audience, f.audience));
  if (f.category) where.push(eq(products.categoryId, f.category));
  if (f.size) {
    where.push(
      sql`EXISTS (SELECT 1 FROM product_sizes ps WHERE ps.product_id = ${products.id} AND ps.size = ${f.size} AND ps.on_hand - ps.reserved > 0)`,
    );
  }
  if (f.stock === "out") where.push(sql`${availableSql} = 0`);
  if (f.stock === "low") where.push(sql`${availableSql} > 0 AND ${availableSql} <= ${settings.lowStockThreshold}`);
  if (f.stock === "in") where.push(sql`${availableSql} > 0`);

  const page = f.page ?? 1;
  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: products.id,
        sku: products.sku,
        name: products.name,
        audience: products.audience,
        status: products.status,
        isPublished: products.isPublished,
        purchasePriceMinor: products.purchasePriceMinor,
        sellingPriceMinor: products.sellingPriceMinor,
        categoryName: categories.name,
        creatorName: users.name,
        createdAt: products.createdAt,
        onHand: totals.onHand,
        reserved: totals.reserved,
        sizes: sql<string[]>`coalesce((SELECT array_agg(ps.size::text ORDER BY array_position(ARRAY['XS','S','M','L','XL'], ps.size::text)) FROM product_sizes ps WHERE ps.product_id = products.id AND ps.on_hand - ps.reserved > 0), '{}')`,
        thumbKey: sql<string | null>`(SELECT coalesce(pi.thumb_key, pi.storage_key) FROM product_images pi WHERE pi.product_id = products.id ORDER BY (pi.kind = 'original') DESC, pi.created_at LIMIT 1)`,
        aiStatus: sql<"pending" | "processing" | "completed" | "failed" | null>`(SELECT j.status FROM ai_generation_jobs j WHERE j.product_id = products.id ORDER BY j.created_at DESC LIMIT 1)`,
        linkActive: publicProductLinks.isActive,
        slug: publicProductLinks.slug,
      })
      .from(products)
      .leftJoin(categories, eq(categories.id, products.categoryId))
      .leftJoin(users, eq(users.id, products.createdBy))
      .leftJoin(publicProductLinks, eq(publicProductLinks.productId, products.id))
      .where(and(...where))
      .orderBy(desc(products.createdAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ total: count() }).from(products).where(and(...where)),
  ]);

  return {
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    lowStockThreshold: settings.lowStockThreshold,
    rows: rows.map((r) => ({ ...r, available: r.onHand - r.reserved, thumbUrl: fileUrl(r.thumbKey) })),
  };
}

export async function getProductDetail(db: Executor, id: string) {
  const product = await db.query.products.findFirst({
    where: eq(products.id, id),
    with: {
      category: { columns: { id: true, name: true } },
      creator: { columns: { name: true } },
      link: true,
    },
  });
  if (!product) return null;
  const [sizes, images, jobs] = await Promise.all([
    db.select().from(productSizes).where(eq(productSizes.productId, id)),
    db
      .select()
      .from(productImages)
      .where(eq(productImages.productId, id))
      .orderBy(asc(productImages.createdAt)),
    db
      .select()
      .from(aiGenerationJobs)
      .where(eq(aiGenerationJobs.productId, id))
      .orderBy(desc(aiGenerationJobs.createdAt))
      .limit(10),
  ]);
  return {
    ...product,
    sizes: sortSizes(sizes),
    images: images.map((i) => ({
      ...i,
      url: fileUrl(i.displayKey ?? i.storageKey)!,
      originalUrl: fileUrl(i.storageKey)!,
      thumbUrl: fileUrl(i.thumbKey ?? i.storageKey)!,
    })),
    jobs,
  };
}

export async function listCategories(db: Executor, activeOnly = true) {
  return db
    .select({ id: categories.id, name: categories.name, isActive: categories.isActive })
    .from(categories)
    .where(activeOnly ? eq(categories.isActive, true) : undefined)
    .orderBy(asc(categories.name));
}

export function availableSizes(rows: { size: Size; onHand: number; reserved: number }[]) {
  return sortSizes(rows).filter((r) => r.onHand - r.reserved > 0).map((r) => r.size);
}

export async function productsByIds(db: Executor, ids: string[]) {
  if (!ids.length) return [];
  return db.select({ id: products.id, sku: products.sku, name: products.name }).from(products).where(inArray(products.id, ids));
}
