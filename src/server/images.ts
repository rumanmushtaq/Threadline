import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { IMAGE_MAX_BYTES } from "@/lib/validation/product";
import { AppError } from "./errors";
import { storage } from "./storage";
import { withLogo, type LogoCorner } from "./brand/logo";

const FORMATS = { jpeg: "image/jpeg", png: "image/png", webp: "image/webp" } as const;
const EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as const;
export const THUMB_WIDTH = 480;
export const DISPLAY_WIDTH = 1600;

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
  return { contentType, width: meta.width!, height: meta.height! };
}

export function extensionFor(contentType: string) {
  return EXT[contentType as keyof typeof EXT] ?? "bin";
}

export type StoredImage = {
  storageKey: string;
  thumbKey: string;
  displayKey: string | null;
  hasLogo: boolean;
  contentType: string;
  width: number;
  height: number;
};

/**
 * Thumbnail and (optionally) a display copy. sharp drops EXIF/GPS metadata when it
 * re-encodes, so customers only ever see these copies, never the raw upload.
 * Each copy gets its own random name: knowing a public display URL must never let
 * anyone work out the original's URL.
 */
export async function storeDerivatives(storageKey: string, buf: Buffer, withDisplay: boolean, logo?: LogoStamp | null) {
  const folder = storageKey.split("/").slice(0, 2).join("/");
  const thumbKey = `${folder}/derived/${randomUUID()}.webp`;
  const displayKey = withDisplay ? `${folder}/derived/${randomUUID()}.webp` : null;
  const s = storage();
  const written: string[] = [];
  try {
    const thumb = await stamped(await sharp(buf).rotate().resize({ width: THUMB_WIDTH, withoutEnlargement: true }).png().toBuffer(), logo)
      .then((b) => sharp(b).webp({ quality: 80 }).toBuffer());
    await s.put(thumbKey, thumb, "image/webp");
    written.push(thumbKey);
    if (displayKey) {
      const display = await stamped(await sharp(buf).rotate().resize({ width: DISPLAY_WIDTH, withoutEnlargement: true }).png().toBuffer(), logo)
        .then((b) => sharp(b).webp({ quality: 86 }).toBuffer());
      await s.put(displayKey, display, "image/webp");
      written.push(displayKey);
    }
  } catch (err) {
    await Promise.allSettled(written.map((k) => s.delete(k)));
    throw err;
  }
  return { thumbKey, displayKey, hasLogo: !!logo };
}

/** Brand logo for the copies customers see; null means no logo. */
export type LogoStamp = { brand: string; corner: LogoCorner };

async function stamped(img: Buffer, logo?: LogoStamp | null) {
  return logo ? withLogo(img, logo) : img;
}

/**
 * Stores the untouched original (never lost or re-encoded) plus derivatives.
 * Returns the keys so the caller can delete them if its DB transaction fails.
 */
export async function storeImage(
  prefix: string,
  buf: Buffer,
  opts: { contentType?: string; display?: boolean; logo?: LogoStamp | null } = {},
): Promise<StoredImage> {
  const info = opts.contentType
    ? { ...(await sharp(buf).metadata()), contentType: opts.contentType }
    : await inspectImage(buf);
  const storageKey = `${prefix}/${randomUUID()}.${extensionFor(info.contentType)}`;
  const s = storage();
  await s.put(storageKey, buf, info.contentType);
  try {
    const d = await storeDerivatives(storageKey, buf, opts.display ?? true, opts.logo);
    return { storageKey, ...d, contentType: info.contentType, width: info.width!, height: info.height! };
  } catch (err) {
    await s.delete(storageKey).catch(() => {});
    throw err;
  }
}

export async function deleteStoredImage(img: Pick<StoredImage, "storageKey" | "thumbKey" | "displayKey">) {
  const s = storage();
  await Promise.allSettled([img.storageKey, img.thumbKey, img.displayKey].filter((k): k is string => !!k).map((k) => s.delete(k)));
}
