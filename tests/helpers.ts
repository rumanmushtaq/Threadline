import { sql } from "drizzle-orm";
import type { CookieMethodsServer } from "@supabase/ssr";
import { createDb } from "@/server/db";
import { supabaseForCookies } from "@/server/supabase/clients";
import { upsertAdmin, createStaffUser } from "@/server/users";

export const testDb = createDb(process.env.TEST_DATABASE_URL!);
export const db = testDb.db;

const TABLES = [
  "stock_reservations",
  "order_items",
  "inventory_transactions",
  "orders",
  "customer_accounts",
  "customers",
  "product_images",
  "ai_generation_jobs",
  "public_product_links",
  "product_sizes",
  "products",
  "notifications",
  "activity_logs",
  "login_attempts",
  "rate_limit_events",
  "users",
];

const AUTH_TABLES = ["auth.users", "auth.audit_log_entries", "auth.flow_state"];

/** Wipes data between tests. Replica mode skips the immutable-history triggers (test only). */
export async function resetDb() {
  await db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL session_replication_role = replica`);
    // auth.* belongs to the local Supabase Auth test server, which uses this same database.
    await tx.execute(sql.raw(`TRUNCATE ${[...TABLES, ...AUTH_TABLES].join(", ")} RESTART IDENTITY CASCADE`));
    await tx.execute(sql`ALTER SEQUENCE product_sku_seq RESTART WITH 1`);
    await tx.execute(sql`ALTER SEQUENCE order_number_seq RESTART WITH 1`);
    await tx.execute(sql`DELETE FROM settings`);
    await tx.execute(sql`INSERT INTO settings (id) VALUES (1)`);
  });
}

export async function seedUsers() {
  const admin = await upsertAdmin(db, { name: "Admin", email: "admin@test.local", password: "admin-pass-123" });
  const staff = await createStaffUser(db, admin.id, {
    name: "Staff One",
    email: "staff1@test.local",
    password: "staff-pass-123",
  });
  return { adminId: admin.id, staffId: staff.id };
}

import sharp from "sharp";
import type { ProductInput } from "@/lib/validation/product";

export async function testImage(color = "#b4532a", width = 600, height = 800) {
  return sharp({ create: { width, height, channels: 3, background: color } }).jpeg().toBuffer();
}

export function productInput(overrides: Partial<ProductInput> = {}): ProductInput {
  return {
    name: "Oversized Cotton Tee",
    description: "Premium quality cotton T-shirt with a modern oversized fit.",
    categoryId: null,
    audience: "adult",
    quantity: 45,
    sizes: [
      { size: "M", quantity: 10 },
      { size: "L", quantity: 20 },
      { size: "XL", quantity: 15 },
    ],
    purchasePrice: 800,
    sellingPrice: 1500,
    ...overrides,
  };
}

/** A pretend browser: a cookie jar plus the Supabase client that keeps its session there. */
export function browser() {
  const jar = new Map<string, string>();
  const cookies: CookieMethodsServer = {
    getAll: () => [...jar].map(([name, value]) => ({ name, value })),
    setAll: (list) => {
      for (const { name, value, options } of list) {
        if (!value || options?.maxAge === 0) jar.delete(name);
        else jar.set(name, value);
      }
    },
  };
  return { jar, supabase: supabaseForCookies(cookies) };
}

/** A second browser that starts with a copy of another one's cookies (e.g. a stolen session). */
export function copyOf(other: ReturnType<typeof browser>) {
  const b = browser();
  for (const [k, v] of other.jar) b.jar.set(k, v);
  return b;
}

/**
 * A browser whose session cookie was edited to claim another user (signature left as is),
 * the way an attacker would try. Supabase must reject it.
 */
export function forgedCopyOf(other: ReturnType<typeof browser>, claimUserId = "00000000-0000-4000-8000-000000000000") {
  const b = copyOf(other);
  const [name, value] = [...b.jar].find(([k]) => /-auth-token(\.0)?$/.test(k))!;
  const session = JSON.parse(Buffer.from(value.replace(/^base64-/, ""), "base64url").toString());
  const [head, body, sig] = session.access_token.split(".");
  const claims = JSON.parse(Buffer.from(body, "base64url").toString());
  session.access_token = [head, Buffer.from(JSON.stringify({ ...claims, sub: claimUserId })).toString("base64url"), sig].join(".");
  session.user = { ...session.user, id: claimUserId };
  b.jar.set(name, "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url"));
  return b;
}
