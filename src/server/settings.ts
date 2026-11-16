import { eq } from "drizzle-orm";
import { z } from "zod";
import { logActivity } from "./activity";
import type { Database, Executor } from "./db";
import { categories, settings } from "./db/schema";
import { settingsSchema } from "./settings-schema";

export type AppSettings = typeof settings.$inferSelect;

export async function getSettings(db: Executor): Promise<AppSettings> {
  const [row] = await db.select().from(settings).where(eq(settings.id, 1));
  if (row) return row;
  const [created] = await db.insert(settings).values({ id: 1 }).onConflictDoNothing().returning();
  return created ?? (await db.select().from(settings).where(eq(settings.id, 1)))[0];
}

export { settingsSchema };

export async function updateSettings(db: Database, actorId: string, input: z.infer<typeof settingsSchema>) {
  await db.transaction(async (tx) => {
    await getSettings(tx);
    await tx.update(settings).set(input).where(eq(settings.id, 1));
    await logActivity(tx, { userId: actorId, action: "settings.updated", entityType: "settings", entityId: "1", metadata: input });
  });
}

export const categorySchema = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(2, "Enter a name").max(60),
  isActive: z.boolean().default(true),
});

export async function saveCategory(db: Database, actorId: string, input: z.infer<typeof categorySchema>) {
  const slug = input.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  await db.transaction(async (tx) => {
    if (input.id) {
      await tx.update(categories).set({ name: input.name, slug, isActive: input.isActive }).where(eq(categories.id, input.id));
    } else {
      await tx.insert(categories).values({ name: input.name, slug });
    }
    await logActivity(tx, { userId: actorId, action: input.id ? "category.updated" : "category.created", entityType: "category", entityId: input.id, metadata: { name: input.name } });
  });
}
