import { z } from "zod";
import { AUDIENCES, SIZES, SIZES_BY_AUDIENCE } from "@/lib/sizes";

export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const IMAGE_MAX_BYTES = 8 * 1024 * 1024;
export const DESCRIPTION_MAX = 1000;
export const QUANTITY_MAX = 100_000;
export const PRICE_MAX = 10_000_000;

const money = (label: string) =>
  z
    .number({ error: `Enter the ${label}` })
    .finite()
    .max(PRICE_MAX, "That price is too high")
    .refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, "Use at most 2 decimals");

const wholeNumber = (label: string) =>
  z.number({ error: `Enter the ${label}` }).int("Use a whole number").nonnegative("Cannot be negative");

export const sizeQuantitySchema = z.object({
  size: z.enum(SIZES),
  quantity: wholeNumber("quantity").max(QUANTITY_MAX),
});

export const productInputSchema = z
  .object({
    name: z.string().trim().min(2, "Enter a product name").max(120, "Keep the name under 120 characters"),
    description: z
      .string()
      .trim()
      .min(10, "Describe the product in at least 10 characters")
      .max(DESCRIPTION_MAX, `Keep the description under ${DESCRIPTION_MAX} characters`),
    categoryId: z.uuid().nullable(),
    audience: z.enum(AUDIENCES, { error: "Choose Kids, Youth or Adult" }),
    quantity: wholeNumber("total quantity").min(1, "Quantity must be at least 1").max(QUANTITY_MAX),
    sizes: z.array(sizeQuantitySchema),
    purchasePrice: money("purchase price").nonnegative("Cannot be negative"),
    sellingPrice: money("selling price").positive("Selling price must be above 0"),
  })
  .superRefine((v, ctx) => {
    const allowed = SIZES_BY_AUDIENCE[v.audience];
    const seen = new Set<string>();
    for (const row of v.sizes) {
      if (!allowed.includes(row.size)) {
        ctx.addIssue({ code: "custom", path: ["sizes"], message: `Size ${row.size} is not available for this group` });
      }
      if (seen.has(row.size)) ctx.addIssue({ code: "custom", path: ["sizes"], message: `Size ${row.size} is listed twice` });
      seen.add(row.size);
    }
    const total = v.sizes.reduce((s, r) => s + r.quantity, 0);
    if (total !== v.quantity) {
      ctx.addIssue({
        code: "custom",
        path: ["sizes"],
        message: `Size quantities add up to ${total}, but the total is ${v.quantity}`,
      });
    }
  });

export type ProductInput = z.infer<typeof productInputSchema>;

export const productUpdateSchema = z.object({
  id: z.uuid(),
  name: productInputSchema.shape.name,
  description: productInputSchema.shape.description,
  categoryId: z.uuid().nullable(),
  purchasePrice: money("purchase price").nonnegative("Cannot be negative"),
  sellingPrice: money("selling price").positive("Selling price must be above 0"),
});

/** Live numbers shown in the form and stored nowhere: estimates, not realized profit. */
export function priceSummary(purchase: number, selling: number, quantity: number) {
  const profitPerPiece = selling - purchase;
  return {
    profitPerPiece,
    margin: selling > 0 ? profitPerPiece / selling : NaN,
    totalPurchase: purchase * quantity,
    totalSales: selling * quantity,
    estimatedProfit: profitPerPiece * quantity,
  };
}
