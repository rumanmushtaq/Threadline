import { PermanentAIError, PROVIDER_TIMEOUT_MS, type GenerateRequest, type GeneratedImage, type ImageProvider } from "../provider";

/** OpenAI image edits with the product photo as the reference image. */
export class OpenAIProvider implements ImageProvider {
  readonly name = "openai";
  private key = process.env.OPENAI_API_KEY;
  private model = process.env.OPENAI_IMAGE_MODEL || "gpt-image-1";

  async generate(req: GenerateRequest): Promise<GeneratedImage[]> {
    if (!this.key) throw new PermanentAIError("AI provider not configured: set OPENAI_API_KEY");
    const form = new FormData();
    form.set("model", this.model);
    form.set("prompt", req.prompt);
    form.set("n", String(req.count));
    form.set("size", "1024x1536");
    form.set("image", new Blob([new Uint8Array(req.sourceImage)], { type: req.sourceContentType }), "product");
    const res = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: { authorization: `Bearer ${this.key}` },
      body: form,
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS * req.count),
    });
    const body = (await res.json().catch(() => ({}))) as { data?: { b64_json?: string }[]; error?: { message?: string } };
    if (!res.ok) {
      const msg = body.error?.message ?? `HTTP ${res.status}`;
      if (res.status === 400 || res.status === 401 || res.status === 403) throw new PermanentAIError(`OpenAI: ${msg}`);
      throw new Error(`OpenAI: ${msg}`);
    }
    const images = (body.data ?? []).filter((d) => d.b64_json).map((d) => ({ data: Buffer.from(d.b64_json!, "base64"), contentType: "image/png" }));
    if (!images.length) throw new Error("OpenAI returned no image");
    return images;
  }
}
