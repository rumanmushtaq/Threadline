import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { logActivity } from "./activity";
import type { Database } from "./db";
import { productImages, products } from "./db/schema";
import { AppError } from "./errors";
import { deleteStoredImage, inspectImage, storeDerivatives, storeImage, type StoredImage } from "./images";
import { photoLogo } from "./settings";

export const MAX_PHOTOS_PER_PRODUCT = 12;

/**
 * Adds a photo the team took or chose by hand. It starts "pending": customers see it only
 * after an admin approves it, unless an admin uploads it with approveNow.
 */
export async function addProductPhoto(
  db: Database,
  actorId: string,
  productId: string,
  image: Buffer | { storageKey: string; data: Buffer },
  opts: { approveNow?: boolean } = {},
) {
  const [product] = await db.select({ id: products.id, sku: products.sku, status: products.status }).from(products).where(eq(products.id, productId));
  if (!product) throw new AppError("Product not found.", "NOT_FOUND");
  if (product.status === "archived") throw new AppError("This product is archived. Restore it before adding photos.", "VALIDATION");
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(productImages)
    .where(and(eq(productImages.productId, productId), eq(productImages.kind, "photo")));
  if (count >= MAX_PHOTOS_PER_PRODUCT) {
    throw new AppError(`A product can have up to ${MAX_PHOTOS_PER_PRODUCT} extra photos. Delete one first.`, "VALIDATION", { image: ["Too many photos"] });
  }

  const logo = await photoLogo(db);
  let stored: StoredImage;
  if (Buffer.isBuffer(image)) {
    stored = await storeImage(`products/${randomUUID()}/photos`, image, { logo });
  } else {
    const [used] = await db.select({ id: productImages.id }).from(productImages).where(eq(productImages.storageKey, image.storageKey));
    if (used) throw new AppError("This photo upload was already used. Please upload the picture again.", "CONFLICT", { image: ["Upload again"] });
    const info = await inspectImage(image.data);
    stored = { storageKey: image.storageKey, ...(await storeDerivatives(image.storageKey, image.data, true, logo)), ...info };
  }

  try {
    return await db.transaction(async (tx) => {
      const now = new Date();
      const [row] = await tx
        .insert(productImages)
        .values({
          productId,
          kind: "photo",
          ...stored,
          uploadedBy: actorId,
          review: opts.approveNow ? "approved" : "pending",
          reviewedBy: opts.approveNow ? actorId : null,
          reviewedAt: opts.approveNow ? now : null,
        })
        .returning({ id: productImages.id, review: productImages.review });
      await logActivity(tx, {
        userId: actorId,
        action: "photo.added",
        entityType: "product",
        entityId: productId,
        metadata: { sku: product.sku, imageId: row.id, review: row.review },
      });
      return row;
    });
  } catch (err) {
    await deleteStoredImage(stored);
    throw err;
  }
}

/** An admin's check: approved photos show to customers, hidden ones never do. Works on every photo. */
export async function reviewProductPhoto(db: Database, actorId: string, imageId: string, review: "approved" | "hidden") {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(productImages)
      .set({ review, reviewedBy: actorId, reviewedAt: new Date() })
      .where(eq(productImages.id, imageId))
      .returning({ id: productImages.id, productId: productImages.productId, kind: productImages.kind });
    if (!row) throw new AppError("Photo not found.", "NOT_FOUND");
    const [p] = await tx.select({ sku: products.sku }).from(products).where(eq(products.id, row.productId));
    await logActivity(tx, {
      userId: actorId,
      action: review === "approved" ? "photo.approved" : "photo.hidden",
      entityType: "product",
      entityId: row.productId,
      metadata: { sku: p?.sku, imageId: row.id, kind: row.kind },
    });
    return row;
  });
}

/** Removes a hand-uploaded photo for good. Originals and AI photos can only be hidden. */
export async function deleteProductPhoto(db: Database, actorId: string, imageId: string) {
  const row = await db.transaction(async (tx) => {
    const [deleted] = await tx
      .delete(productImages)
      .where(and(eq(productImages.id, imageId), eq(productImages.kind, "photo")))
      .returning();
    if (!deleted) throw new AppError("Only photos added by hand can be deleted. Hide the others instead.", "VALIDATION");
    const [p] = await tx.select({ sku: products.sku }).from(products).where(eq(products.id, deleted.productId));
    await logActivity(tx, { userId: actorId, action: "photo.deleted", entityType: "product", entityId: deleted.productId, metadata: { sku: p?.sku, imageId } });
    return deleted;
  });
  // Files go only after the row is gone, so a failed delete never leaves a broken photo.
  await deleteStoredImage({ storageKey: row.storageKey, thumbKey: row.thumbKey ?? "", displayKey: row.displayKey });
  return { productId: row.productId };
}
