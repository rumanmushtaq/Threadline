/** Timeout per provider call (per image); also used to plan the worker's time budget. */
export const PROVIDER_TIMEOUT_MS = 90_000;

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

/** Retrying today will not help (free daily allowance used up). Triggers the fallback provider. */
export class QuotaExceededError extends Error {
  readonly quota = true;
}

export const PROVIDER_NAMES = ["cloudflare", "gemini", "openai"] as const;
export type ProviderName = (typeof PROVIDER_NAMES)[number];

export const PROVIDER_LABEL: Record<ProviderName, string> = {
  cloudflare: "Cloudflare FLUX.2 (free)",
  gemini: "Google Gemini (paid)",
  openai: "OpenAI (paid)",
};

export function providerConfigured(name: ProviderName) {
  if (name === "cloudflare") return !!(process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_API_TOKEN);
  if (name === "gemini") return !!process.env.GEMINI_API_KEY;
  return !!process.env.OPENAI_API_KEY;
}

export function availableProviders(): ProviderName[] {
  return PROVIDER_NAMES.filter(providerConfigured);
}

export function defaultProviderName(): string {
  return process.env.AI_IMAGE_PROVIDER || "cloudflare";
}

let override: ImageProvider | null = null;

/** False until the default AI service has its keys: products then keep their original photo only. */
export function aiConfigured() {
  if (override) return true;
  const name = defaultProviderName();
  return (PROVIDER_NAMES as readonly string[]).includes(name) && providerConfigured(name as ProviderName);
}

/** Tests swap in a stub provider; production always reads AI_IMAGE_PROVIDER. */
export function setImageProviderForTests(p: ImageProvider | null) {
  override = p;
}

export async function getImageProvider(name: string = defaultProviderName()): Promise<ImageProvider> {
  if (override) return override;
  switch (name) {
    case "cloudflare": {
      const { CloudflareProvider } = await import("./providers/cloudflare");
      return new CloudflareProvider();
    }
    case "gemini": {
      const { GeminiProvider } = await import("./providers/gemini");
      return new GeminiProvider();
    }
    case "openai": {
      const { OpenAIProvider } = await import("./providers/openai");
      return new OpenAIProvider();
    }
    default:
      throw new PermanentAIError(`Unknown AI image provider "${name}"`);
  }
}

/**
 * Generates with the requested (or default) provider. When the free provider's daily
 * allowance is used up and AI_FALLBACK_PROVIDER is set, the paid fallback takes over,
 * so products still get photos the same day.
 */
export async function generateImages(req: GenerateRequest, requested?: string | null) {
  const primaryName = requested || defaultProviderName();
  const primary = await getImageProvider(primaryName);
  try {
    return { images: await primary.generate(req), provider: primary.name };
  } catch (err) {
    const fallbackName = process.env.AI_FALLBACK_PROVIDER;
    if (!(err instanceof QuotaExceededError) || !fallbackName || fallbackName === primaryName || override) throw err;
    const fallback = await getImageProvider(fallbackName);
    return { images: await fallback.generate(req), provider: fallback.name };
  }
}
