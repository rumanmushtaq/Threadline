import { z } from "zod";

export const LOGO_CORNERS = ["bottom-right", "bottom-left", "top-right", "top-left"] as const;

// Client-safe: imported by the settings form as well as the server.
export const settingsSchema = z.object({
  brandName: z.string().trim().min(1, "Enter a brand name").max(60),
  brandTagline: z.string().trim().max(120).nullable(),
  currencySymbol: z.string().trim().min(1).max(6),
  lowStockThreshold: z.number().int().min(0).max(10_000),
  reservationPolicy: z.enum(["on_order", "on_confirm"]),
  pendingOrderExpiryHours: z.number().int().min(0).max(24 * 60),
  autoPublishProducts: z.boolean(),
  maxOrderQuantity: z.number().int().min(1).max(1000),
  photoLogo: z.boolean(),
  photoLogoCorner: z.enum(LOGO_CORNERS),
});
