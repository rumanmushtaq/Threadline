"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { parseOrThrow, runAction } from "@/server/action";
import { requirePermission } from "@/server/auth/current";
import { can } from "@/server/auth/permissions";
import { db } from "@/server/db";
import { AppError } from "@/server/errors";
import { addProductPhoto, deleteProductPhoto, reviewProductPhoto } from "@/server/product-photos";
import { createUploadTicket, limitUploadTickets, resolveUploadedImage, uploadedImageSchema } from "@/server/uploads";

function refresh(productId: string) {
  revalidatePath(`/products/${productId}`);
  revalidatePath("/products");
  revalidatePath("/shop");
}

/** Where the browser should upload a photo (straight to Cloudinary when it is set up). */
export async function preparePhotoUploadAction() {
  return runAction(async () => {
    const user = await requirePermission("photo.upload");
    await limitUploadTickets(db, user.id);
    return createUploadTicket(user.id);
  });
}

export async function addPhotoAction(formData: FormData) {
  return runAction(async () => {
    const user = await requirePermission("photo.upload");
    const productId = parseOrThrow(z.uuid(), String(formData.get("productId") ?? ""));
    // Only someone who may check photos can skip the check.
    const approveNow = formData.get("approveNow") === "true" && can(user.role, "photo.review");
    let image: Buffer | { storageKey: string; data: Buffer };
    const uploaded = formData.get("upload");
    if (typeof uploaded === "string" && uploaded) {
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
      if (!(file instanceof File) || file.size === 0) throw new AppError("Choose a photo to upload.", "VALIDATION", { image: ["Choose a photo"] });
      image = Buffer.from(await file.arrayBuffer());
    }
    const res = await addProductPhoto(db, user.id, productId, image, { approveNow });
    refresh(productId);
    return res;
  });
}

const reviewSchema = z.object({ id: z.uuid(), productId: z.uuid(), review: z.enum(["approved", "hidden"]) });

export async function reviewPhotoAction(input: unknown) {
  return runAction(async () => {
    const user = await requirePermission("photo.review");
    const { id, productId, review } = parseOrThrow(reviewSchema, input);
    await reviewProductPhoto(db, user.id, id, review);
    refresh(productId);
    return { review };
  });
}

export async function deletePhotoAction(input: unknown) {
  return runAction(async () => {
    const user = await requirePermission("photo.review");
    const { id } = parseOrThrow(z.object({ id: z.uuid() }), input);
    const res = await deleteProductPhoto(db, user.id, id);
    refresh(res.productId);
    return res;
  });
}
