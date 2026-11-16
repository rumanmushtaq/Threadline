import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { SIZES } from "@/lib/sizes";
import { logActivity } from "./activity";
import type { Database, Executor } from "./db";
import { inventoryTransactions, products, productSizes, users } from "./db/schema";
import { AppError } from "./errors";

type TxnType = (typeof inventoryTransactions.$inferInsert)["type"];

export type StockChange = {
  productSizeId: string;
  type: TxnType;
  onHand?: number;
  reserved?: number;
  sold?: number;
  reason?: string | null;
  orderId?: string | null;
  userId?: string | null;
};

/**
 * The single way stock changes. One guarded UPDATE keeps it atomic under concurrency:
 * if the change would make stock negative or reserve more than is on hand, no row
 * matches and nothing changes. Every change writes an immutable ledger row.
 */
export async function applyStockChange(tx: Executor, c: StockChange) {
  const dOn = c.onHand ?? 0;
  const dRes = c.reserved ?? 0;
  const dSold = c.sold ?? 0;
  const [row] = await tx
    .update(productSizes)
    .set({
      onHand: sql`${productSizes.onHand} + ${dOn}`,
      reserved: sql`${productSizes.reserved} + ${dRes}`,
      sold: sql`${productSizes.sold} + ${dSold}`,
    })
    .where(
      and(
        eq(productSizes.id, c.productSizeId),
        sql`${productSizes.onHand} + ${dOn} >= 0`,
        sql`${productSizes.reserved} + ${dRes} >= 0`,
        sql`${productSizes.reserved} + ${dRes} <= ${productSizes.onHand} + ${dOn}`,
      ),
    )
    .returning({
      productId: productSizes.productId,
      size: productSizes.size,
      onHand: productSizes.onHand,
      reserved: productSizes.reserved,
    });

  if (!row) {
    const [current] = await tx
      .select({ onHand: productSizes.onHand, reserved: productSizes.reserved, size: productSizes.size })
      .from(productSizes)
      .where(eq(productSizes.id, c.productSizeId));
    if (!current) throw new AppError("Size not found.", "NOT_FOUND");
    const available = current.onHand - current.reserved;
    throw new AppError(
      dRes > 0
        ? `Only ${available} left in size ${current.size}.`
        : `Not enough stock in size ${current.size}: ${current.onHand} on hand, ${current.reserved} reserved for orders.`,
      "STOCK",
    );
  }

  await tx.insert(inventoryTransactions).values({
    productId: row.productId,
    productSizeId: c.productSizeId,
    type: c.type,
    onHandDelta: dOn,
    reservedDelta: dRes,
    soldDelta: dSold,
    onHandAfter: row.onHand,
    reservedAfter: row.reserved,
    reason: c.reason ?? null,
    orderId: c.orderId ?? null,
    userId: c.userId ?? null,
  });
  return row;
}

export const stockMovementSchema = z
  .object({
    productId: z.uuid(),
    kind: z.enum(["stock_in", "adjustment", "stock_out"]),
    reason: z.string().trim().max(300).optional().default(""),
    lines: z
      .array(z.object({ size: z.enum(SIZES), quantity: z.number().int() }))
      .min(1, "Enter at least one size"),
  })
  .superRefine((v, ctx) => {
    const nonZero = v.lines.filter((l) => l.quantity !== 0);
    if (!nonZero.length) ctx.addIssue({ code: "custom", path: ["lines"], message: "Enter a quantity for at least one size" });
    if (v.kind !== "adjustment" && v.lines.some((l) => l.quantity < 0)) {
      ctx.addIssue({ code: "custom", path: ["lines"], message: "Quantities must be positive" });
    }
    if (v.lines.some((l) => Math.abs(l.quantity) > 100_000)) {
      ctx.addIssue({ code: "custom", path: ["lines"], message: "Quantity is too large" });
    }
    if (v.kind !== "stock_in" && v.reason.length < 3) {
      ctx.addIssue({ code: "custom", path: ["reason"], message: "Give a reason for this change" });
    }
  });

export type StockMovementInput = z.infer<typeof stockMovementSchema>;

/** Stock in (all accounts), adjustment and stock out (admin): one ledger row per size, one transaction. */
export async function recordStockMovement(db: Database, actorId: string, input: StockMovementInput) {
  return db.transaction(async (tx) => {
    const [product] = await tx
      .select({ id: products.id, sku: products.sku, status: products.status })
      .from(products)
      .where(eq(products.id, input.productId))
      .for("update");
    if (!product) throw new AppError("Product not found.", "NOT_FOUND");
    if (product.status === "archived") throw new AppError("This product is archived. Restore it before changing stock.", "VALIDATION");

    const sizes = await tx
      .select({ id: productSizes.id, size: productSizes.size })
      .from(productSizes)
      .where(eq(productSizes.productId, input.productId));

    const applied: { size: string; delta: number }[] = [];
    for (const line of input.lines) {
      if (line.quantity === 0) continue;
      const row = sizes.find((s) => s.size === line.size);
      if (!row) throw new AppError(`Size ${line.size} does not exist for this product.`, "VALIDATION");
      const delta = input.kind === "stock_out" ? -line.quantity : line.quantity;
      await applyStockChange(tx, {
        productSizeId: row.id,
        type: input.kind,
        onHand: delta,
        reason: input.reason || null,
        userId: actorId,
      });
      applied.push({ size: line.size, delta });
    }

    await logActivity(tx, {
      userId: actorId,
      action: `stock.${input.kind === "stock_in" ? "added" : input.kind === "stock_out" ? "removed" : "adjusted"}`,
      entityType: "product",
      entityId: input.productId,
      metadata: { sku: product.sku, lines: applied, reason: input.reason || undefined },
    });
    return applied;
  });
}

export async function stockHistory(db: Executor, productId: string, limit = 100) {
  return db
    .select({
      id: inventoryTransactions.id,
      type: inventoryTransactions.type,
      size: productSizes.size,
      onHandDelta: inventoryTransactions.onHandDelta,
      reservedDelta: inventoryTransactions.reservedDelta,
      soldDelta: inventoryTransactions.soldDelta,
      onHandAfter: inventoryTransactions.onHandAfter,
      reservedAfter: inventoryTransactions.reservedAfter,
      reason: inventoryTransactions.reason,
      orderId: inventoryTransactions.orderId,
      userName: users.name,
      createdAt: inventoryTransactions.createdAt,
    })
    .from(inventoryTransactions)
    .innerJoin(productSizes, eq(productSizes.id, inventoryTransactions.productSizeId))
    .leftJoin(users, eq(users.id, inventoryTransactions.userId))
    .where(eq(inventoryTransactions.productId, productId))
    .orderBy(desc(inventoryTransactions.createdAt), desc(inventoryTransactions.id))
    .limit(limit);
}

export const inventoryFiltersSchema = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  audience: z.enum(["kids", "youth", "adult"]).optional().catch(undefined),
  stock: z.enum(["low", "out"]).optional().catch(undefined),
  page: z.coerce.number().int().min(1).optional().catch(1),
});

const INVENTORY_PAGE = 30;

/** One row per product size, for the inventory module. */
export async function listInventory(db: Executor, f: z.infer<typeof inventoryFiltersSchema>, lowStockThreshold: number) {
  const conds = [sql`p.status = 'active'`];
  if (f.q) conds.push(sql`(p.name ILIKE ${"%" + f.q.replace(/[%_\\]/g, "\\$&") + "%"} OR p.sku ILIKE ${"%" + f.q.replace(/[%_\\]/g, "\\$&") + "%"})`);
  if (f.audience) conds.push(sql`p.audience = ${f.audience}`);
  if (f.stock === "out") conds.push(sql`ps.on_hand - ps.reserved = 0`);
  if (f.stock === "low") conds.push(sql`ps.on_hand - ps.reserved > 0 AND ps.on_hand - ps.reserved <= ${lowStockThreshold}`);
  const where = sql.join(conds, sql` AND `);
  const page = f.page ?? 1;

  const rows = await db.execute<{
    product_size_id: string;
    product_id: string;
    sku: string;
    name: string;
    audience: "kids" | "youth" | "adult";
    category: string | null;
    size: "XS" | "S" | "M" | "L" | "XL";
    on_hand: number;
    reserved: number;
    sold: number;
    total: number;
  }>(sql`
    SELECT ps.id AS product_size_id, p.id AS product_id, p.sku, p.name, p.audience, c.name AS category,
           ps.size, ps.on_hand, ps.reserved, ps.sold, count(*) OVER()::int AS total
      FROM product_sizes ps
      JOIN products p ON p.id = ps.product_id
      LEFT JOIN categories c ON c.id = p.category_id
     WHERE ${where}
     ORDER BY p.created_at DESC, array_position(ARRAY['XS','S','M','L','XL'], ps.size::text)
     LIMIT ${INVENTORY_PAGE} OFFSET ${(page - 1) * INVENTORY_PAGE}`);

  const total = rows.rows[0]?.total ?? 0;
  return { rows: rows.rows, total, page, pageCount: Math.max(1, Math.ceil(total / INVENTORY_PAGE)) };
}

export async function recentMovements(db: Executor, limit = 15) {
  return db
    .select({
      id: inventoryTransactions.id,
      type: inventoryTransactions.type,
      size: productSizes.size,
      onHandDelta: inventoryTransactions.onHandDelta,
      reservedDelta: inventoryTransactions.reservedDelta,
      productId: products.id,
      productName: products.name,
      sku: products.sku,
      userName: users.name,
      reason: inventoryTransactions.reason,
      createdAt: inventoryTransactions.createdAt,
    })
    .from(inventoryTransactions)
    .innerJoin(productSizes, eq(productSizes.id, inventoryTransactions.productSizeId))
    .innerJoin(products, eq(products.id, inventoryTransactions.productId))
    .leftJoin(users, eq(users.id, inventoryTransactions.userId))
    .orderBy(desc(inventoryTransactions.id))
    .limit(limit);
}
