import { eq, sql } from "drizzle-orm";
import sharp from "sharp";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { composeMarketingCard } from "@/server/ai/compose";
import { PermanentAIError, setImageProviderForTests, type ImageProvider } from "@/server/ai/provider";
import { claimNextJob, retryDelayMs, runWorker } from "@/server/ai/worker";
import { aiGenerationJobs, notifications, productImages } from "@/server/db/schema";
import { createProduct } from "@/server/products";
import { db, productInput, resetDb, seedUsers, testDb, testImage } from "./helpers";

let ids: { adminId: string; staffId: string };
let calls = 0;

function stub(behaviour: (n: number) => "ok" | "transient" | "permanent"): ImageProvider {
  return {
    name: "stub",
    async generate(req) {
      calls++;
      const b = behaviour(calls);
      if (b === "transient") throw new Error("provider timeout");
      if (b === "permanent") throw new PermanentAIError("prompt refused");
      return Promise.all(Array.from({ length: req.count }, async () => ({ data: await testImage("#3a5a40", 832, 1040), contentType: "image/jpeg" })));
    },
  };
}

beforeEach(async () => {
  await resetDb();
  ids = await seedUsers();
  calls = 0;
  process.env.AI_VARIATIONS = "2";
});
afterEach(() => setImageProviderForTests(null));
afterAll(() => testDb.close());

describe("AI generation worker", () => {
  it("stores AI photos and composed marketing cards, then completes and notifies", async () => {
    setImageProviderForTests(stub(() => "ok"));
    const p = await createProduct(db, ids.staffId, productInput(), await testImage());
    expect(await runWorker({ db })).toEqual({ processed: 1 });

    const [job] = await db.select().from(aiGenerationJobs).where(eq(aiGenerationJobs.productId, p.id));
    expect(job.status).toBe("completed");
    expect(job.provider).toBe("stub");
    const imgs = await db.select().from(productImages).where(eq(productImages.productId, p.id));
    expect(imgs.filter((i) => i.kind === "ai_model")).toHaveLength(2);
    expect(imgs.filter((i) => i.kind === "marketing")).toHaveLength(2);
    expect(imgs.filter((i) => i.kind === "original")).toHaveLength(1); // original never replaced
    const notes = await db.select().from(notifications).where(eq(notifications.userId, ids.staffId));
    expect(notes.map((n) => n.type)).toContain("ai.completed");
  });

  it("retries transient errors with backoff and succeeds later", async () => {
    setImageProviderForTests(stub((n) => (n === 1 ? "transient" : "ok")));
    const p = await createProduct(db, ids.staffId, productInput(), await testImage());
    await runWorker({ db });
    let [job] = await db.select().from(aiGenerationJobs).where(eq(aiGenerationJobs.productId, p.id));
    expect(job.status).toBe("pending");
    expect(job.attempts).toBe(1);
    expect(job.lastError).toMatch(/timeout/);
    expect(job.runAfter.getTime()).toBeGreaterThan(Date.now() + 20_000);

    // Not runnable before run_after.
    expect(await runWorker({ db })).toEqual({ processed: 0 });
    await db.update(aiGenerationJobs).set({ runAfter: new Date(Date.now() - 1000) }).where(eq(aiGenerationJobs.id, job.id));
    await runWorker({ db });
    [job] = await db.select().from(aiGenerationJobs).where(eq(aiGenerationJobs.id, job.id));
    expect(job.status).toBe("completed");
    expect(job.attempts).toBe(2);
  });

  it("fails permanently without retrying and never blocks the product", async () => {
    setImageProviderForTests(stub(() => "permanent"));
    const p = await createProduct(db, ids.staffId, productInput(), await testImage());
    await runWorker({ db });
    const [job] = await db.select().from(aiGenerationJobs).where(eq(aiGenerationJobs.productId, p.id));
    expect(job.status).toBe("failed");
    expect(job.attempts).toBe(1);
    const notes = await db.select().from(notifications).where(eq(notifications.userId, ids.staffId));
    expect(notes.map((n) => n.type)).toContain("ai.failed");
  });

  it("gives up after max attempts", async () => {
    setImageProviderForTests(stub(() => "transient"));
    await createProduct(db, ids.staffId, productInput(), await testImage());
    for (let i = 0; i < 3; i++) {
      await db.execute(sql`UPDATE ai_generation_jobs SET run_after = now() - interval '1 second'`);
      await runWorker({ db });
    }
    const [job] = await db.select().from(aiGenerationJobs);
    expect(job.status).toBe("failed");
    expect(job.attempts).toBe(3);
  });

  it("re-claims a job whose worker crashed, and never hands one job to two workers", async () => {
    const p = await createProduct(db, ids.staffId, productInput(), await testImage());
    const claims = await Promise.all([claimNextJob(db), claimNextJob(db), claimNextJob(db)]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    expect(await claimNextJob(db)).toBeNull();
    await db.update(aiGenerationJobs).set({ lockedUntil: new Date(Date.now() - 1000) }).where(eq(aiGenerationJobs.productId, p.id));
    const again = await claimNextJob(db);
    expect(again?.attempts).toBe(2);
  });

  it("backoff grows exponentially", () => {
    expect(retryDelayMs(1)).toBe(30_000);
    expect(retryDelayMs(2)).toBe(120_000);
    expect(retryDelayMs(3)).toBe(480_000);
  });
});

describe("marketing card composition", () => {
  it("renders a 1080x1350 JPEG for both layouts", async () => {
    const photo = await testImage("#8a6f5a", 900, 1200);
    for (const layout of [0, 1]) {
      const card = await composeMarketingCard(
        photo,
        { name: "Navy Oversized Cotton Tee", sku: "CLO-000001", price: "Rs. 1,500", sizes: ["M", "L", "XL"], audience: "Adult", category: "T-Shirts", brand: "Threadline", tagline: null },
        layout,
      );
      const meta = await sharp(card).metadata();
      expect([meta.format, meta.width, meta.height]).toEqual(["jpeg", 1080, 1350]);
    }
  });
});

describe("worker crash safety", () => {
  it("never re-runs a job whose worker died on the last attempt", async () => {
    const p = await createProduct(db, ids.staffId, productInput(), await testImage());
    await db
      .update(aiGenerationJobs)
      .set({ status: "processing", attempts: 3, lockedUntil: new Date(Date.now() - 1000) })
      .where(eq(aiGenerationJobs.productId, p.id));
    expect(await claimNextJob(db)).toBeNull();
    const { failAbandonedJobs } = await import("@/server/ai/worker");
    expect(await failAbandonedJobs(db)).toBe(1);
    const [job] = await db.select().from(aiGenerationJobs).where(eq(aiGenerationJobs.productId, p.id));
    expect(job.status).toBe("failed");
  });

  it("drops the result of a worker that lost its job to another worker", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    setImageProviderForTests({
      name: "slow",
      async generate(req) {
        await gate;
        return Promise.all(Array.from({ length: req.count }, async () => ({ data: await testImage("#123456", 832, 1040), contentType: "image/jpeg" })));
      },
    });
    const p = await createProduct(db, ids.staffId, productInput(), await testImage());
    const first = runWorker({ db, maxJobs: 1 });
    // Simulate the first worker's lock expiring and a second worker taking over the job.
    await new Promise((r) => setTimeout(r, 300));
    await db.update(aiGenerationJobs).set({ lockedUntil: new Date(Date.now() - 1000) }).where(eq(aiGenerationJobs.productId, p.id));
    const taken = await claimNextJob(db);
    expect(taken?.attempts).toBe(2);
    release();
    await first;
    const imgs = await db.select().from(productImages).where(eq(productImages.productId, p.id));
    expect(imgs.filter((i) => i.kind !== "original")).toHaveLength(0);
    const [job] = await db.select().from(aiGenerationJobs).where(eq(aiGenerationJobs.productId, p.id));
    expect([job.status, job.attempts]).toEqual(["processing", 2]);
  });
});
