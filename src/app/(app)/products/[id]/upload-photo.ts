"use client";

import { addPhotoAction, preparePhotoUploadAction } from "./photo-actions";

/** Upload one file: straight to Cloudinary when it is set up, else through the server. */
export async function uploadPhoto(productId: string, file: File, approveNow: boolean) {
  const fd = new FormData();
  fd.set("productId", productId);
  fd.set("approveNow", String(approveNow));
  const ticket = await preparePhotoUploadAction();
  if (!ticket.ok) return ticket;
  if (ticket.data.mode === "cloudinary") {
    const up = new FormData();
    for (const [k, v] of Object.entries(ticket.data.fields)) up.set(k, v);
    up.set("file", file);
    const r = await fetch(ticket.data.uploadUrl, { method: "POST", body: up }).catch(() => null);
    const body = (await r?.json().catch(() => null)) as { public_id?: string; format?: string; error?: { message?: string } } | null;
    if (!r?.ok || !body?.public_id || !body.format) {
      return { ok: false as const, error: body?.error?.message ?? "The photo could not be uploaded. Check your connection and try again." };
    }
    fd.set("upload", JSON.stringify({ publicId: body.public_id, format: body.format, expires: ticket.data.expires, token: ticket.data.token }));
  } else {
    fd.set("image", file);
  }
  return addPhotoAction(fd);
}
