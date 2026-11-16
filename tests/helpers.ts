import { sql } from "drizzle-orm";
import { createDb } from "@/server/db";
import { upsertAdmin, createStaffUser } from "@/server/users";

export const testDb = createDb(process.env.TEST_DATABASE_URL!);
export const db = testDb.db;

const TABLES = [
  "stock_reservations",
  "order_items",
  "inventory_transactions",
  "orders",
  "customers",
  "product_images",
  "ai_generation_jobs",
  "public_product_links",
  "product_sizes",
  "products",
  "notifications",
  "activity_logs",
  "sessions",
  "login_attempts",
  "rate_limit_events",
  "users",
];

/** Wipes data between tests. Replica mode skips the immutable-history triggers (test only). */
export async function resetDb() {
  await db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL session_replication_role = replica`);
    await tx.execute(sql.raw(`TRUNCATE ${TABLES.join(", ")} RESTART IDENTITY CASCADE`));
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
