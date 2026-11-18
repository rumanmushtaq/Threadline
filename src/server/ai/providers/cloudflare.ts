import sharp from "sharp";
import {
  PermanentAIError,
  PROVIDER_TIMEOUT_MS,
  QuotaExceededError,
  type GenerateRequest,
  type GeneratedImage,
  type ImageProvider,
} from "../provider";

type CfResponse = {
  success?: boolean;
  result?: { image?: string };
  errors?: { code?: number; message?: string }[];
};

/**
 * Cloudflare Workers AI, FLUX.2 [klein]. Free within the daily 10,000-neuron allowance
 * (one 1024×1280 image with the 4B model is about 160 neurons). Edits from the product
 * photo passed as a reference image.
 */
export class CloudflareProvider implements ImageProvider {
  readonly name = "cloudflare";
  private account = process.env.CLOUDFLARE_ACCOUNT_ID;
  private token = process.env.CLOUDFLARE_API_TOKEN;
  private model = process.env.CLOUDFLARE_IMAGE_MODEL || "@cf/black-forest-labs/flux-2-klein-4b";

  async generate(req: GenerateRequest): Promise<GeneratedImage[]> {
    if (!this.account || !this.token) {
      throw new PermanentAIError("AI provider not configured: set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN");
    }
    const reference = await this.referenceImage(req.sourceImage);
    const out: GeneratedImage[] = [];
    for (let i = 0; i < req.count; i++) out.push(await this.once(req.prompt, reference, i));
    return out;
  }

  /** The 4B model only accepts reference images smaller than 512×512. */
  private async referenceImage(source: Buffer) {
    const max = this.model.includes("klein-4b") ? 511 : 1024;
    return sharp(source).rotate().resize({ width: max, height: max, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 92 }).toBuffer();
  }

  private async once(prompt: string, reference: Buffer, variation: number): Promise<GeneratedImage> {
    const form = new FormData();
    form.set(
      "prompt",
      `${prompt}\nUse image 0 as the exact garment reference.\nVariation ${variation + 1}: use a different pose and camera angle from other variations.`,
    );
    form.set("input_image_0", new Blob([new Uint8Array(reference)], { type: "image/jpeg" }), "garment.jpg");
    form.set("width", "1024");
    form.set("height", "1280");
    form.set("seed", String(Math.floor(Math.random() * 2_147_483_647)));

    const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${this.account}/ai/run/${this.model}`, {
      method: "POST",
      headers: { authorization: `Bearer ${this.token}` },
      body: form,
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    });
    const body = (await res.json().catch(() => ({}))) as CfResponse;
    const message = body.errors?.map((e) => `${e.code ?? ""} ${e.message ?? ""}`.trim()).join("; ") || `HTTP ${res.status}`;

    if (!res.ok || body.success === false) {
      if (res.status === 429 || /neuron|allocation|quota|rate limit|exceeded/i.test(message)) {
        throw new QuotaExceededError(`Cloudflare daily free allowance used up (${message})`);
      }
      if (res.status === 400 || res.status === 401 || res.status === 403 || res.status === 404) {
        throw new PermanentAIError(`Cloudflare: ${message}`);
      }
      throw new Error(`Cloudflare: ${message}`);
    }
    const b64 = body.result?.image;
    if (!b64) throw new Error("Cloudflare returned no image");
    const data = Buffer.from(b64, "base64");
    const meta = await sharp(data).metadata().catch(() => null);
    const contentType = meta?.format === "png" ? "image/png" : meta?.format === "webp" ? "image/webp" : "image/jpeg";
    return { data, contentType };
  }
}
