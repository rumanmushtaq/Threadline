import { z } from "zod";
import { SIZES } from "@/lib/sizes";

const phone = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s-]/g, ""))
  .pipe(z.string().regex(/^\+?\d{10,15}$/, "Enter a valid phone number, e.g. 03001234567"));

export const orderInputSchema = z.object({
  slug: z.string().trim().min(1).max(40),
  size: z.enum(SIZES, { error: "Choose a size" }),
  quantity: z.number({ error: "Enter a quantity" }).int("Use a whole number").min(1, "At least 1").max(1000),
  customerName: z.string().trim().min(2, "Enter your name").max(80),
  phone,
  whatsapp: z.union([z.literal(""), phone]).optional().transform((v) => v || null),
  address: z.string().trim().min(10, "Enter your full delivery address").max(300),
  city: z.string().trim().min(2, "Enter your city").max(60),
  notes: z.string().trim().max(500, "Keep notes under 500 characters").optional().transform((v) => v || null),
  // Honeypot: real people never see or fill this field.
  website: z.string().max(0).optional(),
});

export type OrderInput = z.input<typeof orderInputSchema>;
