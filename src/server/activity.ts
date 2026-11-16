import type { Executor } from "./db";
import { activityLogs } from "./db/schema";

export type ActivityInput = {
  userId: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  ip?: string | null;
};

export async function logActivity(tx: Executor, input: ActivityInput) {
  await tx.insert(activityLogs).values({
    userId: input.userId,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    metadata: input.metadata ?? {},
    ip: input.ip ?? null,
  });
}
