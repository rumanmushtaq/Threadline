import { sql } from "drizzle-orm";
import { afterAll, expect, it } from "vitest";
import { db, testDb } from "./helpers";

afterAll(() => testDb.close());

it("every table has row level security on (Supabase Data API sees nothing)", async () => {
  const res = await db.execute<{ relname: string }>(sql`
    SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity
       AND c.relname NOT LIKE '\\_\\_drizzle%'`);
  expect(res.rows.map((r) => r.relname)).toEqual([]);
});
