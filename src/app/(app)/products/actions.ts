"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { productInputSchema, productUpdateSchema } from "@/lib/validation/product";
import { parseOrThrow, runAction } from "@/server/action";
import { enqueueGeneration } from "@/server/ai/jobs";
import { kickWorker } from "@/server/ai/worker";
import { logActivity } from "@/server/activity";
import { requestMeta, requirePermission } from "@/server/auth/current";
import { db } from "@/server/db";
import { AppError } from "@/server/errors";
import { recordStockMovement, stockMovementSchema } from "@/server/inventory";
import { createProduct, setProductArchived, setProductPublished, updateProduct } from "@/server/products";

export async function createProductAction(formData: FormData) {
  return runAction(async () => {
    const user = await requirePermission("product.create");
    let raw: unknown;
    try {
      raw = JSON.parse(String(formData.get("data") ?? ""));
    } catch {
      throw new AppError("The form data could not be read.", "VALIDATION");
    }
    const input = parseOrThrow(productInputSchema, raw);
    const file = formData.get("image");
    if (!(file instanceof File) || file.size === 0) {
      throw new AppError("Upload a product picture.", "VALIDATION", { image: ["Upload a product picture"] });
    }
    const { ip } = await requestMeta();
    const created = await createProduct(db, user.id, input, Buffer.from(await file.arrayBuffer()), { ip });
    // Runs after the response is sent: the user never waits for AI generation.
    after(() => kickWorker());
    revalidatePath("/products");
    revalidatePath("/dashboard");
    return { ...created, publicUrl: `${process.env.APP_URL ?? ""}/p/${created.slug}` };
  });
}

export async function updateProductAction(input: unknown) {
  return runAction(async () => {
    const user = await requirePermission("product.edit");
    const data = parseOrThrow(productUpdateSchema, input);
    await updateProduct(db, user.id, data);
    revalidatePath(`/products/${data.id}`);
    revalidatePath("/products");
    return null;
  });
}

const idFlag = z.object({ id: z.uuid(), value: z.boolean() });

export async function setArchivedAction(input: unknown) {
  return runAction(async () => {
    const user = await requirePermission("product.archive");
    const { id, value } = parseOrThrow(idFlag, input);
    await setProductArchived(db, user.id, id, value);
    revalidatePath(`/products/${id}`);
    revalidatePath("/products");
    return null;
  });
}

export async function setPublishedAction(input: unknown) {
  return runAction(async () => {
    const user = await requirePermission("product.publish");
    const { id, value } = parseOrThrow(idFlag, input);
    await setProductPublished(db, user.id, id, value);
    revalidatePath(`/products/${id}`);
    revalidatePath("/links");
    return null;
  });
}

export async function stockMovementAction(input: unknown) {
  return runAction(async () => {
    const data = parseOrThrow(stockMovementSchema, input);
    const user = await requirePermission(data.kind === "stock_in" ? "inventory.stock_in" : data.kind === "stock_out" ? "inventory.stock_out" : "inventory.adjust");
    const applied = await recordStockMovement(db, user.id, data);
    revalidatePath(`/products/${data.productId}`);
    revalidatePath("/inventory");
    return applied;
  });
}

export async function regenerateImagesAction(input: unknown) {
  return runAction(async () => {
    const user = await requirePermission("ai.regenerate");
    const { id } = parseOrThrow(z.object({ id: z.uuid() }), input);
    const job = await db.transaction(async (tx) => {
      const j = await enqueueGeneration(tx, id, user.id);
      if (!j) throw new AppError("Images for this product are already being generated.", "CONFLICT");
      await logActivity(tx, { userId: user.id, action: "ai.regenerate_requested", entityType: "product", entityId: id });
      return j;
    });
    after(() => kickWorker());
    revalidatePath(`/products/${id}`);
    revalidatePath("/ai-images");
    return job;
  });
}
