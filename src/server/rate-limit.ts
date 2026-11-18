import { and, count, eq, gt, sql } from "drizzle-orm";
import type { Database } from "./db";
import { rateLimitEvents } from "./db/schema";

const HOUR_MS = 60 * 60 * 1000;

/** Counts and records one use of `key`; false when `limit` uses in the last hour are reached. */
export async function allowPerHour(db: Database, key: string, limit: number) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${key}))`);
    const [{ n }] = await tx
      .select({ n: count() })
      .from(rateLimitEvents)
      .where(and(eq(rateLimitEvents.key, key), gt(rateLimitEvents.createdAt, new Date(Date.now() - HOUR_MS))));
    if (n >= limit) return false;
    await tx.insert(rateLimitEvents).values({ key });
    return true;
  });
}
