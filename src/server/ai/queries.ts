import { desc, eq, sql } from "drizzle-orm";
import type { Executor } from "../db";
import { aiGenerationJobs, products, users } from "../db/schema";
import { fileUrl } from "../storage";

export type JobStatus = "pending" | "processing" | "completed" | "failed";

export async function listJobs(db: Executor, status?: JobStatus) {
  const [counts, rows] = await Promise.all([
    db
      .select({ status: aiGenerationJobs.status, n: sql<number>`count(*)::int` })
      .from(aiGenerationJobs)
      .groupBy(aiGenerationJobs.status),
    db
      .select({
        id: aiGenerationJobs.id,
        status: aiGenerationJobs.status,
        provider: aiGenerationJobs.provider,
        attempts: aiGenerationJobs.attempts,
        maxAttempts: aiGenerationJobs.maxAttempts,
        lastError: aiGenerationJobs.lastError,
        runAfter: aiGenerationJobs.runAfter,
        startedAt: aiGenerationJobs.startedAt,
        finishedAt: aiGenerationJobs.finishedAt,
        createdAt: aiGenerationJobs.createdAt,
        productId: products.id,
        productName: products.name,
        sku: products.sku,
        requestedBy: users.name,
        thumbKey: sql<string | null>`(SELECT coalesce(pi.thumb_key, pi.storage_key) FROM product_images pi WHERE pi.job_id = ai_generation_jobs.id AND pi.kind = 'marketing' ORDER BY pi.variant LIMIT 1)`,
        originalKey: sql<string | null>`(SELECT coalesce(pi.thumb_key, pi.storage_key) FROM product_images pi WHERE pi.product_id = products.id AND pi.kind = 'original' LIMIT 1)`,
      })
      .from(aiGenerationJobs)
      .innerJoin(products, eq(products.id, aiGenerationJobs.productId))
      .leftJoin(users, eq(users.id, aiGenerationJobs.requestedBy))
      .where(status ? eq(aiGenerationJobs.status, status) : undefined)
      .orderBy(desc(aiGenerationJobs.createdAt))
      .limit(60),
  ]);
  const byStatus = Object.fromEntries(counts.map((c) => [c.status, c.n])) as Partial<Record<JobStatus, number>>;
  return {
    counts: byStatus,
    rows: rows.map((r) => ({ ...r, thumbUrl: fileUrl(r.thumbKey), originalUrl: fileUrl(r.originalKey) })),
  };
}
