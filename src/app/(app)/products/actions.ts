"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { productInputSchema, productUpdateSchema } from "@/lib/validation/product";
import { parseOrThrow, runAction } from "@/server/action";
import { enqueueGeneration } from "@/server/ai/jobs";
import { aiConfigured, PROVIDER_LABEL, PROVIDER_NAMES, providerConfigured } from "@/server/ai/provider";
import { kickWorker } from "@/server/ai/worker";
import { logActivity } from "@/server/activity";
import { requestMeta, requirePermission } from "@/server/auth/current";
import { db } from "@/server/db";
import { AppError } from "@/server/errors";
import { recordStockMovement, stockMovementSchema } from "@/server/inventory";
import { createProduct, setProductArchived, setProductPublished, updateProduct } from "@/server/products";
import { createUploadTicket, limitUploadTickets, resolveUploadedImage, uploadedImageSchema } from "@/server/uploads";

/** Tells the browser where to upload the product photo (straight to Cloudinary when configured). */
export async function prepareUploadAction() {
  return runAction(async () => {
    const user = await requirePermission("product.create");
    await limitUploadTickets(db, user.id);
    return createUploadTicket(user.id);
  });
}

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
    const { ip } = await requestMeta();
    let image: Buffer | { storageKey: string; data: Buffer };
    const uploaded = formData.get("upload");
    if (typeof uploaded === "string" && uploaded) {
      // Photo went straight to Cloudinary; verify the signed ticket and the bytes.
      let ticket: unknown;
      try {
        ticket = JSON.parse(uploaded);
      } catch {
        throw new AppError("The photo upload could not be read.", "VALIDATION", { image: ["Upload again"] });
      }
      const resolved = await resolveUploadedImage(user.id, parseOrThrow(uploadedImageSchema, ticket));
      image = { storageKey: resolved.storageKey, data: resolved.data };
    } else {
      const file = formData.get("image");
      if (!(file instanceof File) || file.size === 0) {
        throw new AppError("Upload a product picture.", "VALIDATION", { image: ["Upload a product picture"] });
      }
      image = Buffer.from(await file.arrayBuffer());
    }
    const created = await createProduct(db, user.id, input, image, { ip });
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
    const { id, provider } = parseOrThrow(z.object({ id: z.uuid(), provider: z.enum(PROVIDER_NAMES).optional() }), input);
    if (provider && !providerConfigured(provider)) {
      throw new AppError(`${PROVIDER_LABEL[provider]} is not set up on the server.`, "VALIDATION");
    }
    if (!provider && !aiConfigured()) {
      throw new AppError("AI images are not set up yet. Add an AI image key on the server to turn them on.", "VALIDATION");
    }
    const job = await db.transaction(async (tx) => {
      const j = await enqueueGeneration(tx, id, user.id, provider ?? null);
      if (!j) throw new AppError("Images for this product are already being generated.", "CONFLICT");
      await logActivity(tx, { userId: user.id, action: "ai.regenerate_requested", entityType: "product", entityId: id, metadata: provider ? { provider } : {} });
      return j;
    });
    after(() => kickWorker());
    revalidatePath(`/products/${id}`);
    revalidatePath("/ai-images");
    return job;
  });
}
