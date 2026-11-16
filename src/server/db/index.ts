import { Pool as NeonPool } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-serverless";
import { drizzle as drizzlePg, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool as PgPool } from "pg";
import * as schema from "./schema";
import { pgConnection } from "./ssl";

export type Database = NodePgDatabase<typeof schema>;
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
/** Anything that can run queries: the pool or an open transaction. */
export type Executor = Database | Transaction;

function isNeonUrl(url: string) {
  return /\.neon\.tech(:\d+)?\//.test(url) || process.env.DB_DRIVER === "neon";
}

export function createDb(url: string): { db: Database; close: () => Promise<void> } {
  if (isNeonUrl(url)) {
    // WebSocket pool: supports interactive transactions, which inventory and orders need.
    const pool = new NeonPool({ connectionString: url, max: 10 });
    const db = drizzleNeon(pool, { schema }) as unknown as Database;
    return { db, close: () => pool.end() };
  }
  const pool = new PgPool({ ...pgConnection(url), max: Number(process.env.DATABASE_POOL_MAX ?? 10) });
  return { db: drizzlePg(pool, { schema }), close: () => pool.end() };
}

const globalForDb = globalThis as unknown as { __threadlineDb?: ReturnType<typeof createDb> };

function getDb() {
  if (!globalForDb.__threadlineDb) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    globalForDb.__threadlineDb = createDb(url);
  }
  return globalForDb.__threadlineDb.db;
}

/** Lazily created so importing this module never needs a database (e.g. during build). */
export const db: Database = new Proxy({} as Database, {
  get(_target, prop) {
    const real = getDb() as unknown as Record<string | symbol, unknown>;
    const value = real[prop];
    return typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(real) : value;
  },
});

export { schema };
