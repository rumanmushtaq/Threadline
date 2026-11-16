import type { Audience } from "@/lib/sizes";

const MODEL: Record<Audience, string> = {
  kids: "a cheerful child model (around 7–10 years old) in a natural, playful but modest pose, styled like a family-friendly kids' clothing catalogue",
  youth: "a confident teenage model (around 15–18 years old) in a relaxed, modern pose, styled like a youth streetwear catalogue",
  adult: "an adult model (around 25–35 years old) in an elegant, confident pose, styled like a premium fashion catalogue",
};

/**
 * Prompt for a photo of a model wearing the exact garment. Text is deliberately excluded:
 * prices, SKU and sizes are drawn later by the deterministic template.
 */
export function buildPrompt(p: { name: string; description: string; audience: Audience; category?: string | null }) {
  return [
    `Create a professional, photorealistic e-commerce fashion photograph of ${MODEL[p.audience]} wearing the exact clothing item shown in the reference image.`,
    `The item: ${p.name}${p.category ? ` (${p.category})` : ""}. ${p.description}`,
    "Reproduce the garment faithfully: keep the exact colours, fabric texture, cut, fit, stitching, prints, patterns, logos and any text on the garment. Do not redesign, recolour or add details to it.",
    "The model is fully and modestly clothed, with tasteful complementary pieces that do not distract from the product. Natural skin, realistic hands and face.",
    "Setting: a clean, modern, softly blurred commercial background (light studio backdrop or an elegant minimal interior), with soft diffused studio lighting and gentle shadows.",
    "Framing: vertical portrait, the garment fully visible and in sharp focus, shot on a full-frame camera with an 85mm lens.",
    "Do not add any text, watermark, price, label, logo or border to the image.",
  ].join("\n");
}
