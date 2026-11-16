import { and, asc, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { logActivity } from "./activity";
import { hashPassword, PASSWORD_MIN, verifyPassword } from "./auth/password";
import { deleteUserSessions } from "./auth/session";
import type { Database } from "./db";
import { sessions, users } from "./db/schema";
import { AppError, pgCode, pgConstraint } from "./errors";

export const MAX_ACCOUNTS = 4;

const password = z
  .string()
  .min(PASSWORD_MIN, `Use at least ${PASSWORD_MIN} characters`)
  .max(200)
  .regex(/[A-Za-z]/, "Include a letter")
  .regex(/\d/, "Include a number");

export const createUserSchema = z.object({
  name: z.string().trim().min(2, "Enter a name").max(80),
  email: z.email("Enter a valid email").max(254).transform((v) => v.trim().toLowerCase()),
  password,
});

export const updateUserSchema = z.object({
  id: z.uuid(),
  name: z.string().trim().min(2, "Enter a name").max(80),
  email: z.email("Enter a valid email").max(254).transform((v) => v.trim().toLowerCase()),
});

export const resetPasswordSchema = z.object({ id: z.uuid(), password });

export async function listUsers(db: Database) {
  return db
    .select({
      id: users.id,
      slot: users.slot,
      role: users.role,
      name: users.name,
      email: users.email,
      isActive: users.isActive,
      lastLoginAt: users.lastLoginAt,
      createdAt: users.createdAt,
    })
    .from(users)
    .orderBy(asc(users.slot));
}

function mapUniqueError(err: unknown): never {
  if (pgCode(err) === "23505") {
    if (pgConstraint(err) === "users_slot_unique") {
      throw new AppError("All four accounts are already in use.", "CONFLICT");
    }
    throw new AppError("This email is already used by another account.", "CONFLICT", {
      email: ["Already in use"],
    });
  }
  if (pgCode(err) === "23514") throw new AppError("All four accounts are already in use.", "CONFLICT");
  throw err;
}

/** Creates a staff account in the first free slot (2-4). The DB constraint is the hard limit. */
export async function createStaffUser(db: Database, actorId: string, input: z.infer<typeof createUserSchema>) {
  const passwordHash = await hashPassword(input.password);
  try {
    return await db.transaction(async (tx) => {
      const taken = await tx.select({ slot: users.slot }).from(users).for("update");
      const used = new Set(taken.map((r) => r.slot));
      const slot = [2, 3, 4].find((s) => !used.has(s));
      if (!slot) throw new AppError("All four accounts are already in use.", "CONFLICT");

      const [user] = await tx
        .insert(users)
        .values({ slot, role: "staff", name: input.name, email: input.email, passwordHash })
        .returning({ id: users.id, slot: users.slot });
      await logActivity(tx, {
        userId: actorId,
        action: "user.created",
        entityType: "user",
        entityId: user.id,
        metadata: { slot, email: input.email },
      });
      return user;
    });
  } catch (err) {
    if (err instanceof AppError) throw err;
    mapUniqueError(err);
  }
}

export async function updateUser(db: Database, actorId: string, input: z.infer<typeof updateUserSchema>) {
  try {
    await db.transaction(async (tx) => {
      const [row] = await tx
        .update(users)
        .set({ name: input.name, email: input.email })
        .where(eq(users.id, input.id))
        .returning({ id: users.id });
      if (!row) throw new AppError("Account not found.", "NOT_FOUND");
      await logActivity(tx, {
        userId: actorId,
        action: "user.updated",
        entityType: "user",
        entityId: input.id,
        metadata: { name: input.name, email: input.email },
      });
    });
  } catch (err) {
    if (err instanceof AppError) throw err;
    mapUniqueError(err);
  }
}

export async function setUserActive(db: Database, actorId: string, id: string, isActive: boolean) {
  if (id === actorId) throw new AppError("You cannot deactivate your own account.", "VALIDATION");
  await db.transaction(async (tx) => {
    const [row] = await tx
      .update(users)
      .set({ isActive })
      .where(and(eq(users.id, id), ne(users.role, "admin")))
      .returning({ id: users.id });
    if (!row) throw new AppError("Account not found.", "NOT_FOUND");
    if (!isActive) await deleteUserSessions(tx, id);
    await logActivity(tx, {
      userId: actorId,
      action: isActive ? "user.activated" : "user.deactivated",
      entityType: "user",
      entityId: id,
    });
  });
}

export async function resetUserPassword(db: Database, actorId: string, input: z.infer<typeof resetPasswordSchema>) {
  const passwordHash = await hashPassword(input.password);
  await db.transaction(async (tx) => {
    const [row] = await tx.update(users).set({ passwordHash }).where(eq(users.id, input.id)).returning({ id: users.id });
    if (!row) throw new AppError("Account not found.", "NOT_FOUND");
    await deleteUserSessions(tx, input.id);
    await logActivity(tx, { userId: actorId, action: "user.password_reset", entityType: "user", entityId: input.id });
  });
}

/** Seed: create or update the single admin in slot 1. */
export async function upsertAdmin(db: Database, input: { name: string; email: string; password: string }) {
  const passwordHash = await hashPassword(input.password);
  const email = input.email.trim().toLowerCase();
  const [row] = await db
    .insert(users)
    .values({ slot: 1, role: "admin", name: input.name, email, passwordHash })
    .onConflictDoUpdate({ target: users.slot, set: { name: input.name, email, passwordHash, isActive: true } })
    .returning({ id: users.id });
  return row;
}

export async function countUsers(db: Database) {
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(users);
  return r.n;
}

export const changeOwnPasswordSchema = z.object({ current: z.string().min(1, "Enter your current password"), password });

export async function changeOwnPassword(db: Database, userId: string, input: z.infer<typeof changeOwnPasswordSchema>, keepSessionId?: string) {
  const [user] = await db.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, userId));
  if (!user || !(await verifyPassword(user.passwordHash, input.current))) {
    throw new AppError("Your current password is incorrect.", "VALIDATION", { current: ["Incorrect password"] });
  }
  const passwordHash = await hashPassword(input.password);
  await db.transaction(async (tx) => {
    await tx.update(users).set({ passwordHash }).where(eq(users.id, userId));
    // Sign out other devices, keep this one.
    await tx
      .delete(sessions)
      .where(keepSessionId ? and(eq(sessions.userId, userId), ne(sessions.id, keepSessionId)) : eq(sessions.userId, userId));
    await logActivity(tx, { userId, action: "user.password_changed", entityType: "user", entityId: userId });
  });
}
