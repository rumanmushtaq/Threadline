import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { inventoryTransactions, orders, productSizes, settings, stockReservations } from "@/server/db/schema";
import { expirePendingOrders, placeOrder, transitionOrder } from "@/server/orders";
import { createProduct, setProductPublished } from "@/server/products";
import { getPublicProduct } from "@/server/public-products";
import { db, productInput, resetDb, seedUsers, testDb, testImage } from "./helpers";

let ids: { adminId: string; staffId: string };
let ipCounter = 0;
const ip = () => `10.1.${Math.floor(ipCounter / 250)}.${ipCounter++ % 250}`;

const customer = {
  customerName: "Ayesha Khan",
  phone: "0300 1234567",
  whatsapp: "",
  address: "House 12, Street 4, Gulberg III",
  city: "Lahore",
  notes: "",
};

async function product(sizes: { size: "M" | "L" | "XL"; quantity: number }[] = [{ size: "M", quantity: 5 }]) {
  const quantity = sizes.reduce((s, r) => s + r.quantity, 0);
  return createProduct(db, ids.staffId, productInput({ quantity, sizes }), await testImage());
}

async function sizeRow(productId: string, size: "M" | "L" | "XL") {
  const [r] = await db.select().from(productSizes).where(sql`product_id = ${productId} AND size = ${size}`);
  return r;
}

beforeEach(async () => {
  await resetDb();
  ids = await seedUsers();
});
afterAll(() => testDb.close());

describe("placing orders", () => {
  it("creates an order with a price snapshot and reserves stock", async () => {
    const p = await product();
    const res = await placeOrder(db, { slug: p.slug, size: "M", quantity: 2, ...customer }, { ip: ip() });
    expect(res.orderNumber).toBe("ORD-000001");
    expect(res.totalMinor).toBe(300000);
    const m = await sizeRow(p.id, "M");
    expect([m.onHand, m.reserved]).toEqual([5, 2]);
    const [o] = await db.select().from(orders);
    expect(o.status).toBe("pending");
    expect(o.phone).toBe("03001234567");
  });

  it("never oversells: 20 simultaneous orders for 5 pieces, exactly 5 succeed", async () => {
    const p = await product();
    const results = await Promise.allSettled(
      Array.from({ length: 20 }, (_, i) =>
        placeOrder(db, { slug: p.slug, size: "M", quantity: 1, ...customer, phone: `0300${String(1000000 + i)}` }, { ip: ip() }),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(5);
    const m = await sizeRow(p.id, "M");
    expect([m.onHand, m.reserved]).toEqual([5, 5]);
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(orders);
    expect(n).toBe(5);
  });

  it("rejects too many pieces, unknown sizes, sold-out sizes and unpublished products", async () => {
    const p = await product();
    await expect(placeOrder(db, { slug: p.slug, size: "M", quantity: 6, ...customer }, { ip: ip() })).rejects.toThrow(/Only 5 left/);
    await expect(placeOrder(db, { slug: p.slug, size: "XS", quantity: 1, ...customer }, { ip: ip() })).rejects.toThrow(/not offered/);
    await expect(placeOrder(db, { slug: p.slug, size: "L", quantity: 1, ...customer }, { ip: ip() })).rejects.toThrow(/sold out/);
    await expect(placeOrder(db, { slug: p.slug, size: "M", quantity: 1, ...customer, phone: "12" }, { ip: ip() })).rejects.toThrow(/highlighted/);
    await setProductPublished(db, ids.adminId, p.id, false);
    await expect(placeOrder(db, { slug: p.slug, size: "M", quantity: 1, ...customer }, { ip: ip() })).rejects.toThrow(/no longer available/);
  });

  it("rate-limits order spam from one connection", async () => {
    const p = await createProduct(db, ids.staffId, productInput(), await testImage());
    for (let i = 0; i < 5; i++) await placeOrder(db, { slug: p.slug, size: "L", quantity: 1, ...customer }, { ip: "9.9.9.9" });
    await expect(placeOrder(db, { slug: p.slug, size: "L", quantity: 1, ...customer }, { ip: "9.9.9.9" })).rejects.toThrow(/Too many orders/);
  });
});

describe("order workflow", () => {
  it("delivered orders deduct stock permanently; cancelled orders release it", async () => {
    const p = await product([{ size: "M", quantity: 5 }, { size: "L", quantity: 3 }]);
    const a = await placeOrder(db, { slug: p.slug, size: "M", quantity: 2, ...customer }, { ip: ip() });
    const b = await placeOrder(db, { slug: p.slug, size: "L", quantity: 3, ...customer }, { ip: ip() });
    const [oa] = await db.select().from(orders).where(eq(orders.orderNumber, a.orderNumber));
    const [ob] = await db.select().from(orders).where(eq(orders.orderNumber, b.orderNumber));

    for (const to of ["confirmed", "processing", "dispatched", "delivered"] as const) await transitionOrder(db, ids.adminId, { id: oa.id, to });
    const m = await sizeRow(p.id, "M");
    expect([m.onHand, m.reserved, m.sold]).toEqual([3, 0, 2]);

    await transitionOrder(db, ids.adminId, { id: ob.id, to: "cancelled", reason: "Customer changed mind" });
    const l = await sizeRow(p.id, "L");
    expect([l.onHand, l.reserved, l.sold]).toEqual([3, 0, 0]);

    const res = await db.select({ status: stockReservations.status }).from(stockReservations);
    expect(res.map((r) => r.status).sort()).toEqual(["consumed", "released"]);
    const ledgerTypes = (await db.select({ t: inventoryTransactions.type }).from(inventoryTransactions)).map((r) => r.t);
    expect(ledgerTypes).toEqual(expect.arrayContaining(["reserve", "sale", "release"]));
  });

  it("refuses invalid transitions", async () => {
    const p = await product();
    const a = await placeOrder(db, { slug: p.slug, size: "M", quantity: 1, ...customer }, { ip: ip() });
    const [o] = await db.select().from(orders).where(eq(orders.orderNumber, a.orderNumber));
    await expect(transitionOrder(db, ids.adminId, { id: o.id, to: "delivered" })).rejects.toThrow(/cannot be marked/);
    await transitionOrder(db, ids.adminId, { id: o.id, to: "cancelled" });
    await expect(transitionOrder(db, ids.adminId, { id: o.id, to: "confirmed" })).rejects.toThrow(/cannot be marked/);
  });

  it("with the on_confirm policy, stock is reserved only at confirmation", async () => {
    await db.update(settings).set({ reservationPolicy: "on_confirm" });
    const p = await product();
    const a = await placeOrder(db, { slug: p.slug, size: "M", quantity: 4, ...customer }, { ip: ip() });
    expect((await sizeRow(p.id, "M")).reserved).toBe(0);
    const [o] = await db.select().from(orders).where(eq(orders.orderNumber, a.orderNumber));
    await transitionOrder(db, ids.adminId, { id: o.id, to: "confirmed" });
    expect((await sizeRow(p.id, "M")).reserved).toBe(4);
  });

  it("expires stale pending orders and frees their stock", async () => {
    const p = await product();
    await placeOrder(db, { slug: p.slug, size: "M", quantity: 3, ...customer }, { ip: ip() });
    await db.update(orders).set({ createdAt: new Date(Date.now() - 100 * 3_600_000) });
    expect(await expirePendingOrders(db)).toEqual({ expired: 1 });
    const [o] = await db.select().from(orders);
    expect(o.status).toBe("cancelled");
    expect((await sizeRow(p.id, "M")).reserved).toBe(0);
  });
});

describe("public product data", () => {
  it("exposes only customer-facing fields", async () => {
    const p = await product();
    const pub = await getPublicProduct(db, p.slug.toLowerCase());
    expect(pub).not.toBeNull();
    const json = JSON.stringify(pub);
    for (const secret of ["purchase", "cost", "80000", "createdBy", p.id, ids.staffId, "margin"]) expect(json).not.toContain(secret);
    expect(pub!.sizes).toEqual([{ size: "M", available: 5 }, { size: "L", available: 0 }, { size: "XL", available: 0 }]);
  });

  it("hides unpublished products", async () => {
    const p = await product();
    await setProductPublished(db, ids.adminId, p.id, false);
    expect(await getPublicProduct(db, p.slug)).toBeNull();
  });
});
