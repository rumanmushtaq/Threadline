import { and, desc, eq, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import type { Executor } from "./db";
import { activityLogs, users } from "./db/schema";

export const activityFiltersSchema = z.object({
  user: z.union([z.uuid(), z.literal("customer")]).optional().catch(undefined),
  entity: z.enum(["product", "order", "user", "settings", "category"]).optional().catch(undefined),
  page: z.coerce.number().int().min(1).optional().catch(1),
});

const PAGE = 40;

export async function listActivity(db: Executor, f: z.infer<typeof activityFiltersSchema>) {
  const where: SQL[] = [];
  if (f.user === "customer") where.push(sql`${activityLogs.userId} IS NULL`);
  else if (f.user) where.push(eq(activityLogs.userId, f.user));
  if (f.entity) where.push(eq(activityLogs.entityType, f.entity));
  const page = f.page ?? 1;
  const rows = await db
    .select({
      id: activityLogs.id,
      action: activityLogs.action,
      entityType: activityLogs.entityType,
      entityId: activityLogs.entityId,
      metadata: activityLogs.metadata,
      ip: activityLogs.ip,
      createdAt: activityLogs.createdAt,
      userName: users.name,
      total: sql<number>`count(*) OVER()::int`,
    })
    .from(activityLogs)
    .leftJoin(users, eq(users.id, activityLogs.userId))
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(activityLogs.id))
    .limit(PAGE)
    .offset((page - 1) * PAGE);
  const total = rows[0]?.total ?? 0;
  return { rows, total, page, pageCount: Math.max(1, Math.ceil(total / PAGE)) };
}
