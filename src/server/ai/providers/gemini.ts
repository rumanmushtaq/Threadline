import { PermanentAIError, type GenerateRequest, type GeneratedImage, type ImageProvider } from "../provider";

type Part = { text?: string; inlineData?: { mimeType: string; data: string } };
type Response = {
  candidates?: { content?: { parts?: Part[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  error?: { message?: string; status?: string };
};

/** Google Gemini image model ("Nano Banana"), which edits from a reference photo. */
export class GeminiProvider implements ImageProvider {
  readonly name = "gemini";
  private key = process.env.GEMINI_API_KEY;
  private model = process.env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image";

  async generate(req: GenerateRequest): Promise<GeneratedImage[]> {
    if (!this.key) throw new PermanentAIError("AI provider not configured: set GEMINI_API_KEY");
    const out: GeneratedImage[] = [];
    // One request per variation keeps each image tied closely to the reference photo.
    for (let i = 0; i < req.count; i++) out.push(await this.once(req, i));
    return out;
  }

  private async once(req: GenerateRequest, variation: number): Promise<GeneratedImage> {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": this.key! },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              { inlineData: { mimeType: req.sourceContentType, data: req.sourceImage.toString("base64") } },
              { text: `${req.prompt}\nVariation ${variation + 1}: use a different pose and camera angle from other variations.` },
            ],
          },
        ],
        generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: "4:5" } },
      }),
      signal: AbortSignal.timeout(120_000),
    });
    const body = (await res.json().catch(() => ({}))) as Response;
    if (!res.ok) {
      const msg = body.error?.message ?? `HTTP ${res.status}`;
      if (res.status === 400 || res.status === 401 || res.status === 403) throw new PermanentAIError(`Gemini: ${msg}`);
      throw new Error(`Gemini: ${msg}`);
    }
    if (body.promptFeedback?.blockReason) throw new PermanentAIError(`Gemini blocked the request: ${body.promptFeedback.blockReason}`);
    const part = body.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
    if (!part?.inlineData) throw new Error(`Gemini returned no image (${body.candidates?.[0]?.finishReason ?? "unknown reason"})`);
    return { data: Buffer.from(part.inlineData.data, "base64"), contentType: part.inlineData.mimeType };
  }
}
