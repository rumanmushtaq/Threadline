import { desc, eq, sql } from "drizzle-orm";
import type { Executor } from "./db";
import { activityLogs, orders, productImages, products, users } from "./db/schema";
import { getSettings } from "./settings";
import { BUSINESS_TZ, type ResolvedRange } from "./date-range";
import { fileUrl } from "./storage";

type Num = string | number | null;
const n = (v: Num) => Number(v ?? 0);

const threshold = sql`(SELECT low_stock_threshold FROM settings WHERE id = 1)`;

/**
 * Money for the chosen dates. Purchases are pieces added (new products and stock-in) at the
 * product's purchase price. Sales come from two places: shop sales (in person, not cancelled)
 * and website orders delivered in the range, each at the price and cost saved on the row.
 */
async function moneyInRange(db: Executor, range: ResolvedRange) {
  const from = range.from ?? new Date(0);
  const [r] = (
    await db.execute<Record<string, Num>>(sql`
      WITH web AS (
        SELECT coalesce(sum(oi.unit_price_minor::bigint * oi.quantity), 0) AS sales,
               coalesce(sum(oi.unit_cost_minor::bigint * oi.quantity), 0) AS cost,
               coalesce(sum(oi.quantity), 0) AS pieces,
               count(DISTINCT o.id) AS count
          FROM orders o JOIN order_items oi ON oi.order_id = o.id
         WHERE o.status = 'delivered' AND o.delivered_at >= ${from} AND o.delivered_at < ${range.to}
      ), shop AS (
        SELECT coalesce(sum(unit_price_minor::bigint * quantity), 0) AS sales,
               coalesce(sum(unit_cost_minor::bigint * quantity), 0) AS cost,
               coalesce(sum(quantity), 0) AS pieces,
               count(*) AS count
          FROM shop_sales
         WHERE cancelled_at IS NULL AND sold_at >= ${from} AND sold_at < ${range.to}
      ), bought AS (
        SELECT coalesce(sum(it.on_hand_delta::bigint * p.purchase_price_minor), 0) AS purchases,
               coalesce(sum(it.on_hand_delta), 0) AS pieces_bought
          FROM inventory_transactions it JOIN products p ON p.id = it.product_id
         WHERE it.type IN ('initial', 'stock_in') AND it.created_at >= ${from} AND it.created_at < ${range.to}
      ), placed AS (
        SELECT count(*) AS orders FROM orders WHERE created_at >= ${from} AND created_at < ${range.to}
      ), spent AS (
        SELECT coalesce(sum(amount_minor), 0) AS expenses, count(*) AS expense_count
          FROM expenses WHERE cancelled_at IS NULL AND spent_at >= ${from} AND spent_at < ${range.to}
      )
      SELECT web.sales AS web_sales, web.cost AS web_cost, web.pieces AS web_pieces, web.count AS web_count,
             shop.sales AS shop_sales, shop.cost AS shop_cost, shop.pieces AS shop_pieces, shop.count AS shop_count,
             bought.purchases, bought.pieces_bought, placed.orders, spent.expenses, spent.expense_count
        FROM web, shop, bought, placed, spent`)
  ).rows;
  const shop = { sales: n(r.shop_sales), cost: n(r.shop_cost), pieces: n(r.shop_pieces), count: n(r.shop_count) };
  const website = { sales: n(r.web_sales), cost: n(r.web_cost), pieces: n(r.web_pieces), count: n(r.web_count) };
  const sales = shop.sales + website.sales;
  const costOfSold = shop.cost + website.cost;
  const purchases = n(r.purchases);
  const expenses = n(r.expenses);
  return {
    purchases,
    sales,
    costOfSold,
    profit: sales - costOfSold,
    expenses,
    expenseCount: n(r.expense_count),
    /** Profit on what sold, minus running costs. */
    netProfit: sales - costOfSold - expenses,
    net: sales - purchases,
    piecesBought: n(r.pieces_bought),
    piecesSold: shop.pieces + website.pieces,
    shop: { ...shop, profit: shop.sales - shop.cost },
    website: { ...website, profit: website.sales - website.cost },
    orders: n(r.orders),
  };
}
export type MoneyInRange = Awaited<ReturnType<typeof moneyInRange>>;
export { moneyInRange };

/** Pieces in and out per day (short ranges) or per month (long ones), in the shop's time zone. */
async function movementInRange(db: Executor, range: ResolvedRange) {
  const rows = (
    await db.execute<{ bucket: string; unit: string; added: Num; removed: Num }>(sql`
      WITH bounds AS (
        SELECT coalesce(${range.from}::timestamptz, (SELECT min(created_at) FROM inventory_transactions), now()) AS f,
               ${range.to}::timestamptz AS t
      ), u AS (
        SELECT CASE WHEN t - f <= interval '62 days' THEN 'day' ELSE 'month' END AS unit, f, t FROM bounds
      ), buckets AS (
        SELECT g AS b, u.unit
          FROM u, generate_series(date_trunc(u.unit, u.f AT TIME ZONE ${BUSINESS_TZ}),
                                  (u.t - interval '1 second') AT TIME ZONE ${BUSINESS_TZ},
                                  ('1 ' || u.unit)::interval) AS g
      ), moves AS (
        SELECT date_trunc(u.unit, it.created_at AT TIME ZONE ${BUSINESS_TZ}) AS b,
               sum(it.on_hand_delta) FILTER (WHERE it.on_hand_delta > 0) AS added,
               -sum(it.on_hand_delta) FILTER (WHERE it.on_hand_delta < 0) AS removed
          FROM u JOIN inventory_transactions it ON it.created_at >= u.f AND it.created_at < u.t
         GROUP BY 1
      )
      SELECT to_char(buckets.b, 'YYYY-MM-DD') AS bucket, buckets.unit,
             coalesce(moves.added, 0) AS added, coalesce(moves.removed, 0) AS removed
        FROM buckets LEFT JOIN moves ON moves.b = buckets.b
       ORDER BY buckets.b`)
  ).rows;
  return {
    unit: (rows[0]?.unit ?? "day") as "day" | "month",
    points: rows.map((r) => ({ day: r.bucket, added: n(r.added), removed: n(r.removed) })),
  };
}

/** Every number on the dashboard comes from these queries — nothing is estimated client-side. */
export async function dashboardData(db: Executor, opts: { includeOrders: boolean; range: ResolvedRange }) {
  // Independent queries run at once: the page waits for the slowest one, not the sum of all.
  const [settings, stockRows, orderRows, money, movement, byCategory, byAudience, recentProducts, recentAi, recentOrders, recentActivity, lowStock] =
    await Promise.all([
      getSettings(db),
      db.execute<Record<string, Num>>(sql`
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
               count(*) FILTER (WHERE on_hand - reserved > 0 AND on_hand - reserved <= ${threshold}) AS low,
               count(*) FILTER (WHERE on_hand - reserved = 0) AS out
          FROM per_product`),
      opts.includeOrders
        ? db.execute<Record<string, Num>>(sql`SELECT count(*) AS total, count(*) FILTER (WHERE status = 'pending') AS pending FROM orders`)
        : null,
      opts.includeOrders ? moneyInRange(db, opts.range) : null,
      movementInRange(db, opts.range),
      db.execute<{ name: string; products: Num; pieces: Num }>(sql`
        SELECT coalesce(c.name, 'Uncategorized') AS name, count(DISTINCT p.id) AS products, coalesce(sum(ps.on_hand), 0) AS pieces
          FROM products p
          LEFT JOIN categories c ON c.id = p.category_id
          LEFT JOIN product_sizes ps ON ps.product_id = p.id
         WHERE p.status = 'active'
         GROUP BY 1 ORDER BY 3 DESC LIMIT 8`),
      db.execute<{ audience: string; pieces: Num }>(sql`
        SELECT p.audience, coalesce(sum(ps.on_hand), 0) AS pieces
          FROM products p LEFT JOIN product_sizes ps ON ps.product_id = p.id
         WHERE p.status = 'active' GROUP BY 1`),
      db
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
        .limit(5),
      db
        .select({ id: productImages.id, productId: productImages.productId, thumbKey: productImages.thumbKey, storageKey: productImages.storageKey, name: products.name, createdAt: productImages.createdAt })
        .from(productImages)
        .innerJoin(products, eq(products.id, productImages.productId))
        .where(eq(productImages.kind, "marketing"))
        .orderBy(desc(productImages.createdAt))
        .limit(6),
      opts.includeOrders
        ? db
            .select({ id: orders.id, orderNumber: orders.orderNumber, customerName: orders.customerName, status: orders.status, totalMinor: orders.totalMinor, createdAt: orders.createdAt })
            .from(orders)
            .orderBy(desc(orders.createdAt))
            .limit(5)
        : [],
      db
        .select({ id: activityLogs.id, action: activityLogs.action, metadata: activityLogs.metadata, userName: users.name, createdAt: activityLogs.createdAt })
        .from(activityLogs)
        .leftJoin(users, eq(users.id, activityLogs.userId))
        .orderBy(desc(activityLogs.id))
        .limit(8),
      db.execute<{ id: string; sku: string; name: string; available: Num; sizes_out: string | null }>(sql`
        SELECT p.id, p.sku, p.name, sum(ps.on_hand - ps.reserved) AS available,
               string_agg(ps.size::text, ', ' ORDER BY ps.size) FILTER (WHERE ps.on_hand - ps.reserved = 0) AS sizes_out
          FROM products p JOIN product_sizes ps ON ps.product_id = p.id
         WHERE p.status = 'active'
         GROUP BY p.id
        HAVING sum(ps.on_hand - ps.reserved) <= ${threshold}
         ORDER BY sum(ps.on_hand - ps.reserved), p.created_at DESC LIMIT 6`),
    ]);

  const [stock] = stockRows.rows;
  const orderStats = orderRows?.rows[0];
  const purchaseValue = n(stock.purchase_value);
  const salesValue = n(stock.sales_value);
  return {
    currency: settings.currencySymbol,
    threshold: settings.lowStockThreshold,
    range: opts.range,
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
      orders: n(orderStats?.total ?? 0),
      pendingOrders: n(orderStats?.pending ?? 0),
    },
    money,
    movement,
    byCategory: byCategory.rows.map((r) => ({ name: r.name, products: n(r.products), pieces: n(r.pieces) })),
    byAudience: byAudience.rows.map((r) => ({ audience: r.audience, pieces: n(r.pieces) })),
    recentProducts: recentProducts.map((p) => ({ ...p, thumbUrl: fileUrl(p.thumbKey) })),
    recentAi: recentAi.map((i) => ({ ...i, url: fileUrl(i.thumbKey ?? i.storageKey)! })),
    recentOrders,
    recentActivity,
    lowStock: lowStock.rows.map((r) => ({ ...r, available: n(r.available) })),
  };
}
