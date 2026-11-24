import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { can } from "@/server/auth/permissions";
import { moneyInRange } from "@/server/dashboard";
import { businessToday, resolveRange } from "@/server/date-range";
import { activityLogs, inventoryTransactions, productSizes, shopSales } from "@/server/db/schema";
import { placeOrder, transitionOrder } from "@/server/orders";
import { createProduct, setProductArchived } from "@/server/products";
import { cancelShopSale, listSales, recordShopSale, saleOptions } from "@/server/shop-sales";
import { db, productInput, resetDb, seedUsers, testDb, testImage } from "./helpers";

let ids: { adminId: string; staffId: string };
beforeEach(async () => {
  await resetDb();
  ids = await seedUsers();
});
afterAll(() => testDb.close());

// 5 × M and 2 × L, bought at Rs. 800, target Rs. 1500.
const make = async () =>
  createProduct(db, ids.adminId, productInput({ quantity: 7, sizes: [{ size: "M", quantity: 5 }, { size: "L", quantity: 2 }] }), await testImage());
const sizeRow = async (productId: string, size: "M" | "L") =>
  (await db.select().from(productSizes).where(eq(productSizes.productId, productId))).find((s) => s.size === size)!;
const allTime = resolveRange({ range: "all_time" });
const sale = (productId: string, over: Record<string, unknown> = {}) => ({ productId, size: "M", quantity: 2, unitPrice: 1400, soldOn: businessToday(), note: "regular customer", ...over });

describe("recording shop sales", () => {
  it("takes pieces out of stock and counts price, cost and profit", async () => {
    const p = await make();
    const res = await recordShopSale(db, ids.adminId, sale(p.id, { note: "cash" }));
    expect(res.saleNumber).toBe("SAL-000001");

    const m = await sizeRow(p.id, "M");
    expect([m.onHand, m.sold]).toEqual([3, 2]);
    const [row] = await db.select().from(shopSales);
    expect(row).toMatchObject({ quantity: 2, unitPriceMinor: 140_000, unitCostMinor: 80_000, note: "cash", recordedBy: ids.adminId });
    const ledger = await db.select().from(inventoryTransactions).where(eq(inventoryTransactions.type, "sale"));
    expect(ledger[0]).toMatchObject({ onHandDelta: -2, soldDelta: 2, reason: "Shop sale SAL-000001" });
    expect(await db.select().from(activityLogs).where(eq(activityLogs.action, "sale.recorded"))).toHaveLength(1);

    const money = await moneyInRange(db, allTime);
    expect(money).toMatchObject({
      purchases: 560_000, // 7 × 800
      sales: 280_000,
      costOfSold: 160_000,
      profit: 120_000,
      net: -280_000,
      piecesSold: 2,
      shop: { sales: 280_000, count: 1, pieces: 2, profit: 120_000 },
      website: { sales: 0, count: 0 },
    });
  });

  it("keeps the old price and cost when the product price changes later", async () => {
    const p = await make();
    await recordShopSale(db, ids.adminId, sale(p.id));
    await db.execute(`UPDATE products SET purchase_price_minor = 100000, selling_price_minor = 300000`);
    expect((await moneyInRange(db, allTime)).profit).toBe(120_000);
  });

  it("puts a past date on that day and leaves today's numbers alone", async () => {
    const p = await make();
    await recordShopSale(db, ids.adminId, sale(p.id, { soldOn: "2026-01-15" }));
    const [row] = await db.select().from(shopSales);
    expect(row.soldAt.toISOString()).toBe("2026-01-15T07:00:00.000Z"); // midday in Karachi
    expect((await moneyInRange(db, resolveRange({ range: "custom", from: "2026-01-15", to: "2026-01-15" }))).sales).toBe(280_000);
    expect((await moneyInRange(db, resolveRange({ range: "custom", from: "2026-01-16", to: "2026-01-16" }))).sales).toBe(0);
  });

  it("refuses bad sales and changes nothing", async () => {
    const p = await make();
    await expect(recordShopSale(db, ids.adminId, sale(p.id, { quantity: 6 }))).rejects.toThrow(/Not enough stock in size M/);
    await expect(recordShopSale(db, ids.adminId, sale(p.id, { size: "XS" }))).rejects.toThrow(/Size XS does not exist/);
    await expect(recordShopSale(db, ids.adminId, sale(p.id, { soldOn: "2999-01-01" }))).rejects.toThrow(/future/);
    await expect(recordShopSale(db, ids.adminId, sale(p.id, { quantity: 0 }))).rejects.toThrow(/fix the highlighted/);
    await expect(recordShopSale(db, ids.adminId, sale(p.id, { unitPrice: -5 }))).rejects.toThrow(/fix the highlighted/);
    await expect(recordShopSale(db, ids.adminId, sale(p.id, { unitPrice: 10.555 }))).rejects.toThrow(/fix the highlighted/);
    await expect(recordShopSale(db, ids.adminId, sale(p.id, { note: "" }))).rejects.toThrow(/below the target sale price/);
    await expect(recordShopSale(db, ids.adminId, sale(p.id, { note: "   " }))).rejects.toThrow(/below the target sale price/);
    await expect(recordShopSale(db, ids.adminId, sale("00000000-0000-4000-8000-000000000000"))).rejects.toThrow(/Product not found/);
    await setProductArchived(db, ids.adminId, p.id, true);
    await expect(recordShopSale(db, ids.adminId, sale(p.id))).rejects.toThrow(/archived/);
    expect(await db.select().from(shopSales)).toHaveLength(0);
    expect((await sizeRow(p.id, "M")).onHand).toBe(5);
  });

  it("needs no note at or above the target sale price", async () => {
    const p = await make();
    await recordShopSale(db, ids.adminId, sale(p.id, { unitPrice: 1500, note: "" }));
    await recordShopSale(db, ids.adminId, sale(p.id, { unitPrice: 1800, note: "" }));
    expect(await db.select().from(shopSales)).toHaveLength(2);
  });

  it("never sells pieces held for a website order", async () => {
    const p = await make();
    const customer = { customerName: "Ayesha Khan", phone: "0300 1234567", whatsapp: "", address: "House 12, Street 4, Gulberg III", city: "Lahore", notes: "" };
    await placeOrder(db, { slug: p.slug, size: "L", quantity: 2, ...customer }, { ip: "10.8.0.1" });
    await expect(recordShopSale(db, ids.adminId, sale(p.id, { size: "L", quantity: 1 }))).rejects.toThrow(/reserved/);
    expect((await saleOptions(db))[0].sizes.map((s) => s.size)).toEqual(["M"]);
  });

  it("allows a sale at Rs. 0 (a gift) and counts the loss", async () => {
    const p = await make();
    await recordShopSale(db, ids.adminId, sale(p.id, { quantity: 1, unitPrice: 0 }));
    expect((await moneyInRange(db, allTime)).profit).toBe(-80_000);
  });

  it("sells the last pieces at the same moment only once", async () => {
    const p = await make();
    const tries = await Promise.allSettled([1, 2, 3].map(() => recordShopSale(db, ids.adminId, sale(p.id, { size: "L", quantity: 2 }))));
    expect(tries.filter((t) => t.status === "fulfilled")).toHaveLength(1);
    expect((await sizeRow(p.id, "L")).onHand).toBe(0);
  });
});

describe("cancelling shop sales", () => {
  it("puts the pieces back and stops counting the sale", async () => {
    const p = await make();
    const { id } = await recordShopSale(db, ids.adminId, sale(p.id));
    await cancelShopSale(db, ids.adminId, id);
    const m = await sizeRow(p.id, "M");
    expect([m.onHand, m.sold]).toEqual([5, 0]);
    expect((await moneyInRange(db, allTime)).sales).toBe(0);
    const [row] = await listSales(db, allTime);
    expect(row).toMatchObject({ channel: "shop", cancelled: true });
    await expect(cancelShopSale(db, ids.adminId, id)).rejects.toThrow(/already cancelled/);
  });
});

describe("sales list", () => {
  it("shows shop sales and delivered website orders together, filterable by channel", async () => {
    const p = await make();
    await recordShopSale(db, ids.adminId, sale(p.id, { quantity: 1 }));
    const customer = { customerName: "Ayesha Khan", phone: "0300 1234567", whatsapp: "", address: "House 12, Street 4, Gulberg III", city: "Lahore", notes: "" };
    const { orderNumber } = await placeOrder(db, { slug: p.slug, size: "L", quantity: 1, ...customer }, { ip: "10.8.0.2" });
    const [{ id }] = await db.execute<{ id: string }>(`SELECT id FROM orders WHERE order_number = '${orderNumber}'`).then((r) => r.rows);
    for (const to of ["confirmed", "dispatched", "delivered"] as const) await transitionOrder(db, ids.adminId, { id, to });

    const all = await listSales(db, allTime);
    expect(all.map((r) => r.channel).sort()).toEqual(["shop", "website"]);
    const web = all.find((r) => r.channel === "website")!;
    expect(web).toMatchObject({ number: orderNumber, who: "Ayesha Khan", quantity: 1, totalMinor: 150_000, profitMinor: 70_000, orderId: id });
    expect((await listSales(db, allTime, "shop")).map((r) => r.channel)).toEqual(["shop"]);
    expect((await listSales(db, allTime, "website")).map((r) => r.channel)).toEqual(["website"]);
    expect((await moneyInRange(db, allTime)).sales).toBe(140_000 + 150_000);
  });
});

describe("permissions", () => {
  it("lets only the admin see, record and cancel sales", () => {
    for (const p of ["sale.view", "sale.record", "sale.cancel"] as const) {
      expect(can("admin", p)).toBe(true);
      expect(can("staff", p)).toBe(false);
    }
  });
});
