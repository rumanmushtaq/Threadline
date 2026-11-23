import { z } from "zod";

// Shared by the "Add expense" form (client) and the server.
export const PAYMENT_METHODS = ["cash", "bank", "jazzcash", "easypaisa", "card", "other"] as const;
export const PAYMENT_LABEL: Record<(typeof PAYMENT_METHODS)[number], string> = {
  cash: "Cash",
  bank: "Bank transfer",
  jazzcash: "JazzCash",
  easypaisa: "Easypaisa",
  card: "Card",
  other: "Other",
};

export const expenseInputSchema = z.object({
  categoryId: z.uuid({ error: "Choose a category" }),
  amount: z
    .number({ error: "Enter the amount" })
    .finite()
    .positive("Amount must be above 0")
    .max(10_000_000, "That amount is too high")
    .refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, "Use at most 2 decimals"),
  spentOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick the date"),
  paymentMethod: z.enum(PAYMENT_METHODS),
  paidTo: z.string().trim().max(80, "Keep it under 80 characters").optional(),
  note: z.string().trim().max(200, "Keep the note under 200 characters").optional(),
});
export type ExpenseInput = z.infer<typeof expenseInputSchema>;

export const expenseCategorySchema = z.object({
  name: z.string().trim().min(2, "Enter a name").max(40, "Keep it under 40 characters"),
});
