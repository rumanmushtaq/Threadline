import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createProduct, setProductArchived, setProductPublished } from "@/server/products";
import { listShop, shopFiltersSchema } from "@/server/public-products";
import { recordStockMovement } from "@/server/inventory";
import { db, productInput, resetDb, seedUsers, testDb, testImage } from "./helpers";

let ids: { adminId: string; staffId: string };
const all = (over: Record<string, unknown> = {}) => listShop(db, shopFiltersSchema.parse(over));

beforeEach(async () => {
  await resetDb();
  ids = await seedUsers();
});
afterAll(() => testDb.close());

const make = async (over: Parameters<typeof productInput>[0] = {}) => createProduct(db, ids.staffId, productInput(over), await testImage());

describe("shop page", () => {
  it("lists only products that are on sale, with customer-safe fields", async () => {
    const live = await make({ name: "Live Tee" });
    const hidden = await make({ name: "Hidden Tee" });
    const archived = await make({ name: "Archived Tee" });
    await setProductPublished(db, ids.adminId, hidden.id, false);
    await setProductArchived(db, ids.adminId, archived.id, true);

    const shop = await all();
    expect(shop.items.map((i) => i.name)).toEqual(["Live Tee"]);
    expect(shop.total).toBe(1);
    const json = JSON.stringify(shop);
    for (const leak of ["purchase", "cost", "margin", "profit", live.id, ids.staffId, ids.adminId]) expect(json).not.toContain(leak);
    expect(Object.keys(shop.items[0]).sort()).toEqual(["audience", "available", "category", "hoverUrl", "imageUrl", "isNew", "name", "price", "sizes", "slug"]);
    expect(shop.items[0].imageUrl).toMatch(/derived\//); // the re-encoded copy, never the original upload
  });

  it("filters by search, category and age group, and sorts by price", async () => {
    const cats = await db.query.categories.findMany();
    const tees = cats.find((c) => c.name === "T-Shirts")!;
    const hoodies = cats.find((c) => c.name === "Hoodies & Sweatshirts")!;
    await make({ name: "Navy Tee", categoryId: tees.id, sellingPrice: 1500 });
    await make({ name: "Grey Hoodie", categoryId: hoodies.id, sellingPrice: 3500 });
    await make({ name: "Kids Tee", categoryId: tees.id, audience: "kids", sizes: [{ size: "S", quantity: 45 }], sellingPrice: 900 });

    expect((await all({ q: "hood" })).items.map((i) => i.name)).toEqual(["Grey Hoodie"]);
    expect((await all({ q: "100%_" })).items).toEqual([]); // wildcards are matched literally
    expect((await all({ category: tees.slug })).total).toBe(2);
    expect((await all({ audience: "kids" })).items.map((i) => i.name)).toEqual(["Kids Tee"]);
    expect((await all({ sort: "price-asc" })).items.map((i) => i.price)).toEqual([90000, 150000, 350000]);
    expect((await all({ sort: "price-desc" })).items[0].name).toBe("Grey Hoodie");
    expect((await all()).categories).toEqual([
      { name: "Hoodies & Sweatshirts", slug: hoodies.slug, count: 1 },
      { name: "T-Shirts", slug: tees.slug, count: 2 },
    ]);
  });

  it("puts sold-out products last and shows what is left", async () => {
    const gone = await make({ name: "Gone Tee", quantity: 2, sizes: [{ size: "M", quantity: 2 }] });
    await make({ name: "Plenty Tee" });
    await recordStockMovement(db, ids.adminId, { productId: gone.id, kind: "stock_out", lines: [{ size: "M", quantity: 2 }], reason: "Damaged in storage" });
    const shop = await all();
    expect(shop.items.map((i) => [i.name, i.available])).toEqual([["Plenty Tee", 45], ["Gone Tee", 0]]);
  });

  it("bad URL parameters fall back to defaults instead of failing", () => {
    expect(shopFiltersSchema.parse({ sort: "drop table", page: "-4", audience: "aliens", q: "x".repeat(500) })).toEqual({
      q: "",
      category: "",
      audience: undefined,
      sort: "newest",
      page: 1,
    });
  });
});
