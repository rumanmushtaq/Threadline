import { desc, eq, sql } from "drizzle-orm";
import type { Executor } from "./db";
import { activityLogs, orders, productImages, products, users } from "./db/schema";
import { getSettings } from "./settings";
import { fileUrl } from "./storage";

type Num = string | number | null;
const n = (v: Num) => Number(v ?? 0);

/** Every number on the dashboard comes from these queries — nothing is estimated client-side. */
export async function dashboardData(db: Executor, opts: { includeOrders: boolean }) {
  const settings = await getSettings(db);
  const t = settings.lowStockThreshold;

  const [stock] = (
    await db.execute<Record<string, Num>>(sql`
      WITH per_product AS (
        SELECT p.id, p.audience, p.purchase_price_minor::bigint AS cost, p.selling_price_minor::bigint AS price,
               coalesce(sum(ps.on_hand), 0) AS on_hand, coalesce(sum(ps.reserved), 0) AS reserved
          FROM products p LEFT JOIN product_sizes ps ON ps.product_id = p.id
         WHERE p.status = 'active'
         GROUP BY p.id
      )
      SELECT count(*) AS products,
             coalesce(sum(on_hand), 0) AS pieces,
             coalesce(sum(on_hand - reserved), 0) AS available,
             coalesce(sum(reserved), 0) AS reserved,
             coalesce(sum(cost * on_hand), 0) AS purchase_value,
             coalesce(sum(price * on_hand), 0) AS sales_value,
             count(*) FILTER (WHERE audience = 'kids') AS kids,
             count(*) FILTER (WHERE audience = 'youth') AS youth,
             count(*) FILTER (WHERE audience = 'adult') AS adult,
             count(*) FILTER (WHERE on_hand - reserved > 0 AND on_hand - reserved <= ${t}) AS low,
             count(*) FILTER (WHERE on_hand - reserved = 0) AS out
        FROM per_product`)
  ).rows;

  const [orderStats] = !opts.includeOrders
    ? [{ total: 0, pending: 0, realized_profit: 0, revenue: 0 } as Record<string, Num>]
    : (
    await db.execute<Record<string, Num>>(sql`
      SELECT count(*) AS total,
             count(*) FILTER (WHERE status = 'pending') AS pending,
             coalesce((SELECT sum((oi.unit_price_minor - oi.unit_cost_minor)::bigint * oi.quantity)
                         FROM order_items oi JOIN orders o2 ON o2.id = oi.order_id
                        WHERE o2.status = 'delivered'), 0) AS realized_profit,
             coalesce(sum(total_minor) FILTER (WHERE status = 'delivered'), 0) AS revenue
        FROM orders`)
  ).rows;

  const movement = (
    await db.execute<{ day: string; added: Num; removed: Num }>(sql`
      SELECT to_char(d.day, 'YYYY-MM-DD') AS day,
             coalesce(sum(it.on_hand_delta) FILTER (WHERE it.on_hand_delta > 0), 0) AS added,
             coalesce(-sum(it.on_hand_delta) FILTER (WHERE it.on_hand_delta < 0), 0) AS removed
        FROM generate_series(current_date - 29, current_date, interval '1 day') AS d(day)
        LEFT JOIN inventory_transactions it ON it.created_at >= d.day AND it.created_at < d.day + interval '1 day'
       GROUP BY d.day ORDER BY d.day`)
  ).rows.map((r) => ({ day: r.day, added: n(r.added), removed: n(r.removed) }));

  const byCategory = (
    await db.execute<{ name: string; products: Num; pieces: Num }>(sql`
      SELECT coalesce(c.name, 'Uncategorized') AS name, count(DISTINCT p.id) AS products, coalesce(sum(ps.on_hand), 0) AS pieces
        FROM products p
        LEFT JOIN categories c ON c.id = p.category_id
        LEFT JOIN product_sizes ps ON ps.product_id = p.id
       WHERE p.status = 'active'
       GROUP BY 1 ORDER BY 3 DESC LIMIT 8`)
  ).rows.map((r) => ({ name: r.name, products: n(r.products), pieces: n(r.pieces) }));

  const byAudience = (
    await db.execute<{ audience: string; pieces: Num }>(sql`
      SELECT p.audience, coalesce(sum(ps.on_hand), 0) AS pieces
        FROM products p LEFT JOIN product_sizes ps ON ps.product_id = p.id
       WHERE p.status = 'active' GROUP BY 1`)
  ).rows.map((r) => ({ audience: r.audience, pieces: n(r.pieces) }));

  const recentProducts = await db
    .select({
      id: products.id,
      sku: products.sku,
      name: products.name,
      sellingPriceMinor: products.sellingPriceMinor,
      createdAt: products.createdAt,
      creator: users.name,
      thumbKey: sql<string | null>`(SELECT coalesce(pi.thumb_key, pi.storage_key) FROM product_images pi WHERE pi.product_id = products.id AND pi.kind = 'original' ORDER BY pi.created_at LIMIT 1)`,
    })
    .from(products)
    .leftJoin(users, eq(users.id, products.createdBy))
    .orderBy(desc(products.createdAt))
    .limit(5);

  const recentAi = await db
    .select({ id: productImages.id, productId: productImages.productId, thumbKey: productImages.thumbKey, storageKey: productImages.storageKey, name: products.name, createdAt: productImages.createdAt })
    .from(productImages)
    .innerJoin(products, eq(products.id, productImages.productId))
    .where(eq(productImages.kind, "marketing"))
    .orderBy(desc(productImages.createdAt))
    .limit(6);

  const recentOrders = !opts.includeOrders
    ? []
    : await db
        .select({ id: orders.id, orderNumber: orders.orderNumber, customerName: orders.customerName, status: orders.status, totalMinor: orders.totalMinor, createdAt: orders.createdAt })
        .from(orders)
        .orderBy(desc(orders.createdAt))
        .limit(5);

  const recentActivity = await db
    .select({ id: activityLogs.id, action: activityLogs.action, metadata: activityLogs.metadata, userName: users.name, createdAt: activityLogs.createdAt })
    .from(activityLogs)
    .leftJoin(users, eq(users.id, activityLogs.userId))
    .orderBy(desc(activityLogs.id))
    .limit(8);

  const lowStock = (
    await db.execute<{ id: string; sku: string; name: string; available: Num; sizes_out: string | null }>(sql`
      SELECT p.id, p.sku, p.name, sum(ps.on_hand - ps.reserved) AS available,
             string_agg(ps.size::text, ', ' ORDER BY ps.size) FILTER (WHERE ps.on_hand - ps.reserved = 0) AS sizes_out
        FROM products p JOIN product_sizes ps ON ps.product_id = p.id
       WHERE p.status = 'active'
       GROUP BY p.id
      HAVING sum(ps.on_hand - ps.reserved) <= ${t}
       ORDER BY sum(ps.on_hand - ps.reserved), p.created_at DESC LIMIT 6`)
  ).rows.map((r) => ({ ...r, available: n(r.available) }));

  const purchaseValue = n(stock.purchase_value);
  const salesValue = n(stock.sales_value);
  return {
    currency: settings.currencySymbol,
    threshold: t,
    stats: {
      products: n(stock.products),
      pieces: n(stock.pieces),
      available: n(stock.available),
      reserved: n(stock.reserved),
      purchaseValue,
      salesValue,
      estimatedProfit: salesValue - purchaseValue,
      kids: n(stock.kids),
      youth: n(stock.youth),
      adult: n(stock.adult),
      lowStock: n(stock.low),
      outOfStock: n(stock.out),
      orders: n(orderStats.total),
      pendingOrders: n(orderStats.pending),
      realizedProfit: n(orderStats.realized_profit),
      revenue: n(orderStats.revenue),
    },
    movement,
    byCategory,
    byAudience,
    recentProducts: recentProducts.map((p) => ({ ...p, thumbUrl: fileUrl(p.thumbKey) })),
    recentAi: recentAi.map((i) => ({ ...i, url: fileUrl(i.thumbKey ?? i.storageKey)! })),
    recentOrders,
    recentActivity,
    lowStock,
  };
}
