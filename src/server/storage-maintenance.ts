import { and, asc, desc, eq, gt, inArray, isNull, lt, ne, sql } from "drizzle-orm";
import { logActivity } from "./activity";
import type { Database } from "./db";
import { productImages, rateLimitEvents } from "./db/schema";
import { deleteStoredImage, storeDerivatives } from "./images";
import { photoLogo } from "./settings";
import { storage } from "./storage";

const DAY = 24 * 60 * 60 * 1000;
const MAX_BACKFILL_ATTEMPTS = 3;

/** Every key the database still points at. */
async function referencedKeys(db: Database) {
  const rows = await db.select({ a: productImages.storageKey, b: productImages.thumbKey, c: productImages.displayKey }).from(productImages);
  const keys = new Set<string>();
  for (const r of rows) for (const k of [r.a, r.b, r.c]) if (k) keys.add(k);
  return keys;
}

/**
 * Deletes stored files that no image row points at and that are older than a day:
 * abandoned uploads, files from failed saves, anything uploaded with a misused ticket.
 */
export async function sweepOrphanFiles(db: Database, opts: { olderThanMs?: number; limit?: number } = {}) {
  const cutoff = Date.now() - (opts.olderThanMs ?? DAY);
  const limit = opts.limit ?? 500;
  const keep = await referencedKeys(db);
  let removed = 0;
  const prefix = "products/";
  for await (const obj of storage().list(prefix)) {
    if (removed >= limit) break;
    // Never touch anything outside this app's folder, whatever the storage API returns.
    const path = obj.key.replace(/^(raw|video):/, "");
    if (!path.startsWith(prefix)) continue;
    if (obj.createdAt.getTime() > cutoff || keep.has(obj.key)) continue;
    await obj.remove().catch((err) => console.error("Could not delete orphan file", obj.key, err));
    removed++;
  }
  if (removed) await logActivity(db, { userId: null, action: "storage.swept", entityType: "settings", metadata: { removed } });
  return removed;
}

/** Runs the sweep at most every 6 hours, however often the cron calls maintenance. */
export async function sweepOrphanFilesThrottled(db: Database) {
  const [recent] = await db
    .select({ id: rateLimitEvents.id })
    .from(rateLimitEvents)
    .where(and(eq(rateLimitEvents.key, "sweep:files"), gt(rateLimitEvents.createdAt, new Date(Date.now() - 6 * 60 * 60 * 1000))))
    .limit(1);
  if (recent) return 0;
  await db.insert(rateLimitEvents).values({ key: "sweep:files" });
  return sweepOrphanFiles(db);
}

/**
 * Photos saved before display copies existed get a metadata-free display copy and a
 * freshly named thumbnail (old thumbnail names revealed the original's name).
 */
export async function backfillDisplayCopies(db: Database, batch = 5) {
  const logo = await photoLogo(db);
  const rows = await db
    .select()
    .from(productImages)
    .where(and(isNull(productImages.displayKey), ne(productImages.kind, "marketing"), lt(productImages.displayAttempts, MAX_BACKFILL_ATTEMPTS)))
    .orderBy(asc(productImages.displayAttempts), desc(productImages.createdAt))
    .limit(batch);
  let done = 0;
  for (const row of rows) {
    try {
      const data = await storage().get(row.storageKey);
      const d = await storeDerivatives(row.storageKey, data, true, logo);
      const [updated] = await db
        .update(productImages)
        .set({ thumbKey: d.thumbKey, displayKey: d.displayKey, hasLogo: d.hasLogo })
        .where(and(eq(productImages.id, row.id), isNull(productImages.displayKey)))
        .returning({ id: productImages.id });
      if (!updated) {
        await deleteStoredImage({ storageKey: "", ...d });
        continue;
      }
      if (row.thumbKey) await deleteStoredImage({ storageKey: "", thumbKey: row.thumbKey, displayKey: null });
      done++;
    } catch (err) {
      // Counted, so a broken file is retried a few times and then left alone instead of
      // blocking every other photo behind it.
      await db
        .update(productImages)
        .set({ displayAttempts: sql`${productImages.displayAttempts} + 1` })
        .where(eq(productImages.id, row.id));
      console.error("Display backfill failed for image", row.id, err);
    }
  }
  return done;
}


const LOGO_KINDS = ["original", "ai_model", "photo"] as const;

/** How many customer photos still differ from the logo setting (logo missing, or still there when off). */
export async function photosNeedingLogoUpdate(db: Database) {
  const logo = await photoLogo(db);
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(productImages)
    .where(and(inArray(productImages.kind, [...LOGO_KINDS]), ne(productImages.hasLogo, !!logo)));
  return n;
}

/**
 * Brings existing photos in line with the logo setting, a few at a time: the thumbnail and
 * display copy are made again from the untouched original, with or without the logo.
 * With redoAll, photos that already match are made again too (after a brand or corner change).
 */
export async function syncPhotoLogos(db: Database, opts: { batch?: number; redoAll?: boolean; actorId?: string } = {}) {
  const logo = await photoLogo(db);
  if (opts.redoAll) {
    await db.update(productImages).set({ hasLogo: !logo }).where(inArray(productImages.kind, [...LOGO_KINDS]));
  }
  const rows = await db
    .select()
    .from(productImages)
    .where(and(inArray(productImages.kind, [...LOGO_KINDS]), ne(productImages.hasLogo, !!logo)))
    .orderBy(desc(productImages.createdAt))
    .limit(opts.batch ?? 8);
  let done = 0;
  for (const row of rows) {
    const data = await storage().get(row.storageKey);
    const d = await storeDerivatives(row.storageKey, data, true, logo);
    const [updated] = await db
      .update(productImages)
      .set({ thumbKey: d.thumbKey, displayKey: d.displayKey, hasLogo: d.hasLogo })
      .where(and(eq(productImages.id, row.id), eq(productImages.hasLogo, row.hasLogo)))
      .returning({ id: productImages.id });
    // Someone else updated it meanwhile: drop our copies, keep theirs.
    if (!updated) {
      await deleteStoredImage({ storageKey: "", ...d });
      continue;
    }
    await deleteStoredImage({ storageKey: "", thumbKey: row.thumbKey ?? "", displayKey: row.displayKey });
    done++;
  }
  if (done && opts.actorId) {
    await logActivity(db, { userId: opts.actorId, action: "photo.logo_updated", entityType: "settings", entityId: "1", metadata: { photos: done, logo: !!logo } });
  }
  return { done, left: await photosNeedingLogoUpdate(db) };
}
