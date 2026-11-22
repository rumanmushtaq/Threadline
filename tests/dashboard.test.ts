import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { rangeParamsSchema } from "@/lib/date-range";
import { dashboardData } from "@/server/dashboard";
import { orders } from "@/server/db/schema";
import { resolveRange } from "@/server/date-range";
import { placeOrder, transitionOrder } from "@/server/orders";
import { createProduct } from "@/server/products";
import { db, productInput, resetDb, seedUsers, testDb, testImage } from "./helpers";

const TZ = "Asia/Karachi"; // UTC+5, no daylight saving
// 2026-11-18 01:30 in Karachi is still 2026-11-17 in UTC: days must follow the shop's clock.
const NOW = new Date("2026-11-17T20:30:00Z");
const range = (q: Record<string, string>) => resolveRange(rangeParamsSchema.parse(q), NOW, TZ);
const days = (r: ReturnType<typeof range>) => [r.fromDay, r.toDay];

describe("date ranges", () => {
  it("uses the shop's time zone for today", () => {
    const r = range({ range: "today" });
    expect(days(r)).toEqual(["2026-11-18", "2026-11-18"]);
    expect(r.from!.toISOString()).toBe("2026-11-17T19:00:00.000Z");
    expect(r.to.toISOString()).toBe("2026-11-18T19:00:00.000Z");
  });

  it("works out every preset", () => {
    expect(days(range({ range: "yesterday" }))).toEqual(["2026-11-17", "2026-11-17"]);
    expect(days(range({ range: "last_7_days" }))).toEqual(["2026-11-12", "2026-11-18"]);
    expect(days(range({ range: "this_week" }))).toEqual(["2026-11-16", "2026-11-18"]); // Monday start
    expect(days(range({ range: "last_week" }))).toEqual(["2026-11-09", "2026-11-15"]);
    expect(days(range({ range: "this_month" }))).toEqual(["2026-11-01", "2026-11-18"]);
    expect(days(range({ range: "last_month" }))).toEqual(["2026-10-01", "2026-10-31"]);
    expect(days(range({ range: "last_30_days" }))).toEqual(["2026-10-20", "2026-11-18"]);
    expect(days(range({ range: "this_year" }))).toEqual(["2026-01-01", "2026-11-18"]);
    const all = range({ range: "all_time" });
    expect(all.from).toBeNull();
    expect(all.toDay).toBe("2026-11-18");
  });

  it("rolls last month over the year end", () => {
    const r = resolveRange(rangeParamsSchema.parse({ range: "last_month" }), new Date("2027-01-10T08:00:00Z"), TZ);
    expect(days(r)).toEqual(["2026-12-01", "2026-12-31"]);
  });

  it("takes custom dates inclusive and swaps them when reversed", () => {
    const r = range({ range: "custom", from: "2026-11-05", to: "2026-11-01" });
    expect(days(r)).toEqual(["2026-11-01", "2026-11-05"]);
    expect(r.to.toISOString()).toBe("2026-11-05T19:00:00.000Z");
    expect(r.label).toBe("1 Nov 2026 – 5 Nov 2026");
  });

  it("ignores bad URL values instead of failing", () => {
    expect(rangeParamsSchema.parse({ range: "forever", from: "2026-02-30", to: "nope" })).toEqual({ range: "all_time" });
    expect(days(range({ range: "custom" }))).toEqual(["2026-11-18", "2026-11-18"]);
  });
});

describe("dashboard money", () => {
  let ids: { adminId: string; staffId: string };
  beforeEach(async () => {
    await resetDb();
    ids = await seedUsers();
  });
  afterAll(() => testDb.close());

  const customer = { customerName: "Ayesha Khan", phone: "0300 1234567", whatsapp: "", address: "House 12, Street 4, Gulberg III", city: "Lahore", notes: "" };

  it("counts purchases, sales and profit only inside the chosen dates", async () => {
    // 5 pieces bought at Rs. 800, sold at Rs. 1500.
    const p = await createProduct(db, ids.staffId, productInput({ quantity: 5, sizes: [{ size: "M", quantity: 5 }] }), await testImage());
    const { orderNumber } = await placeOrder(db, { slug: p.slug, size: "M", quantity: 2, ...customer }, { ip: "10.9.0.1" });
    const [{ id }] = await db.select({ id: orders.id }).from(orders).where(eq(orders.orderNumber, orderNumber));
    for (const to of ["confirmed", "dispatched", "delivered"] as const) await transitionOrder(db, ids.adminId, { id, to });

    const now = await dashboardData(db, { includeOrders: true, range: resolveRange({ range: "today" }) });
    expect(now.money).toMatchObject({
      purchases: 400_000, // 5 × 800.00, in paisa
      sales: 300_000, // 2 × 1500.00
      costOfSold: 160_000,
      profit: 140_000,
      net: -100_000,
      piecesBought: 5,
      piecesSold: 2,
      delivered: 1,
      orders: 1,
    });

    // History can't be back-dated (the ledger is immutable), so ask for dates before it existed instead.
    const before = await dashboardData(db, { includeOrders: true, range: resolveRange({ range: "custom", from: "2020-01-01", to: "2020-12-31" }) });
    expect(before.money).toMatchObject({ purchases: 0, sales: 0, profit: 0, net: 0, orders: 0 });
    expect(before.movement.unit).toBe("month");
    const all = await dashboardData(db, { includeOrders: true, range: resolveRange({ range: "all_time" }) });
    expect(all.money).toMatchObject({ purchases: 400_000, sales: 300_000, profit: 140_000 });
    expect(all.movement.points.reduce((s, x) => s + x.added, 0)).toBe(5);
  });

  it("hides money from people who cannot see orders", async () => {
    const d = await dashboardData(db, { includeOrders: false, range: resolveRange({ range: "today" }) });
    expect(d.money).toBeNull();
    expect(d.movement.points).toHaveLength(1);
  });
});
