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
import { getImageProvider, PermanentAIError } from "./provider";

type Job = typeof aiGenerationJobs.$inferSelect;

const LOCK_MINUTES = 10;
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
           OR (status = 'processing' AND locked_until < now())
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
  const count = Math.min(4, Math.max(1, Number(process.env.AI_VARIATIONS ?? 2)));
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
      const marketing = await storeImage(`${folder}/marketing`, composed, { contentType: "image/jpeg" });
      stored.push(marketing);
      rows.push({ productId: product.id, kind: "marketing", jobId: job.id, variant: i, ...marketing });
    }

    await db.transaction(async (tx) => {
      await tx.insert(productImages).values(rows);
      await tx
        .update(aiGenerationJobs)
        .set({ status: "completed", provider: provider.name, finishedAt: new Date(), lockedUntil: null, lastError: null })
        .where(eq(aiGenerationJobs.id, job.id));
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

async function failJob(db: Database, job: Job, err: unknown) {
  const message = (err instanceof Error ? err.message : String(err)).slice(0, 500);
  const permanent = err instanceof PermanentAIError;
  const final = permanent || job.attempts >= job.maxAttempts;

  await db.transaction(async (tx) => {
    await tx
      .update(aiGenerationJobs)
      .set(
        final
          ? { status: "failed", lastError: message, finishedAt: new Date(), lockedUntil: null }
          : { status: "pending", lastError: message, lockedUntil: null, runAfter: new Date(Date.now() + retryDelayMs(job.attempts)) },
      )
      .where(eq(aiGenerationJobs.id, job.id));
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

/** Processes jobs until none are runnable, the job limit, or the time budget is reached. */
export async function runWorker(opts: { db?: Database; maxJobs?: number; budgetMs?: number } = {}) {
  const db = opts.db ?? defaultDb;
  const deadline = Date.now() + (opts.budgetMs ?? 50_000);
  const maxJobs = opts.maxJobs ?? 10;
  let processed = 0;
  while (processed < maxJobs && Date.now() < deadline) {
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
    await runWorker({ maxJobs: 3 });
  } catch (err) {
    console.error("[ai-worker] kick failed", err);
  }
}
