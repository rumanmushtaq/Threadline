import { lt, sql } from "drizzle-orm";
import { runWorker } from "./ai/worker";
import { purgeExpiredSessions } from "./auth/session";
import type { Database } from "./db";
import { loginAttempts, rateLimitEvents } from "./db/schema";

const extraTasks: ((db: Database) => Promise<unknown>)[] = [];

/** Lets other modules (orders) add periodic work without a circular import. */
export function registerMaintenanceTask(task: (db: Database) => Promise<unknown>) {
  extraTasks.push(task);
}

/** Everything the cron sweep does: AI retries, crashed jobs, expiries and clean-up. */
export async function runMaintenance(db: Database, opts: { budgetMs?: number } = {}) {
  const ai = await runWorker({ db, budgetMs: opts.budgetMs ?? 45_000 });
  const extra = [];
  for (const task of extraTasks) extra.push(await task(db));
  await purgeExpiredSessions(db);
  const dayAgo = sql`now() - interval '1 day'`;
  await db.delete(loginAttempts).where(lt(loginAttempts.createdAt, dayAgo));
  await db.delete(rateLimitEvents).where(lt(rateLimitEvents.createdAt, dayAgo));
  return { ai, extra };
}
