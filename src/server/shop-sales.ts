import { and, asc, eq, gt, isNull, sql } from "drizzle-orm";
import { toMinor } from "@/lib/format";
import { recordSaleSchema, type SaleChannel } from "@/lib/validation/sale";
import { parseOrThrow } from "./action";
import { logActivity } from "./activity";
import type { Database, Executor } from "./db";
import { products, productSizes, shopSales } from "./db/schema";
import { businessMidday, businessToday, type ResolvedRange } from "./date-range";
import { AppError } from "./errors";
import { applyStockChange } from "./inventory";

type Num = string | number | null;
const n = (v: Num) => Number(v ?? 0);

/** Records an in-person sale: takes the pieces out of stock and saves price and cost on the row. */
export async function recordShopSale(db: Database, actorId: string, raw: unknown) {
  const input = parseOrThrow(recordSaleSchema, raw);
  const today = businessToday();
  if (input.soldOn > today) throw new AppError("The sale date cannot be in the future.", "VALIDATION", { soldOn: ["Pick today or an earlier date"] });

  return db.transaction(async (tx) => {
    const [product] = await tx
      .select({ id: products.id, sku: products.sku, name: products.name, status: products.status, cost: products.purchasePriceMinor, target: products.sellingPriceMinor })
      .from(products)
      .where(eq(products.id, input.productId))
      .for("update");
    if (!product) throw new AppError("Product not found.", "NOT_FOUND");
    if (product.status === "archived") throw new AppError("This product is archived. Restore it before selling.", "VALIDATION");
    if (toMinor(input.unitPrice) < product.target && !input.note) {
      throw new AppError("It sold below the target sale price. Add the reason in the note.", "VALIDATION", { note: ["Write why it sold below the target sale price"] });
    }

    const [size] = await tx
      .select({ id: productSizes.id })
      .from(productSizes)
      .where(and(eq(productSizes.productId, product.id), eq(productSizes.size, input.size)));
    if (!size) throw new AppError(`Size ${input.size} does not exist for this product.`, "VALIDATION", { size: ["Choose another size"] });

    const [sale] = await tx
      .insert(shopSales)
      .values({
        productId: product.id,
        productSizeId: size.id,
        size: input.size,
        quantity: input.quantity,
        unitPriceMinor: toMinor(input.unitPrice),
        unitCostMinor: product.cost,
        // Today's sales keep the real time; earlier dates get midday so they land on the right day.
        soldAt: input.soldOn === today ? new Date() : businessMidday(input.soldOn),
        note: input.note || null,
        recordedBy: actorId,
      })
      .returning({ id: shopSales.id, saleNumber: shopSales.saleNumber });

    // Guarded: fails with a clear message if there are not enough pieces (reserved ones included).
    await applyStockChange(tx, {
      productSizeId: size.id,
      type: "sale",
      onHand: -input.quantity,
      sold: input.quantity,
      reason: `Shop sale ${sale.saleNumber}`,
      userId: actorId,
    });

    await logActivity(tx, {
      userId: actorId,
      action: "sale.recorded",
      entityType: "shop_sale",
      entityId: sale.id,
      metadata: { saleNumber: sale.saleNumber, sku: product.sku, size: input.size, quantity: input.quantity, price: toMinor(input.unitPrice) },
    });
    return { id: sale.id, saleNumber: sale.saleNumber, productName: product.name };
  });
}

/** Undoes a mistaken sale: the pieces go back on the shelf and the sale stops counting. */
export async function cancelShopSale(db: Database, actorId: string, id: string) {
  return db.transaction(async (tx) => {
    const [sale] = await tx
      .update(shopSales)
      .set({ cancelledAt: new Date(), cancelledBy: actorId })
      .where(and(eq(shopSales.id, id), isNull(shopSales.cancelledAt)))
      .returning();
    if (!sale) throw new AppError("This sale was not found or is already cancelled.", "CONFLICT");

    await applyStockChange(tx, {
      productSizeId: sale.productSizeId,
      type: "adjustment",
      onHand: sale.quantity,
      sold: -sale.quantity,
      reason: `Shop sale ${sale.saleNumber} cancelled`,
      userId: actorId,
    });
    await logActivity(tx, {
      userId: actorId,
      action: "sale.cancelled",
      entityType: "shop_sale",
      entityId: sale.id,
      metadata: { saleNumber: sale.saleNumber, quantity: sale.quantity },
    });
    return { saleNumber: sale.saleNumber };
  });
}

/** Products with pieces left, for the "Record shop sale" form. */
export async function saleOptions(db: Executor) {
  const rows = await db
    .select({
      id: products.id,
      sku: products.sku,
      name: products.name,
      sellingPriceMinor: products.sellingPriceMinor,
      size: productSizes.size,
      available: sql<number>`${productSizes.onHand} - ${productSizes.reserved}`,
    })
    .from(products)
    .innerJoin(productSizes, eq(productSizes.productId, products.id))
    .where(and(eq(products.status, "active"), gt(sql`${productSizes.onHand} - ${productSizes.reserved}`, 0)))
    .orderBy(asc(products.name), asc(productSizes.size));

  const byProduct = new Map<string, { id: string; sku: string; name: string; sellingPriceMinor: number; sizes: { size: (typeof rows)[number]["size"]; available: number }[] }>();
  for (const r of rows) {
    const p = byProduct.get(r.id) ?? { id: r.id, sku: r.sku, name: r.name, sellingPriceMinor: r.sellingPriceMinor, sizes: [] };
    p.sizes.push({ size: r.size, available: Number(r.available) });
    byProduct.set(r.id, p);
  }
  return [...byProduct.values()];
}

export type SaleRow = {
  channel: "shop" | "website";
  id: string;
  number: string;
  soldAt: Date;
  productId: string;
  sku: string;
  productName: string;
  size: string;
  quantity: number;
  unitPriceMinor: number;
  unitCostMinor: number;
  totalMinor: number;
  profitMinor: number;
  who: string | null;
  note: string | null;
  cancelled: boolean;
  orderId: string | null;
};

/**
 * Every sale in the range, from both places: shop sales and delivered website orders (one
 * row per order line). Cancelled shop sales are listed for the record but never counted.
 */
export async function listSales(db: Executor, range: ResolvedRange, channel: SaleChannel = "all") {
  const from = range.from ?? new Date(0);
  const rows = (
    await db.execute<{
      channel: "shop" | "website";
      id: string;
      number: string;
      sold_at: string;
      product_id: string;
      sku: string;
      product_name: string;
      size: string;
      quantity: Num;
      unit_price: Num;
      unit_cost: Num;
      who: string | null;
      note: string | null;
      cancelled: boolean;
      order_id: string | null;
    }>(sql`
      SELECT * FROM (
        SELECT 'shop' AS channel, s.id::text, s.sale_number AS number, s.sold_at, p.id AS product_id, p.sku, p.name AS product_name,
               s.size::text, s.quantity, s.unit_price_minor AS unit_price, s.unit_cost_minor AS unit_cost,
               u.name AS who, s.note, s.cancelled_at IS NOT NULL AS cancelled, NULL::uuid AS order_id
          FROM shop_sales s JOIN products p ON p.id = s.product_id LEFT JOIN users u ON u.id = s.recorded_by
         WHERE s.sold_at >= ${from} AND s.sold_at < ${range.to} AND ${channel !== "website"}
        UNION ALL
        SELECT 'website', oi.id::text, o.order_number, o.delivered_at, p.id, p.sku, oi.product_name,
               oi.size::text, oi.quantity, oi.unit_price_minor, oi.unit_cost_minor,
               o.customer_name, o.notes, false, o.id
          FROM orders o JOIN order_items oi ON oi.order_id = o.id JOIN products p ON p.id = oi.product_id
         WHERE o.status = 'delivered' AND o.delivered_at >= ${from} AND o.delivered_at < ${range.to} AND ${channel !== "shop"}
      ) x
      ORDER BY sold_at DESC, number DESC
      LIMIT 1000`)
  ).rows;

  return rows.map(
    (r): SaleRow => ({
      channel: r.channel,
      id: r.id,
      number: r.number,
      soldAt: new Date(r.sold_at),
      productId: r.product_id,
      sku: r.sku,
      productName: r.product_name,
      size: r.size,
      quantity: n(r.quantity),
      unitPriceMinor: n(r.unit_price),
      unitCostMinor: n(r.unit_cost),
      totalMinor: n(r.unit_price) * n(r.quantity),
      profitMinor: (n(r.unit_price) - n(r.unit_cost)) * n(r.quantity),
      who: r.who,
      note: r.note,
      cancelled: r.cancelled,
      orderId: r.order_id,
    }),
  );
}

