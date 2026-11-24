import { z } from "zod";
import { SIZES } from "@/lib/sizes";

// Shared by the "Record shop sale" form (client) and the server.
export const recordSaleSchema = z.object({
  productId: z.uuid({ error: "Choose a product" }),
  size: z.enum(SIZES, { error: "Choose a size" }),
  quantity: z.number({ error: "Enter a quantity" }).int("Use a whole number").min(1, "At least 1").max(1000, "That is too many"),
  unitPrice: z
    .number({ error: "Enter the sell price" })
    .finite()
    .min(0, "Cannot be negative")
    .max(10_000_000, "That price is too high")
    .refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, "Use at most 2 decimals"),
  soldOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick the sale date"),
  note: z.string().trim().max(200, "Keep the note under 200 characters").optional(),
});
export type RecordSaleInput = z.infer<typeof recordSaleSchema>;

export const SALE_CHANNELS = ["all", "shop", "website"] as const;
export type SaleChannel = (typeof SALE_CHANNELS)[number];
