import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { and, count, eq, gt } from "drizzle-orm";
import type { Database } from "./db";
import { rateLimitEvents } from "./db/schema";
import { z } from "zod";
import { AppError } from "./errors";
import { extensionFor, inspectImage } from "./images";
import { storage } from "./storage";
import { cloudinarySignature } from "./storage/cloudinary";

const TICKET_TTL_SECONDS = 30 * 60;

export type UploadTicket =
  | { mode: "server" }
  | {
      mode: "cloudinary";
      uploadUrl: string;
      fields: Record<string, string>;
      publicId: string;
      expires: number;
      token: string;
    };

const TICKETS_PER_HOUR = 60;

/** Caps how many signed upload tickets one account can request. */
export async function limitUploadTickets(db: Database, userId: string) {
  const key = `upload-ticket:${userId}`;
  const [{ n }] = await db
    .select({ n: count() })
    .from(rateLimitEvents)
    .where(and(eq(rateLimitEvents.key, key), gt(rateLimitEvents.createdAt, new Date(Date.now() - 60 * 60 * 1000))));
  if (n >= TICKETS_PER_HOUR) throw new AppError("Too many uploads in the last hour. Please wait a little.", "RATE_LIMITED");
  await db.insert(rateLimitEvents).values({ key });
}

function secret() {
  const s = process.env.CLOUDINARY_API_SECRET;
  if (!s) throw new Error("CLOUDINARY_API_SECRET is not set");
  return s;
}

function sign(publicId: string, userId: string, expires: number) {
  return createHmac("sha256", secret()).update(`${publicId}|${userId}|${expires}`).digest("base64url");
}

/**
 * With Cloudinary the browser uploads the original photo straight to Cloudinary,
 * so large photos never pass through the app server (Vercel caps request bodies
 * at 4.5 MB). The server fixes the destination name and signs it.
 */
export function createUploadTicket(userId: string): UploadTicket {
  if (process.env.STORAGE_DRIVER !== "cloudinary") return { mode: "server" };
  const publicId = `products/${randomUUID()}/original/${randomUUID()}`;
  const timestamp = Math.floor(Date.now() / 1000);
  // Signed, so Cloudinary refuses any other format (PDF, SVG, video...) for this upload.
  const params = { public_id: publicId, timestamp, overwrite: "false", unique_filename: "false", allowed_formats: "jpg,png,webp" };
  const expires = timestamp + TICKET_TTL_SECONDS;
  return {
    mode: "cloudinary",
    uploadUrl: `https://api.cloudinary.com/v1_1/${process.env.CLOUDINARY_CLOUD_NAME}/image/upload`,
    fields: {
      ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
      api_key: process.env.CLOUDINARY_API_KEY!,
      signature: cloudinarySignature(params, secret()),
    },
    publicId,
    expires,
    token: sign(publicId, userId, expires),
  };
}

export const uploadedImageSchema = z.object({
  publicId: z.string().regex(/^products\/[0-9a-f-]{36}\/original\/[0-9a-f-]{36}$/),
  format: z.enum(["jpg", "png", "webp"]),
  expires: z.number().int(),
  token: z.string().min(10).max(100),
});

/** Verifies the ticket, downloads the uploaded bytes and checks they are a real image. */
export async function resolveUploadedImage(userId: string, input: z.infer<typeof uploadedImageSchema>) {
  const expected = Buffer.from(sign(input.publicId, userId, input.expires));
  const given = Buffer.from(input.token);
  if (given.length !== expected.length || !timingSafeEqual(given, expected) || input.expires < Date.now() / 1000) {
    throw new AppError("The photo upload expired. Please upload the picture again.", "VALIDATION", { image: ["Upload again"] });
  }
  const storageKey = `${input.publicId}.${input.format}`;
  let data: Buffer;
  try {
    data = await storage().get(storageKey);
  } catch {
    throw new AppError("The uploaded photo could not be found. Please upload it again.", "VALIDATION", { image: ["Upload again"] });
  }
  // No deletes here: the key may belong to another product (replayed ticket). Unused uploads
  // are removed by the orphan-file sweep once nothing points at them.
  const info = await inspectImage(data);
  // Cloudinary converts on the fly (X.jpg can be fetched as X.png), so the format the client
  // claims must match the real bytes; otherwise one stored file could hide behind two keys.
  if (extensionFor(info.contentType) !== input.format) {
    throw new AppError("The uploaded photo does not match its file type. Please upload it again.", "VALIDATION", { image: ["Upload again"] });
  }
  return { storageKey, data, info };
}
