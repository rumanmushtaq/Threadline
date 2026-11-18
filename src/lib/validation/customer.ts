import { z } from "zod";
import { phoneSchema } from "./order";

/** A shopper's saved delivery details (also checked again on the server). */
export const customerDetailsSchema = z.object({
  name: z.string().trim().min(2, "Enter your name").max(80),
  phone: phoneSchema,
  whatsapp: z.union([z.literal(""), phoneSchema]).optional().transform((v) => v || null),
  address: z.string().trim().min(10, "Enter your full delivery address").max(300),
  city: z.string().trim().min(2, "Enter your city").max(60),
});
