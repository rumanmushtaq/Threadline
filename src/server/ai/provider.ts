export type GeneratedImage = { data: Buffer; contentType: string };

export type GenerateRequest = {
  /** The untouched original product photo. */
  sourceImage: Buffer;
  sourceContentType: string;
  prompt: string;
  count: number;
};

/** Any AI image service. Add a provider by implementing this and registering it below. */
export interface ImageProvider {
  readonly name: string;
  generate(req: GenerateRequest): Promise<GeneratedImage[]>;
}

/** Thrown for problems retrying cannot fix (missing key, refused prompt). */
export class PermanentAIError extends Error {
  readonly permanent = true;
}

let override: ImageProvider | null = null;

/** Tests swap in a stub provider; production always reads AI_IMAGE_PROVIDER. */
export function setImageProviderForTests(p: ImageProvider | null) {
  override = p;
}

export async function getImageProvider(): Promise<ImageProvider> {
  if (override) return override;
  const name = process.env.AI_IMAGE_PROVIDER ?? "gemini";
  switch (name) {
    case "gemini": {
      const { GeminiProvider } = await import("./providers/gemini");
      return new GeminiProvider();
    }
    case "openai": {
      const { OpenAIProvider } = await import("./providers/openai");
      return new OpenAIProvider();
    }
    default:
      throw new PermanentAIError(`Unknown AI_IMAGE_PROVIDER "${name}"`);
  }
}
