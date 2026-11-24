import { readdir, readFile, rm } from "node:fs/promises";
import sharp from "sharp";
import { getPublicProduct } from "@/server/public-products";
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

  it("skips the AI job when no AI image service is set up", async () => {
    const token = process.env.CLOUDFLARE_API_TOKEN;
    delete process.env.CLOUDFLARE_API_TOKEN;
    try {
      const created = await createProduct(db, ids.staffId, productInput(), await testImage());
      expect(created.jobId).toBeNull();
      expect(await db.select().from(aiGenerationJobs).where(eq(aiGenerationJobs.productId, created.id))).toHaveLength(0);
      expect(await getPublicProduct(db, created.slug)).toBeTruthy();
    } finally {
      process.env.CLOUDFLARE_API_TOKEN = token;
    }
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

describe("public images", () => {
  it("serves a metadata-free copy of the original photo, never the raw upload", async () => {
    const withExif = await sharp(await testImage())
      .withExif({ IFD0: { Make: "SecretPhone", Artist: "Owner Name" } })
      .jpeg()
      .toBuffer();
    expect(withExif.includes(Buffer.from("SecretPhone"))).toBe(true);
    const p = await createProduct(db, ids.staffId, productInput(), withExif);
    const pub = await getPublicProduct(db, p.slug);
    const original = pub!.images.find((i) => i.kind === "original")!;
    expect(original.url).toMatch(/\/derived\/[0-9a-f-]{36}\.webp$/);
    const served = await readFile(`./storage-test/${original.url.replace("/api/files/", "")}`);
    expect(served.includes(Buffer.from("SecretPhone"))).toBe(false);
    expect(served.includes(Buffer.from("Owner Name"))).toBe(false);
  });
});

describe("stored file safety", () => {
  it("names derived copies so the original's address cannot be guessed from them", async () => {
    const p = await createProduct(db, ids.staffId, productInput(), await testImage());
    const [img] = await db.select().from(productImages).where(sql`product_id = ${p.id}`);
    const originalName = img.storageKey.split("/").pop()!.replace(/\.[a-z]+$/, "");
    for (const k of [img.thumbKey!, img.displayKey!]) {
      expect(k).toMatch(/\/derived\//);
      expect(k).not.toContain(originalName);
    }
  });

  it("refuses to reuse an uploaded original and leaves the first product's files alone", async () => {
    const { storage } = await import("@/server/storage");
    const data = await testImage();
    const key = `products/${crypto.randomUUID()}/original/${crypto.randomUUID()}.jpg`;
    await storage().put(key, data, "image/jpeg");
    const first = await createProduct(db, ids.staffId, productInput(), { storageKey: key, data });
    await expect(createProduct(db, ids.staffId, productInput({ name: "Replay" }), { storageKey: key, data })).rejects.toThrow(/already used/);
    const [img] = await db.select().from(productImages).where(sql`product_id = ${first.id}`);
    for (const k of [img.storageKey, img.thumbKey!, img.displayKey!]) await expect(storage().get(k)).resolves.toBeTruthy();
  });

  it("a failed save with an uploaded photo leaves the original for the sweep and removes its own copies", async () => {
    const { storage } = await import("@/server/storage");
    const { sweepOrphanFiles } = await import("@/server/storage-maintenance");
    const data = await testImage();
    const folder = `products/${crypto.randomUUID()}`;
    const key = `${folder}/original/${crypto.randomUUID()}.jpg`;
    await storage().put(key, data, "image/jpeg");
    const bad = productInput({ categoryId: "00000000-0000-4000-8000-000000000000" });
    await expect(createProduct(db, ids.staffId, bad, { storageKey: key, data })).rejects.toThrow(/category/);
    await expect(storage().get(key)).resolves.toBeTruthy();
    expect(await readdir(`./storage-test/${folder}/derived`).catch(() => [])).toHaveLength(0);
    await sweepOrphanFiles(db, { olderThanMs: -60_000 });
    await expect(storage().get(key)).rejects.toThrow();
  });

  it("sweeps files nothing points at and keeps the rest", async () => {
    const { storage } = await import("@/server/storage");
    const { sweepOrphanFiles } = await import("@/server/storage-maintenance");
    const p = await createProduct(db, ids.staffId, productInput(), await testImage());
    const orphan = `products/${crypto.randomUUID()}/original/${crypto.randomUUID()}.jpg`;
    await storage().put(orphan, await testImage(), "image/jpeg");
    await sweepOrphanFiles(db, { olderThanMs: -60_000 });
    await expect(storage().get(orphan)).rejects.toThrow();
    const [img] = await db.select().from(productImages).where(sql`product_id = ${p.id}`);
    for (const k of [img.storageKey, img.thumbKey!, img.displayKey!]) await expect(storage().get(k)).resolves.toBeTruthy();
  });

  it("refuses an upload whose claimed format differs from the real bytes", async () => {
    const { storage } = await import("@/server/storage");
    const { createUploadTicket, resolveUploadedImage } = await import("@/server/uploads");
    process.env.CLOUDINARY_API_SECRET = "test-secret-for-signing";
    process.env.STORAGE_DRIVER = "cloudinary";
    const ticket = createUploadTicket(ids.staffId);
    process.env.STORAGE_DRIVER = "local";
    if (ticket.mode !== "cloudinary") throw new Error("expected a cloudinary ticket");
    const png = await sharp(await testImage()).png().toBuffer();
    await storage().put(`${ticket.publicId}.jpg`, png, "image/png");
    const input = { publicId: ticket.publicId, format: "jpg" as const, expires: ticket.expires, token: ticket.token };
    await expect(resolveUploadedImage(ids.staffId, input)).rejects.toThrow(/does not match/);
    await expect(resolveUploadedImage(ids.adminId, input)).rejects.toThrow(/expired/); // another user's ticket
    await expect(storage().get(`${ticket.publicId}.jpg`)).resolves.toBeTruthy(); // never deleted here
  });

  it("gives up on a photo whose display copy keeps failing, without blocking others", async () => {
    const { backfillDisplayCopies } = await import("@/server/storage-maintenance");
    const good = await createProduct(db, ids.staffId, productInput(), await testImage());
    await db.update(productImages).set({ displayKey: null }).where(sql`product_id = ${good.id}`);
    // Five newer broken rows (missing files) would otherwise fill every batch forever.
    const p2 = await createProduct(db, ids.staffId, productInput(), await testImage());
    for (let i = 0; i < 5; i++) {
      await db.insert(productImages).values({ productId: p2.id, kind: "ai_model", storageKey: `products/x/ai/missing-${i}.png`, contentType: "image/png" });
    }
    for (let run = 0; run < 4; run++) await backfillDisplayCopies(db);
    const [row] = await db.select().from(productImages).where(sql`product_id = ${good.id}`);
    expect(row.displayKey).toMatch(/\/derived\//);
  });

  it("backfills display copies for photos saved before they existed", async () => {
    const { backfillDisplayCopies } = await import("@/server/storage-maintenance");
    const p = await createProduct(db, ids.staffId, productInput(), await testImage());
    await db.update(productImages).set({ displayKey: null }).where(sql`product_id = ${p.id}`);
    expect((await getPublicProduct(db, p.slug))!.images).toHaveLength(0); // hidden, never the raw original
    expect(await backfillDisplayCopies(db)).toBe(1);
    const pub = await getPublicProduct(db, p.slug);
    expect(pub!.images[0].url).toMatch(/\/derived\//);
  });
});

describe("deleting products", () => {
  it("removes a product that never sold, with its stock, photos, link and files", async () => {
    const { deleteProduct } = await import("@/server/products");
    const { storage } = await import("@/server/storage");
    const p = await createProduct(db, ids.staffId, productInput(), await testImage());
    const [img] = await db.select().from(productImages).where(eq(productImages.productId, p.id));
    await deleteProduct(db, ids.adminId, p.id);
    expect(await db.select().from(productImages).where(eq(productImages.productId, p.id))).toHaveLength(0);
    expect(await db.select().from(inventoryTransactions).where(eq(inventoryTransactions.productId, p.id))).toHaveLength(0);
    expect(await db.select().from(publicProductLinks).where(eq(publicProductLinks.productId, p.id))).toHaveLength(0);
    expect(await getProductDetail(db, p.id)).toBeNull();
    await expect(storage().get(img.storageKey)).rejects.toThrow();
    expect((await db.select().from(activityLogs).where(eq(activityLogs.action, "product.deleted")))[0].metadata).toMatchObject({ sku: p.sku });
  });

  it("refuses a product with shop sales or orders, and the history guard stays on", async () => {
    const { deleteProduct } = await import("@/server/products");
    const { recordShopSale } = await import("@/server/shop-sales");
    const { businessToday } = await import("@/server/date-range");
    const p = await createProduct(db, ids.staffId, productInput(), await testImage());
    await recordShopSale(db, ids.adminId, { productId: p.id, size: "M", quantity: 1, unitPrice: 1500, soldOn: businessToday() });
    await expect(deleteProduct(db, ids.adminId, p.id)).rejects.toThrow(/Archive it instead/);
    expect(await getProductDetail(db, p.id)).not.toBeNull();
    // Outside a product delete, stock history still cannot be removed.
    await expect(db.delete(inventoryTransactions).where(eq(inventoryTransactions.productId, p.id))).rejects.toThrow();
    await expect(deleteProduct(db, ids.adminId, "00000000-0000-4000-8000-000000000000")).rejects.toThrow(/not found/);
  });

  it("is for the admin only", async () => {
    const { can } = await import("@/server/auth/permissions");
    expect(can("admin", "product.delete")).toBe(true);
    expect(can("staff", "product.delete")).toBe(false);
  });
});
