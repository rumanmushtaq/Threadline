import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { formatMoney } from "@/lib/format";
import { AUDIENCE_LABEL, sortSizes } from "@/lib/sizes";
import { logActivity } from "../activity";
import { db as defaultDb, type Database } from "../db";
import { aiGenerationJobs, categories, productImages, products, productSizes } from "../db/schema";
import { deleteStoredImage, storeImage, type StoredImage } from "../images";
import { notifyUser } from "../notifications";
import { getSettings } from "../settings";
import { storage } from "../storage";
import { composeMarketingCard } from "./compose";
import { buildPrompt } from "./prompt";
import { getImageProvider, PermanentAIError, PROVIDER_TIMEOUT_MS } from "./provider";

type Job = typeof aiGenerationJobs.$inferSelect;

const LOCK_MINUTES = 10;

export function aiVariations() {
  return Math.min(4, Math.max(1, Number(process.env.AI_VARIATIONS ?? 2)));
}
const WORKER_ID = `${process.pid}-${randomUUID().slice(0, 8)}`;

/** Exponential backoff between attempts: 30 s, 2 min, 8 min, ... */
export function retryDelayMs(attempts: number) {
  return 30_000 * 4 ** Math.max(0, attempts - 1);
}

/**
 * Atomically claims the next runnable job. SKIP LOCKED lets any number of workers
 * (after() kicks, cron, the long-running worker) run at once without double work.
 * A job stuck in "processing" past its lock (crashed worker) is picked up again.
 */
export async function claimNextJob(db: Database): Promise<Job | null> {
  const res = await db.execute<Record<string, unknown>>(sql`
    UPDATE ai_generation_jobs
       SET status = 'processing',
           attempts = attempts + 1,
           locked_until = now() + make_interval(mins => ${LOCK_MINUTES}),
           started_at = coalesce(started_at, now()),
           updated_at = now()
     WHERE id = (
       SELECT id FROM ai_generation_jobs
        WHERE (status = 'pending' AND run_after <= now())
           OR (status = 'processing' AND locked_until < now() AND attempts < max_attempts)
        ORDER BY run_after
        FOR UPDATE SKIP LOCKED
        LIMIT 1)
    RETURNING id`);
  const id = res.rows[0]?.id as string | undefined;
  if (!id) return null;
  const [job] = await db.select().from(aiGenerationJobs).where(eq(aiGenerationJobs.id, id));
  return job ?? null;
}

async function processJob(db: Database, job: Job) {
  const [product] = await db
    .select({
      id: products.id,
      sku: products.sku,
      name: products.name,
      description: products.description,
      audience: products.audience,
      status: products.status,
      sellingPriceMinor: products.sellingPriceMinor,
      createdBy: products.createdBy,
      category: categories.name,
    })
    .from(products)
    .leftJoin(categories, eq(categories.id, products.categoryId))
    .where(eq(products.id, job.productId));
  if (!product) throw new PermanentAIError("Product not found");
  if (product.status === "archived") throw new PermanentAIError("Product is archived");

  const [original] = await db
    .select()
    .from(productImages)
    .where(and(eq(productImages.productId, product.id), eq(productImages.kind, "original")))
    .orderBy(productImages.createdAt)
    .limit(1);
  if (!original) throw new PermanentAIError("Original product image is missing");

  const [settings, sizes, provider, source] = await Promise.all([
    getSettings(db),
    db.select({ size: productSizes.size }).from(productSizes).where(eq(productSizes.productId, product.id)),
    getImageProvider(),
    storage().get(original.storageKey),
  ]);

  // Keep generated files in the same (non-identifying) folder as the original.
  const folder = original.storageKey.split("/").slice(0, 2).join("/");
  const count = aiVariations();
  const generated = await provider.generate({
    sourceImage: source,
    sourceContentType: original.contentType,
    prompt: buildPrompt({ ...product, category: product.category }),
    count,
  });

  const card = {
    name: product.name,
    sku: product.sku,
    price: formatMoney(product.sellingPriceMinor, settings.currencySymbol),
    sizes: sortSizes(sizes).map((s) => s.size),
    audience: AUDIENCE_LABEL[product.audience],
    category: product.category,
    brand: settings.brandName,
    tagline: settings.brandTagline,
  };

  const stored: StoredImage[] = [];
  try {
    const rows: (typeof productImages.$inferInsert)[] = [];
    for (const [i, img] of generated.entries()) {
      const photo = await storeImage(`${folder}/ai`, img.data, { contentType: img.contentType });
      stored.push(photo);
      rows.push({ productId: product.id, kind: "ai_model", jobId: job.id, variant: i, ...photo });

      const composed = await composeMarketingCard(img.data, card, i);
      const marketing = await storeImage(`${folder}/marketing`, composed, { contentType: "image/jpeg", display: false });
      stored.push(marketing);
      rows.push({ productId: product.id, kind: "marketing", jobId: job.id, variant: i, ...marketing });
    }

    await db.transaction(async (tx) => {
      // Fencing: finish only if this worker still owns the job. If the lock expired and
      // another worker re-claimed it (attempts moved on), this result is dropped.
      const owned = await tx
        .update(aiGenerationJobs)
        .set({ status: "completed", provider: provider.name, finishedAt: new Date(), lockedUntil: null, lastError: null })
        .where(and(eq(aiGenerationJobs.id, job.id), eq(aiGenerationJobs.status, "processing"), eq(aiGenerationJobs.attempts, job.attempts)))
        .returning({ id: aiGenerationJobs.id });
      if (!owned.length) throw new LostJobError();
      await tx.insert(productImages).values(rows);
      await notifyUser(tx, job.requestedBy ?? product.createdBy, {
        type: "ai.completed",
        title: "AI photos are ready",
        body: `${product.name} (${product.sku}) has ${generated.length} new marketing image${generated.length === 1 ? "" : "s"}.`,
        href: `/products/${product.id}`,
      });
      await logActivity(tx, {
        userId: null,
        action: "ai.generated",
        entityType: "product",
        entityId: product.id,
        metadata: { sku: product.sku, provider: provider.name, images: generated.length, attempts: job.attempts },
      });
    });
  } catch (err) {
    await Promise.all(stored.map((s) => deleteStoredImage(s)));
    throw err;
  }
}

class LostJobError extends Error {
  constructor() {
    super("Job was taken over by another worker");
  }
}

async function failJob(db: Database, job: Job, err: unknown) {
  if (err instanceof LostJobError) return; // the new owner reports the outcome
  const message = (err instanceof Error ? err.message : String(err)).slice(0, 500);
  const permanent = err instanceof PermanentAIError;
  const final = permanent || job.attempts >= job.maxAttempts;

  await db.transaction(async (tx) => {
    const owned = await tx
      .update(aiGenerationJobs)
      .set(
        final
          ? { status: "failed", lastError: message, finishedAt: new Date(), lockedUntil: null }
          : { status: "pending", lastError: message, lockedUntil: null, runAfter: new Date(Date.now() + retryDelayMs(job.attempts)) },
      )
      .where(and(eq(aiGenerationJobs.id, job.id), eq(aiGenerationJobs.status, "processing"), eq(aiGenerationJobs.attempts, job.attempts)))
      .returning({ id: aiGenerationJobs.id });
    if (!owned.length) return;
    if (final) {
      const [p] = await tx.select({ name: products.name, sku: products.sku, createdBy: products.createdBy }).from(products).where(eq(products.id, job.productId));
      if (p) {
        await notifyUser(tx, job.requestedBy ?? p.createdBy, {
          type: "ai.failed",
          title: "AI photo generation failed",
          body: `${p.name} (${p.sku}): ${message}`,
          href: `/products/${job.productId}`,
        });
      }
      await logActivity(tx, {
        userId: null,
        action: "ai.failed",
        entityType: "product",
        entityId: job.productId,
        metadata: { sku: p?.sku, error: message, attempts: job.attempts },
      });
    }
  });
}

/**
 * Jobs whose worker died on the last allowed attempt (lock expired, no retries left)
 * are marked failed so they are never picked up again or billed again.
 */
export async function failAbandonedJobs(db: Database) {
  const rows = await db
    .update(aiGenerationJobs)
    .set({ status: "failed", lastError: "The worker stopped before finishing (time limit or crash).", finishedAt: new Date(), lockedUntil: null })
    .where(and(eq(aiGenerationJobs.status, "processing"), sql`${aiGenerationJobs.lockedUntil} < now()`, sql`${aiGenerationJobs.attempts} >= ${aiGenerationJobs.maxAttempts}`))
    .returning({ productId: aiGenerationJobs.productId, requestedBy: aiGenerationJobs.requestedBy });
  for (const r of rows) {
    const [p] = await db.select({ name: products.name, sku: products.sku, createdBy: products.createdBy }).from(products).where(eq(products.id, r.productId));
    if (p) {
      await notifyUser(db, r.requestedBy ?? p.createdBy, {
        type: "ai.failed",
        title: "AI photo generation failed",
        body: `${p.name} (${p.sku}): the worker stopped before finishing. Use “Regenerate AI images” to try again.`,
        href: `/products/${r.productId}`,
      });
    }
    await logActivity(db, { userId: null, action: "ai.failed", entityType: "product", entityId: r.productId, metadata: { sku: p?.sku, error: "worker stopped" } });
  }
  return rows.length;
}

/** Worst case for one job: every provider call hitting its timeout, plus storage and composing. */
export function worstCaseJobMs() {
  return aiVariations() * PROVIDER_TIMEOUT_MS + 30_000;
}

/**
 * Processes jobs until none are runnable or the job limit is reached. With `mustFinishBy`
 * (e.g. a serverless time limit), a job is only started if it can finish in time even in
 * the worst case, so the platform never kills a half-done, already-paid-for job.
 */
export async function runWorker(opts: { db?: Database; maxJobs?: number; mustFinishBy?: number } = {}) {
  const db = opts.db ?? defaultDb;
  const maxJobs = opts.maxJobs ?? 10;
  let processed = 0;
  while (processed < maxJobs && (!opts.mustFinishBy || Date.now() + worstCaseJobMs() < opts.mustFinishBy)) {
    const job = await claimNextJob(db);
    if (!job) break;
    processed++;
    try {
      await processJob(db, job);
    } catch (err) {
      console.error(`[ai-worker ${WORKER_ID}] job ${job.id} attempt ${job.attempts} failed:`, err instanceof Error ? err.message : err);
      await failJob(db, job, err);
    }
  }
  return { processed };
}

/** Fire-and-forget trigger used right after a request finishes. Never throws. */
export async function kickWorker() {
  try {
    // Runs inside the request that saved the product; keep it within a typical 300 s function limit.
    await runWorker({ maxJobs: 1, mustFinishBy: Date.now() + 280_000 });
  } catch (err) {
    console.error("[ai-worker] kick failed", err);
  }
}
