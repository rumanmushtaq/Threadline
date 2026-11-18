import { eq } from "drizzle-orm";
import sharp from "sharp";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateImages, PermanentAIError, QuotaExceededError, setImageProviderForTests } from "@/server/ai/provider";
import { CloudflareProvider } from "@/server/ai/providers/cloudflare";
import { nextQuotaReset, runWorker } from "@/server/ai/worker";
import { aiGenerationJobs } from "@/server/db/schema";
import { createProduct } from "@/server/products";
import { db, productInput, resetDb, seedUsers, testDb, testImage } from "./helpers";

const ENV = { ...process.env };
const req = async () => ({ sourceImage: await testImage("#1f3a5f", 1200, 1500), sourceContentType: "image/jpeg", prompt: "model wearing the garment", count: 2 });
const pngB64 = async () => (await sharp({ create: { width: 64, height: 80, channels: 3, background: "#ccc" } }).png().toBuffer()).toString("base64");

afterEach(() => {
  vi.unstubAllGlobals();
  process.env = { ...ENV };
  setImageProviderForTests(null);
});

describe("Cloudflare FLUX.2 provider", () => {
  it("sends the product photo as a reference smaller than 512×512 and returns the images", async () => {
    process.env.CLOUDFLARE_ACCOUNT_ID = "acc123";
    process.env.CLOUDFLARE_API_TOKEN = "tok456";
    const calls: { url: string; auth: string | null; form: FormData }[] = [];
    const b64 = await pngB64();
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      calls.push({ url, auth: new Headers(init.headers).get("authorization"), form: init.body as FormData });
      return new Response(JSON.stringify({ success: true, result: { image: b64 } }), { status: 200 });
    });
    const out = await new CloudflareProvider().generate(await req());
    expect(out).toHaveLength(2);
    expect(out[0].contentType).toBe("image/png");
    expect(calls).toHaveLength(2);
    const { url, auth, form } = calls[0];
    expect(url).toBe("https://api.cloudflare.com/client/v4/accounts/acc123/ai/run/@cf/black-forest-labs/flux-2-klein-4b");
    expect(auth).toBe("Bearer tok456");
    expect(form.get("width")).toBe("1024");
    expect(form.get("height")).toBe("1280");
    expect(String(form.get("prompt"))).toContain("image 0");
    const ref = Buffer.from(await (form.get("input_image_0") as Blob).arrayBuffer());
    const meta = await sharp(ref).metadata();
    expect(Math.max(meta.width!, meta.height!)).toBeLessThan(512);
  });

  it("reports a used-up daily allowance as a quota error and bad credentials as permanent", async () => {
    process.env.CLOUDFLARE_ACCOUNT_ID = "acc";
    process.env.CLOUDFLARE_API_TOKEN = "tok";
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ success: false, errors: [{ code: 4006, message: "you have used up your daily free allocation of 10,000 neurons" }] }), { status: 429 }));
    await expect(new CloudflareProvider().generate(await req())).rejects.toBeInstanceOf(QuotaExceededError);
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ success: false, errors: [{ code: 10000, message: "Authentication error" }] }), { status: 401 }));
    await expect(new CloudflareProvider().generate(await req())).rejects.toBeInstanceOf(PermanentAIError);
    delete process.env.CLOUDFLARE_API_TOKEN;
    await expect(new CloudflareProvider().generate(await req())).rejects.toThrow(/not configured/);
  });

  it("falls back to the paid provider when the free allowance is used up", async () => {
    Object.assign(process.env, { AI_IMAGE_PROVIDER: "cloudflare", AI_FALLBACK_PROVIDER: "gemini", CLOUDFLARE_ACCOUNT_ID: "a", CLOUDFLARE_API_TOKEN: "t", GEMINI_API_KEY: "g" });
    delete process.env.GEMINI_IMAGE_MODEL;
    const b64 = await pngB64();
    const urls: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      urls.push(url);
      if (url.includes("cloudflare")) return new Response(JSON.stringify({ success: false, errors: [{ message: "neurons exceeded" }] }), { status: 429 });
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: b64 } }] } }] }), { status: 200 });
    });
    const res = await generateImages(await req());
    expect(res.provider).toBe("gemini");
    expect(res.images).toHaveLength(2);
    expect(urls.some((u) => u.includes("/models/gemini-3.1-flash-lite-image:generateContent"))).toBe(true);
  });
});

describe("worker and the free allowance", () => {
  let ids: { adminId: string; staffId: string };
  beforeEach(async () => {
    await resetDb();
    ids = await seedUsers();
  });
  afterAll(() => testDb.close());

  it("waits for the daily reset instead of using up attempts", async () => {
    setImageProviderForTests({
      name: "cloudflare",
      async generate() {
        throw new QuotaExceededError("used up");
      },
    });
    const p = await createProduct(db, ids.staffId, productInput(), await testImage());
    await runWorker({ db });
    const [job] = await db.select().from(aiGenerationJobs).where(eq(aiGenerationJobs.productId, p.id));
    expect(job.status).toBe("pending");
    expect(job.attempts).toBe(0);
    expect(job.runAfter.toISOString()).toBe(nextQuotaReset().toISOString());
    expect(job.lastError).toMatch(/free daily image allowance/);
  });

  it("next reset is 00:05 UTC tomorrow", () => {
    expect(nextQuotaReset(new Date("2026-11-18T23:59:00Z")).toISOString()).toBe("2026-11-19T00:05:00.000Z");
    expect(nextQuotaReset(new Date("2026-12-31T10:00:00Z")).toISOString()).toBe("2027-01-01T00:05:00.000Z");
  });
});
