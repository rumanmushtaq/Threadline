import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { IMAGE_MAX_BYTES } from "@/lib/validation/product";
import { AppError } from "./errors";
import { storage } from "./storage";

const FORMATS = { jpeg: "image/jpeg", png: "image/png", webp: "image/webp" } as const;
const EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as const;
export const THUMB_WIDTH = 480;

/** Checks the real bytes (not the file name or browser MIME type) and reads dimensions. */
export async function inspectImage(buf: Buffer) {
  if (buf.length === 0) throw new AppError("The image file is empty.", "VALIDATION", { image: ["Empty file"] });
  if (buf.length > IMAGE_MAX_BYTES) {
    throw new AppError("Images must be 8 MB or smaller.", "VALIDATION", { image: ["Larger than 8 MB"] });
  }
  let meta: Awaited<ReturnType<ReturnType<typeof sharp>["metadata"]>>;
  try {
    meta = await sharp(buf).metadata();
  } catch {
    throw new AppError("This file is not a readable image.", "VALIDATION", { image: ["Not an image"] });
  }
  const contentType = FORMATS[meta.format as keyof typeof FORMATS];
  if (!contentType) throw new AppError("Use a JPG, PNG or WebP image.", "VALIDATION", { image: ["Unsupported format"] });
  if ((meta.width ?? 0) < 200 || (meta.height ?? 0) < 200) {
    throw new AppError("The image is too small. Use at least 200 × 200 pixels.", "VALIDATION", { image: ["Too small"] });
  }
  return { contentType, width: meta.width!, height: meta.height!, orientation: meta.orientation };
}

export type StoredImage = { storageKey: string; thumbKey: string; contentType: string; width: number; height: number };

/**
 * Stores the untouched original (never lost or re-encoded) plus a WebP thumbnail.
 * Returns the keys so the caller can delete them if its DB transaction fails.
 */
export async function storeImage(prefix: string, buf: Buffer, opts: { contentType?: string } = {}): Promise<StoredImage> {
  const info = opts.contentType
    ? { ...(await sharp(buf).metadata()), contentType: opts.contentType }
    : await inspectImage(buf);
  const id = randomUUID();
  const ext = EXT[info.contentType as keyof typeof EXT] ?? "bin";
  const storageKey = `${prefix}/${id}.${ext}`;
  const thumbKey = `${prefix}/${id}-thumb.webp`;
  const thumb = await sharp(buf).rotate().resize({ width: THUMB_WIDTH, withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
  const s = storage();
  await s.put(storageKey, buf, info.contentType);
  try {
    await s.put(thumbKey, thumb, "image/webp");
  } catch (err) {
    await s.delete(storageKey).catch(() => {});
    throw err;
  }
  return { storageKey, thumbKey, contentType: info.contentType, width: info.width!, height: info.height! };
}

export async function deleteStoredImage(img: Pick<StoredImage, "storageKey" | "thumbKey">) {
  const s = storage();
  await Promise.allSettled([s.delete(img.storageKey), s.delete(img.thumbKey)]);
}
