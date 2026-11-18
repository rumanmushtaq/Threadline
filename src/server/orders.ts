import { and, count, desc, eq, gt, ilike, inArray, lt, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { orderInputSchema } from "@/lib/validation/order";
import { logActivity } from "./activity";
import type { Database, Executor, Transaction } from "./db";
import {
  customerAccounts,
  customers,
  orderItems,
  orders,
  products,
  productSizes,
  publicProductLinks,
  rateLimitEvents,
  stockReservations,
} from "./db/schema";
import { AppError } from "./errors";
import { applyStockChange } from "./inventory";
import { registerMaintenanceTask } from "./maintenance";
import { notifyStaff } from "./notifications";
import { getSettings } from "./settings";

export type OrderStatus = (typeof orders.$inferSelect)["status"];

const ORDER_WINDOW_MS = 10 * 60 * 1000;
const ORDER_LIMITS = { ip: 10, phone: 3 };

/**
 * Counts and records inside the order transaction while holding a per-key lock, so
 * parallel requests cannot all slip past the limit, and failed orders (sold out, typo)
 * roll back and do not count against the customer.
 */
async function enforceLimit(tx: Transaction, key: string, max: number) {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${key}))`);
  const [{ n }] = await tx
    .select({ n: count() })
    .from(rateLimitEvents)
    .where(and(eq(rateLimitEvents.key, key), gt(rateLimitEvents.createdAt, new Date(Date.now() - ORDER_WINDOW_MS))));
  if (n >= max) throw new AppError("Too many orders in a short time. Please try again in a few minutes.", "RATE_LIMITED");
  await tx.insert(rateLimitEvents).values({ key });
}

/** Reserves stock for every item of an order (guarded update, so it cannot oversell). */
async function reserveOrder(tx: Transaction, orderId: string, userId: string | null) {
  const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, orderId));
  for (const item of items) {
    await applyStockChange(tx, {
      productSizeId: item.productSizeId,
      type: "reserve",
      reserved: item.quantity,
      orderId,
      userId,
      reason: "Reserved for order",
    });
    await tx.insert(stockReservations).values({ orderItemId: item.id, productSizeId: item.productSizeId, quantity: item.quantity });
  }
  await tx.update(orders).set({ stockReserved: true }).where(eq(orders.id, orderId));
}

async function releaseOrConsume(tx: Transaction, orderId: string, mode: "release" | "consume", userId: string | null) {
  const active = await tx
    .select()
    .from(stockReservations)
    .innerJoin(orderItems, eq(orderItems.id, stockReservations.orderItemId))
    .where(and(eq(orderItems.orderId, orderId), eq(stockReservations.status, "active")));
  for (const { stock_reservations: r } of active) {
    await applyStockChange(tx, {
      productSizeId: r.productSizeId,
      type: mode === "release" ? "release" : "sale",
      reserved: -r.quantity,
      onHand: mode === "consume" ? -r.quantity : 0,
      sold: mode === "consume" ? r.quantity : 0,
      orderId,
      userId,
      reason: mode === "release" ? "Order cancelled" : "Order delivered",
    });
    await tx
      .update(stockReservations)
      .set({ status: mode === "release" ? "released" : "consumed" })
      .where(eq(stockReservations.id, r.id));
  }
  if (mode === "consume" && active.length === 0) {
    // Delivered without a reservation (should not happen, but never lose stock accuracy).
    const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, orderId));
    for (const item of items) {
      await applyStockChange(tx, { productSizeId: item.productSizeId, type: "sale", onHand: -item.quantity, sold: item.quantity, orderId, userId, reason: "Order delivered" });
    }
  }
  await tx.update(orders).set({ stockReserved: false }).where(eq(orders.id, orderId));
}

/** Public order submission. One transaction: customer, order, item snapshot, reservation, notifications. */
export async function placeOrder(db: Database, raw: unknown, meta: { ip: string; customerAccountId?: string }) {
  const parsed = orderInputSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const i of parsed.error.issues) (fieldErrors[i.path.join(".")] ??= []).push(i.message);
    throw new AppError("Please check the highlighted fields.", "VALIDATION", fieldErrors);
  }
  const input = parsed.data;
  if (input.website) throw new AppError("Your order could not be placed.", "VALIDATION");

  return db.transaction(async (tx) => {
    if (meta.ip !== "unknown") await enforceLimit(tx, `order:ip:${meta.ip}`, ORDER_LIMITS.ip);
    await enforceLimit(tx, `order:phone:${input.phone}`, ORDER_LIMITS.phone);
    const settings = await getSettings(tx);
    const [p] = await tx
      .select({
        id: products.id,
        name: products.name,
        sku: products.sku,
        sellingPriceMinor: products.sellingPriceMinor,
        purchasePriceMinor: products.purchasePriceMinor,
        status: products.status,
        isPublished: products.isPublished,
        linkActive: publicProductLinks.isActive,
      })
      .from(publicProductLinks)
      .innerJoin(products, eq(products.id, publicProductLinks.productId))
      .where(eq(publicProductLinks.slug, input.slug))
      .for("share", { of: products });
    if (!p || p.status !== "active" || !p.isPublished || !p.linkActive) {
      throw new AppError("This product is no longer available.", "NOT_FOUND");
    }
    if (input.quantity > settings.maxOrderQuantity) {
      throw new AppError(`You can order up to ${settings.maxOrderQuantity} pieces at once.`, "VALIDATION", {
        quantity: [`Maximum ${settings.maxOrderQuantity}`],
      });
    }
    const [size] = await tx
      .select()
      .from(productSizes)
      .where(and(eq(productSizes.productId, p.id), eq(productSizes.size, input.size)));
    if (!size) throw new AppError("This size is not offered for this product.", "VALIDATION", { size: ["Not available"] });
    if (size.onHand - size.reserved < input.quantity) {
      const left = size.onHand - size.reserved;
      throw new AppError(left > 0 ? `Only ${left} left in size ${input.size}.` : `Size ${input.size} is sold out.`, "STOCK", {
        quantity: [left > 0 ? `Only ${left} left` : "Sold out"],
      });
    }

    // An anonymous order must not rewrite a saved customer's details: the first record for a
    // phone number is kept, and each order carries its own delivery snapshot.
    await tx
      .insert(customers)
      .values({ phone: input.phone, name: input.customerName, whatsapp: input.whatsapp, address: input.address, city: input.city })
      .onConflictDoNothing({ target: customers.phone });
    const [customer] = await tx.select({ id: customers.id }).from(customers).where(eq(customers.phone, input.phone));
    await tx.update(customers).set({ updatedAt: new Date() }).where(eq(customers.id, customer.id));

    if (meta.customerAccountId) {
      // Remember the shopper's delivery details for their next order.
      await tx
        .update(customerAccounts)
        .set({ phone: input.phone, whatsapp: input.whatsapp, address: input.address, city: input.city })
        .where(eq(customerAccounts.id, meta.customerAccountId));
    }

    const [order] = await tx
      .insert(orders)
      .values({
        customerId: customer.id,
        customerAccountId: meta.customerAccountId ?? null,
        customerName: input.customerName,
        phone: input.phone,
        whatsapp: input.whatsapp,
        address: input.address,
        city: input.city,
        notes: input.notes,
        totalMinor: p.sellingPriceMinor * input.quantity,
      })
      .returning({ id: orders.id, orderNumber: orders.orderNumber, totalMinor: orders.totalMinor });

    await tx.insert(orderItems).values({
      orderId: order.id,
      productId: p.id,
      productSizeId: size.id,
      productName: p.name,
      sku: p.sku,
      size: input.size,
      unitPriceMinor: p.sellingPriceMinor,
      unitCostMinor: p.purchasePriceMinor,
      quantity: input.quantity,
    });

    if (settings.reservationPolicy === "on_order") await reserveOrder(tx, order.id, null);

    await logActivity(tx, {
      userId: null,
      action: "order.received",
      entityType: "order",
      entityId: order.id,
      metadata: { orderNumber: order.orderNumber, sku: p.sku, size: input.size, quantity: input.quantity },
      ip: meta.ip,
    });
    await notifyStaff(
      tx,
      {
        type: "order.received",
        title: `New order ${order.orderNumber}`,
        body: `${input.customerName} · ${p.name} (${input.size}) × ${input.quantity}`,
        href: `/orders/${order.id}`,
      },
      { adminsOnly: true },
    );

    return { orderNumber: order.orderNumber, totalMinor: order.totalMinor, productName: p.name, size: input.size, quantity: input.quantity };
  });
}

export const NEXT_STATUSES: Record<OrderStatus, OrderStatus[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["processing", "dispatched", "cancelled"],
  processing: ["dispatched", "cancelled"],
  dispatched: ["delivered", "cancelled"],
  delivered: [],
  cancelled: [],
};

export const transitionSchema = z.object({
  id: z.uuid(),
  to: z.enum(["confirmed", "processing", "dispatched", "delivered", "cancelled"]),
  reason: z.string().trim().max(200).optional(),
});

/** Moves an order along its workflow and keeps stock in step with it. */
export async function transitionOrder(db: Database, actorId: string | null, input: z.infer<typeof transitionSchema>) {
  return db.transaction(async (tx) => {
    const [order] = await tx.select().from(orders).where(eq(orders.id, input.id)).for("update");
    if (!order) throw new AppError("Order not found.", "NOT_FOUND");
    if (!NEXT_STATUSES[order.status].includes(input.to)) {
      throw new AppError(`A ${order.status} order cannot be marked ${input.to}.`, "CONFLICT");
    }

    const now = new Date();
    const patch: Partial<typeof orders.$inferInsert> = { status: input.to };
    if (input.to === "confirmed") {
      patch.confirmedAt = now;
      if (!order.stockReserved) await reserveOrder(tx, order.id, actorId);
    }
    if (input.to === "dispatched") {
      patch.dispatchedAt = now;
      if (!order.stockReserved) await reserveOrder(tx, order.id, actorId);
    }
    if (input.to === "delivered") {
      patch.deliveredAt = now;
      await releaseOrConsume(tx, order.id, "consume", actorId);
    }
    if (input.to === "cancelled") {
      patch.cancelledAt = now;
      patch.cancelReason = input.reason || null;
      if (order.stockReserved) await releaseOrConsume(tx, order.id, "release", actorId);
    }
    await tx.update(orders).set(patch).where(eq(orders.id, order.id));
    await logActivity(tx, {
      userId: actorId,
      action: `order.${input.to}`,
      entityType: "order",
      entityId: order.id,
      metadata: { orderNumber: order.orderNumber, from: order.status, reason: input.reason || undefined },
    });
    return { orderNumber: order.orderNumber, status: input.to };
  });
}

/** Cancels pending orders older than the configured expiry and frees their stock. */
export async function expirePendingOrders(db: Database) {
  const settings = await getSettings(db);
  if (!settings.pendingOrderExpiryHours) return { expired: 0 };
  const cutoff = new Date(Date.now() - settings.pendingOrderExpiryHours * 3_600_000);
  const stale = await db
    .select({ id: orders.id })
    .from(orders)
    .where(and(eq(orders.status, "pending"), lt(orders.createdAt, cutoff)))
    .limit(50);
  let expired = 0;
  for (const o of stale) {
    try {
      await transitionOrder(db, null, { id: o.id, to: "cancelled", reason: `Not confirmed within ${settings.pendingOrderExpiryHours} hours` });
      expired++;
    } catch (err) {
      console.error("Failed to expire order", o.id, err);
    }
  }
  return { expired };
}

registerMaintenanceTask(expirePendingOrders);

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export const orderFiltersSchema = z.object({
  status: z.enum(["pending", "confirmed", "processing", "dispatched", "delivered", "cancelled"]).optional().catch(undefined),
  q: z.string().trim().max(100).optional().catch(undefined),
  product: z.uuid().optional().catch(undefined),
  page: z.coerce.number().int().min(1).optional().catch(1),
});

const ORDERS_PAGE = 25;

export async function listOrders(db: Executor, f: z.infer<typeof orderFiltersSchema>) {
  const where: SQL[] = [];
  if (f.status) where.push(eq(orders.status, f.status));
  if (f.q) {
    const t = `%${f.q.replace(/[%_\\]/g, "\\$&")}%`;
    where.push(or(ilike(orders.orderNumber, t), ilike(orders.customerName, t), ilike(orders.phone, t), ilike(orders.city, t))!);
  }
  if (f.product) where.push(sql`EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = ${orders.id} AND oi.product_id = ${f.product})`);
  const page = f.page ?? 1;
  const cond = where.length ? and(...where) : undefined;
  const [rows, [{ total }], counts] = await Promise.all([
    db
      .select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        status: orders.status,
        customerName: orders.customerName,
        phone: orders.phone,
        city: orders.city,
        totalMinor: orders.totalMinor,
        createdAt: orders.createdAt,
        items: sql<string>`(SELECT string_agg(oi.product_name || ' (' || oi.size || ') × ' || oi.quantity, ', ') FROM order_items oi WHERE oi.order_id = orders.id)`,
      })
      .from(orders)
      .where(cond)
      .orderBy(desc(orders.createdAt))
      .limit(ORDERS_PAGE)
      .offset((page - 1) * ORDERS_PAGE),
    db.select({ total: count() }).from(orders).where(cond),
    db.select({ status: orders.status, n: sql<number>`count(*)::int` }).from(orders).groupBy(orders.status),
  ]);
  return {
    rows,
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / ORDERS_PAGE)),
    counts: Object.fromEntries(counts.map((c) => [c.status, c.n])) as Partial<Record<OrderStatus, number>>,
  };
}

export async function getOrder(db: Executor, id: string) {
  const [order] = await db.select().from(orders).where(eq(orders.id, id));
  if (!order) return null;
  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, id));
  const reservations = items.length
    ? await db.select().from(stockReservations).where(inArray(stockReservations.orderItemId, items.map((i) => i.id)))
    : [];
  return { ...order, items, reservations };
}

export const customerFiltersSchema = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  page: z.coerce.number().int().min(1).optional().catch(1),
});

export async function listCustomers(db: Executor, f: z.infer<typeof customerFiltersSchema>) {
  const page = f.page ?? 1;
  const cond = f.q
    ? (() => {
        const t = `%${f.q!.replace(/[%_\\]/g, "\\$&")}%`;
        return or(ilike(customers.name, t), ilike(customers.phone, t), ilike(customers.city, t));
      })()
    : undefined;
  const rows = await db
    .select({
      id: customers.id,
      name: customers.name,
      phone: customers.phone,
      whatsapp: customers.whatsapp,
      city: customers.city,
      address: customers.address,
      createdAt: customers.createdAt,
      orders: sql<number>`(SELECT count(*)::int FROM orders o WHERE o.customer_id = customers.id)`,
      delivered: sql<number>`(SELECT coalesce(sum(o.total_minor), 0) FROM orders o WHERE o.customer_id = customers.id AND o.status = 'delivered')`.mapWith(Number),
      lastOrderAt: sql<Date | null>`(SELECT max(o.created_at) FROM orders o WHERE o.customer_id = customers.id)`,
      total: sql<number>`count(*) OVER()::int`,
    })
    .from(customers)
    .where(cond)
    .orderBy(desc(customers.updatedAt))
    .limit(30)
    .offset((page - 1) * 30);
  const total = rows[0]?.total ?? 0;
  return { rows, total, page, pageCount: Math.max(1, Math.ceil(total / 30)) };
}
