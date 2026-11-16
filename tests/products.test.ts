import { readdir, rm } from "node:fs/promises";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { productInputSchema } from "@/lib/validation/product";
import { enqueueGeneration } from "@/server/ai/jobs";
import {
  activityLogs,
  aiGenerationJobs,
  inventoryTransactions,
  productImages,
  productSizes,
  publicProductLinks,
} from "@/server/db/schema";
import { recordStockMovement } from "@/server/inventory";
import { createProduct, getProductDetail, listProducts } from "@/server/products";
import { db, productInput, resetDb, seedUsers, testDb, testImage } from "./helpers";

let ids: { adminId: string; staffId: string };
beforeEach(async () => {
  await resetDb();
  ids = await seedUsers();
});
afterAll(() => testDb.close());

describe("product creation", () => {
  it("saves product, sizes, image, initial ledger, public link and AI job together", async () => {
    const created = await createProduct(db, ids.staffId, productInput(), await testImage());
    expect(created.sku).toBe("CLO-000001");
    expect(created.slug).toBe("CLO-000001");
    expect(created.jobId).toBeTruthy();

    const detail = await getProductDetail(db, created.id);
    expect(detail?.sizes.map((s) => [s.size, s.onHand])).toEqual([["M", 10], ["L", 20], ["XL", 15]]);
    expect(detail?.purchasePriceMinor).toBe(80000);
    expect(detail?.createdBy).toBe(ids.staffId);

    const ledger = await db.select().from(inventoryTransactions).where(eq(inventoryTransactions.productId, created.id));
    expect(ledger).toHaveLength(3);
    expect(ledger.every((l) => l.type === "initial")).toBe(true);

    const [img] = await db.select().from(productImages).where(eq(productImages.productId, created.id));
    expect(img.kind).toBe("original");
    const [link] = await db.select().from(publicProductLinks).where(eq(publicProductLinks.productId, created.id));
    expect(link.isActive).toBe(true);
    const logs = await db.select().from(activityLogs).where(eq(activityLogs.action, "product.created"));
    expect(logs).toHaveLength(1);
  });

  it("creates size rows only for the chosen group", async () => {
    const kids = await createProduct(
      db,
      ids.staffId,
      productInput({ audience: "kids", quantity: 6, sizes: [{ size: "XS", quantity: 6 }] }),
      await testImage(),
    );
    const sizes = await db.select({ size: productSizes.size }).from(productSizes).where(eq(productSizes.productId, kids.id));
    expect(sizes.map((s) => s.size).sort()).toEqual(["M", "S", "XS"]);
  });

  it("gives unique, sequential SKUs under concurrent saves", async () => {
    const img = await testImage();
    const results = await Promise.all(
      Array.from({ length: 8 }, () => createProduct(db, ids.staffId, productInput(), img)),
    );
    const skus = results.map((r) => r.sku).sort();
    expect(new Set(skus).size).toBe(8);
    expect(skus[0]).toBe("CLO-000001");
    expect(skus[7]).toBe("CLO-000008");
  });

  it("rejects non-images and leaves no stored files when the transaction fails", async () => {
    await rm("./storage-test", { recursive: true, force: true });
    await expect(createProduct(db, ids.staffId, productInput(), Buffer.from("not an image"))).rejects.toThrow(/not a readable image/);
    const bad = productInput({ categoryId: "00000000-0000-4000-8000-000000000000" });
    await expect(createProduct(db, ids.staffId, bad, await testImage())).rejects.toThrow(/category/);
    const dirs = await readdir("./storage-test/products").catch(() => [] as string[]);
    let leftover = 0;
    for (const d of dirs) leftover += (await readdir(`./storage-test/products/${d}/original`).catch(() => [])).length;
    expect(leftover).toBe(0);
  });
});

describe("product validation", () => {
  it("requires size quantities to add up to the total", () => {
    const res = productInputSchema.safeParse(productInput({ quantity: 50 }));
    expect(res.success).toBe(false);
    expect(JSON.stringify(res.error?.issues)).toMatch(/add up to 45, but the total is 50/);
  });

  it("refuses sizes that do not belong to the group", () => {
    const res = productInputSchema.safeParse(
      productInput({ audience: "kids", quantity: 5, sizes: [{ size: "XL", quantity: 5 }] }),
    );
    expect(res.success).toBe(false);
  });

  it("refuses negative, fractional and missing numbers", () => {
    expect(productInputSchema.safeParse(productInput({ quantity: -1 })).success).toBe(false);
    expect(productInputSchema.safeParse(productInput({ quantity: 4.5 })).success).toBe(false);
    expect(productInputSchema.safeParse(productInput({ sellingPrice: 0 })).success).toBe(false);
    expect(productInputSchema.safeParse(productInput({ purchasePrice: 10.555 })).success).toBe(false);
  });
});

describe("inventory", () => {
  it("adds stock and never lets stock go negative", async () => {
    const p = await createProduct(db, ids.staffId, productInput(), await testImage());
    await recordStockMovement(db, ids.staffId, { productId: p.id, kind: "stock_in", reason: "", lines: [{ size: "M", quantity: 5 }] });
    await expect(
      recordStockMovement(db, ids.adminId, { productId: p.id, kind: "stock_out", reason: "Damaged", lines: [{ size: "M", quantity: 16 }] }),
    ).rejects.toThrow(/Not enough stock in size M/);
    await expect(
      recordStockMovement(db, ids.adminId, { productId: p.id, kind: "adjustment", reason: "Recount", lines: [{ size: "L", quantity: -21 }] }),
    ).rejects.toThrow(/Not enough stock/);
    const [m] = await db.select().from(productSizes).where(sql`product_id = ${p.id} AND size = 'M'`);
    expect(m.onHand).toBe(15);
  });

  it("rolls back every size when one line fails", async () => {
    const p = await createProduct(db, ids.staffId, productInput(), await testImage());
    await expect(
      recordStockMovement(db, ids.adminId, {
        productId: p.id,
        kind: "stock_out",
        reason: "Sold at stall",
        lines: [{ size: "M", quantity: 2 }, { size: "XL", quantity: 99 }],
      }),
    ).rejects.toThrow();
    const [m] = await db.select().from(productSizes).where(sql`product_id = ${p.id} AND size = 'M'`);
    expect(m.onHand).toBe(10);
  });

  it("keeps the ledger immutable at the database level", async () => {
    const p = await createProduct(db, ids.staffId, productInput(), await testImage());
    await expect(db.update(inventoryTransactions).set({ reason: "edited" }).where(eq(inventoryTransactions.productId, p.id))).rejects.toThrow();
    await expect(db.delete(inventoryTransactions).where(eq(inventoryTransactions.productId, p.id))).rejects.toThrow();
    await expect(db.delete(activityLogs)).rejects.toThrow();
  });

  it("refuses a database write that would break the stock rules", async () => {
    const p = await createProduct(db, ids.staffId, productInput(), await testImage());
    await expect(db.update(productSizes).set({ onHand: -1 }).where(eq(productSizes.productId, p.id))).rejects.toThrow();
    await expect(db.update(productSizes).set({ reserved: 999 }).where(eq(productSizes.productId, p.id))).rejects.toThrow();
  });
});

describe("listing and jobs", () => {
  it("filters by stock level and size", async () => {
    await createProduct(db, ids.staffId, productInput(), await testImage());
    await createProduct(db, ids.staffId, productInput({ name: "Low Hoodie", quantity: 2, sizes: [{ size: "M", quantity: 2 }] }), await testImage());
    expect((await listProducts(db, { stock: "low" })).rows.map((r) => r.name)).toEqual(["Low Hoodie"]);
    expect((await listProducts(db, { size: "XL" })).rows.map((r) => r.name)).toEqual(["Oversized Cotton Tee"]);
    expect((await listProducts(db, { q: "clo-000002" })).total).toBe(1);
  });

  it("allows only one active AI job per product", async () => {
    const p = await createProduct(db, ids.staffId, productInput(), await testImage());
    expect(await enqueueGeneration(db, p.id, ids.adminId)).toBeNull();
    const jobs = await db.select().from(aiGenerationJobs).where(eq(aiGenerationJobs.productId, p.id));
    expect(jobs).toHaveLength(1);
  });
});
