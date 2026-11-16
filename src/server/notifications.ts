import { and, desc, eq, isNull, sql } from "drizzle-orm";
import type { Executor } from "./db";
import { notifications, users } from "./db/schema";

type NotificationInput = { type: string; title: string; body?: string; href?: string };

export async function notifyUser(tx: Executor, userId: string, n: NotificationInput) {
  await tx.insert(notifications).values({ userId, ...n });
}

/** Notifies every active account (or only admins). */
export async function notifyStaff(tx: Executor, n: NotificationInput, opts: { adminsOnly?: boolean } = {}) {
  const recipients = await tx
    .select({ id: users.id })
    .from(users)
    .where(opts.adminsOnly ? and(eq(users.isActive, true), eq(users.role, "admin")) : eq(users.isActive, true));
  if (recipients.length) await tx.insert(notifications).values(recipients.map((r) => ({ userId: r.id, ...n })));
}

export async function listNotifications(db: Executor, userId: string) {
  const items = await db
    .select({
      id: notifications.id,
      type: notifications.type,
      title: notifications.title,
      body: notifications.body,
      href: notifications.href,
      readAt: notifications.readAt,
      createdAt: notifications.createdAt,
    })
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(20);
  const [{ unread }] = await db
    .select({ unread: sql<number>`count(*)::int` })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return { items, unread };
}

export async function markAllRead(db: Executor, userId: string) {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
}
