import { and, eq, inArray } from "drizzle-orm";
import type { Executor } from "../db";
import { aiGenerationJobs } from "../db/schema";

/**
 * Queues AI generation for a product. The partial unique index allows only one
 * pending/processing job per product, so duplicates are silently skipped.
 */
export async function enqueueGeneration(tx: Executor, productId: string, requestedBy: string | null) {
  const [job] = await tx
    .insert(aiGenerationJobs)
    .values({ productId, requestedBy, maxAttempts: Number(process.env.AI_MAX_ATTEMPTS ?? 3) })
    .onConflictDoNothing()
    .returning({ id: aiGenerationJobs.id });
  return job ?? null;
}

export async function activeJobFor(tx: Executor, productId: string) {
  const [job] = await tx
    .select({ id: aiGenerationJobs.id, status: aiGenerationJobs.status })
    .from(aiGenerationJobs)
    .where(and(eq(aiGenerationJobs.productId, productId), inArray(aiGenerationJobs.status, ["pending", "processing"])))
    .limit(1);
  return job ?? null;
}
