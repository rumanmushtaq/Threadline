import { and, eq, lt, sql } from "drizzle-orm";
import { failAbandonedJobs, runWorker } from "./ai/worker";
import { backfillDisplayCopies, sweepOrphanFilesThrottled } from "./storage-maintenance";
import type { Database } from "./db";
import { loginAttempts, rateLimitEvents } from "./db/schema";

const extraTasks: ((db: Database) => Promise<unknown>)[] = [];

/** Lets other modules (orders) add periodic work without a circular import. */
export function registerMaintenanceTask(task: (db: Database) => Promise<unknown>) {
  extraTasks.push(task);
}

/** Everything the cron sweep does: AI retries, crashed jobs, expiries and clean-up. */
export async function runMaintenance(db: Database, opts: { mustFinishBy?: number } = {}) {
  // Cheap, important work first, so a slow AI job can never starve it.
  const extra = [];
  for (const task of extraTasks) extra.push(await task(db));
  const abandoned = await failAbandonedJobs(db);
  const backfilled = await backfillDisplayCopies(db).catch((err) => (console.error("Backfill failed", err), 0));
  const swept = await sweepOrphanFilesThrottled(db).catch((err) => (console.error("File sweep failed", err), 0));
  const ai = await runWorker({ db, mustFinishBy: opts.mustFinishBy });
  const dayAgo = sql`now() - interval '1 day'`;
  // Failures only matter for 15 minutes; successes mark a trusted connection for 30 days.
  await db.delete(loginAttempts).where(and(eq(loginAttempts.success, false), lt(loginAttempts.createdAt, dayAgo)));
  await db.delete(loginAttempts).where(lt(loginAttempts.createdAt, sql`now() - interval '31 days'`));
  await db.delete(rateLimitEvents).where(lt(rateLimitEvents.createdAt, dayAgo));
  return { ai, abandoned, backfilled, swept, extra };
}
