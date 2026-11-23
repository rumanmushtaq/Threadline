import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { appUrl } from "@/server/app-url";
import { can } from "@/server/auth/permissions";
import { activityLogs, productImages } from "@/server/db/schema";
import { addProductPhoto, deleteProductPhoto, MAX_PHOTOS_PER_PRODUCT, reviewProductPhoto } from "@/server/product-photos";
import { createProduct, setProductArchived } from "@/server/products";
import { getPublicProduct, listShop, shopFiltersSchema } from "@/server/public-products";
import { db, productInput, resetDb, seedUsers, testDb, testImage } from "./helpers";

let ids: { adminId: string; staffId: string };
beforeEach(async () => {
  await resetDb();
  ids = await seedUsers();
});
afterAll(() => testDb.close());

const publicKinds = async (slug: string) => (await getPublicProduct(db, slug))!.images.map((i) => i.kind);

describe("photos added by hand", () => {
  it("stay hidden from customers until an admin approves them", async () => {
    const p = await createProduct(db, ids.staffId, productInput(), await testImage());
    const photo = await addProductPhoto(db, ids.staffId, p.id, await testImage("#225588"));
    expect(photo.review).toBe("pending");
    expect(await publicKinds(p.slug)).toEqual(["original"]);

    await reviewProductPhoto(db, ids.adminId, photo.id, "approved");
    expect(await publicKinds(p.slug)).toEqual(["photo", "original"]);
    const [row] = await db.select().from(productImages).where(eq(productImages.id, photo.id));
    expect(row).toMatchObject({ uploadedBy: ids.staffId, reviewedBy: ids.adminId });
    expect(row.reviewedAt).toBeInstanceOf(Date);
  });

  it("become the shop card photo once approved, before the original", async () => {
    const p = await createProduct(db, ids.staffId, productInput(), await testImage());
    const card = async () => (await listShop(db, shopFiltersSchema.parse({}))).items[0].imageUrl;
    const before = await card();
    const photo = await addProductPhoto(db, ids.adminId, p.id, await testImage("#225588"), { approveNow: true });
    expect(photo.review).toBe("approved");
    expect(await card()).not.toBe(before);
    await reviewProductPhoto(db, ids.adminId, photo.id, "hidden");
    expect(await card()).toBe(before);
  });

  it("can hide any photo, including the first one", async () => {
    const p = await createProduct(db, ids.staffId, productInput(), await testImage());
    const [original] = await db.select().from(productImages).where(eq(productImages.productId, p.id));
    await reviewProductPhoto(db, ids.adminId, original.id, "hidden");
    expect(await publicKinds(p.slug)).toEqual([]);
    expect((await listShop(db, shopFiltersSchema.parse({}))).items[0].imageUrl).toBeNull();
    await reviewProductPhoto(db, ids.adminId, original.id, "approved");
    expect(await publicKinds(p.slug)).toEqual(["original"]);
  });

  it("deletes only hand-added photos and logs every step", async () => {
    const p = await createProduct(db, ids.staffId, productInput(), await testImage());
    const photo = await addProductPhoto(db, ids.staffId, p.id, await testImage("#225588"));
    const [original] = await db.select().from(productImages).where(eq(productImages.kind, "original"));
    await expect(deleteProductPhoto(db, ids.adminId, original.id)).rejects.toThrow(/Only photos added by hand/);
    await deleteProductPhoto(db, ids.adminId, photo.id);
    expect(await db.select().from(productImages).where(eq(productImages.productId, p.id))).toHaveLength(1);
    const actions = (await db.select().from(activityLogs)).map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(["photo.added", "photo.deleted"]));
  });

  it("refuses bad files, archived products, unknown ids and too many photos", async () => {
    const p = await createProduct(db, ids.staffId, productInput(), await testImage());
    await expect(addProductPhoto(db, ids.staffId, p.id, Buffer.from("not an image"))).rejects.toThrow();
    await expect(addProductPhoto(db, ids.staffId, p.id, await testImage("#111111", 100, 100))).rejects.toThrow(/at least|too small|200/i);
    await expect(addProductPhoto(db, ids.staffId, "00000000-0000-4000-8000-000000000000", await testImage())).rejects.toThrow(/not found/);
    await expect(reviewProductPhoto(db, ids.adminId, "00000000-0000-4000-8000-000000000000", "approved")).rejects.toThrow(/not found/);
    await db.insert(productImages).values(
      Array.from({ length: MAX_PHOTOS_PER_PRODUCT }, (_, i) => ({ productId: p.id, kind: "photo" as const, storageKey: `x/${i}.png`, contentType: "image/png" })),
    );
    await expect(addProductPhoto(db, ids.staffId, p.id, await testImage())).rejects.toThrow(/up to 12/);
    await setProductArchived(db, ids.adminId, p.id, true);
    await expect(addProductPhoto(db, ids.staffId, p.id, await testImage())).rejects.toThrow(/archived/);
  });

  it("lets staff upload but only the admin approve, hide or delete", () => {
    expect(can("staff", "photo.upload")).toBe(true);
    expect(can("staff", "photo.review")).toBe(false);
    expect(can("admin", "photo.review")).toBe(true);
  });
});

describe("public site address", () => {
  const saved = { ...process.env };
  afterEach(() => {
    for (const k of ["APP_URL", "VERCEL", "VERCEL_PROJECT_PRODUCTION_URL", "VERCEL_URL"]) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("never hands out a localhost link on Vercel", () => {
    Object.assign(process.env, { VERCEL: "1", VERCEL_PROJECT_PRODUCTION_URL: "shop.example.com", APP_URL: "http://localhost:3000" });
    expect(appUrl()).toBe("https://shop.example.com");
    delete process.env.APP_URL;
    expect(appUrl()).toBe("https://shop.example.com");
  });

  it("uses APP_URL as set, without a trailing slash", () => {
    Object.assign(process.env, { VERCEL: "1", VERCEL_PROJECT_PRODUCTION_URL: "x.vercel.app", APP_URL: "https://threadline.pk/" });
    expect(appUrl()).toBe("https://threadline.pk");
    delete process.env.VERCEL;
    process.env.APP_URL = "http://localhost:3200";
    expect(appUrl()).toBe("http://localhost:3200");
  });
});

describe("logo on customer photos", () => {
  it("stamps new photos when on, keeps the original clean, and brings old photos in line", async () => {
    const { settings } = await import("@/server/db/schema");
    const { photosNeedingLogoUpdate, syncPhotoLogos } = await import("@/server/storage-maintenance");
    const { storage } = await import("@/server/storage");
    const sharp = (await import("sharp")).default;

    const p = await createProduct(db, ids.staffId, productInput(), await testImage("#ffffff"));
    const [first] = await db.select().from(productImages).where(eq(productImages.productId, p.id));
    expect(first.hasLogo).toBe(true);
    // The logo sits in the bottom-right corner of the display copy; the original is untouched.
    const corner = async (key: string) => {
      const img = sharp(await storage().get(key));
      const { width, height } = await img.metadata();
      const { data } = await img.extract({ left: Math.round(width! * 0.75), top: Math.round(height! * 0.9), width: Math.round(width! * 0.2), height: Math.round(height! * 0.05) }).raw().toBuffer({ resolveWithObject: true });
      return data.reduce((a, b) => a + b, 0) / data.length;
    };
    expect(await corner(first.displayKey!)).toBeLessThan(200); // darkened by the logo pill
    expect(await corner(first.storageKey)).toBeGreaterThan(250); // still plain white

    // Turned off: the existing photo now needs updating, and the sync removes the logo.
    await db.update(settings).set({ photoLogo: false });
    expect(await photosNeedingLogoUpdate(db)).toBe(1);
    const res = await syncPhotoLogos(db, { actorId: ids.adminId });
    expect(res).toEqual({ done: 1, left: 0 });
    const [after] = await db.select().from(productImages).where(eq(productImages.id, first.id));
    expect(after.hasLogo).toBe(false);
    expect(after.displayKey).not.toBe(first.displayKey);
    expect(await corner(after.displayKey!)).toBeGreaterThan(250);
    await expect(storage().get(first.displayKey!)).rejects.toThrow(); // old copy removed

    // New photos follow the setting, and "redo all" remakes matching ones too.
    const photo = await addProductPhoto(db, ids.adminId, p.id, await testImage(), { approveNow: true });
    expect((await db.select().from(productImages).where(eq(productImages.id, photo.id)))[0].hasLogo).toBe(false);
    await db.update(settings).set({ photoLogo: true, photoLogoCorner: "top-left" });
    expect((await syncPhotoLogos(db, { redoAll: true })).left).toBe(0);
    expect((await db.select().from(productImages).where(eq(productImages.productId, p.id))).every((r) => r.hasLogo)).toBe(true);
  });
});
