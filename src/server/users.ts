import type { AdminUserAttributes, AuthError, SupabaseClient } from "@supabase/supabase-js";
import { and, asc, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { logActivity } from "./activity";
import { verifyPassword } from "./auth/login";
import { currentSessionId, revokeSessions } from "./auth/session";
import type { Database } from "./db";
import { users } from "./db/schema";
import { AppError, pgCode, pgConstraint } from "./errors";
import { supabaseAdmin } from "./supabase/clients";

export const MAX_ACCOUNTS = 4;
export const PASSWORD_MIN = 10;
/** Long enough that a ban never runs out in practice (Supabase has no "ban forever"). */
const BAN_FOREVER = "876000h";

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN, `Use at least ${PASSWORD_MIN} characters`)
  .max(72, "Use at most 72 characters")
  .regex(/[A-Za-z]/, "Include a letter")
  .regex(/\d/, "Include a number");

const email = z.email("Enter a valid email").max(254).transform((v) => v.trim().toLowerCase());

export const createUserSchema = z.object({
  name: z.string().trim().min(2, "Enter a name").max(80),
  email,
  password: passwordSchema,
});

export const updateUserSchema = z.object({
  id: z.uuid(),
  name: z.string().trim().min(2, "Enter a name").max(80),
  email,
});

export const resetPasswordSchema = z.object({ id: z.uuid(), password: passwordSchema });

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

const FULL = "All four accounts are already in use.";
const EMAIL_TAKEN = () => new AppError("This email is already used by another account.", "CONFLICT", { email: ["Already in use"] });

function mapUniqueError(err: unknown): never {
  if (pgCode(err) === "23505") {
    if (pgConstraint(err) === "users_slot_unique") throw new AppError(FULL, "CONFLICT");
    throw EMAIL_TAKEN();
  }
  if (pgCode(err) === "23514") throw new AppError(FULL, "CONFLICT");
  throw err;
}

/** Supabase account errors that the admin can fix in the form. */
function authError(error: AuthError): never {
  if (error.code === "weak_password") {
    throw new AppError("Supabase rejected this password as too weak.", "VALIDATION", { password: [error.message] });
  }
  if (error.code === "email_exists") throw EMAIL_TAKEN();
  throw new Error(`Supabase Auth: ${error.code ?? error.status} ${error.message}`);
}

/**
 * Creates the Supabase Auth user behind a team account. A team user this app made earlier
 * that never got its account row (a failed attempt) has no access, so it is replaced.
 * Any other Supabase user with the email (a shopper) is never touched.
 */
async function createAuthUser(db: Database, input: { id?: string; name: string; email: string; password: string }) {
  const admin = supabaseAdmin();
  // app_metadata can only be set with the secret key: it marks users this app made for the team.
  const attrs = {
    id: input.id,
    email: input.email,
    password: input.password,
    email_confirm: true,
    user_metadata: { name: input.name },
    app_metadata: { threadline: "team" },
  };
  let { data, error } = await admin.createUser(attrs);
  if (error?.code === "email_exists") {
    const orphan = await db.execute<{ id: string }>(sql`
      SELECT a.id FROM auth.users a
       WHERE lower(a.email) = lower(${input.email})
         AND a.raw_app_meta_data->>'threadline' = 'team'
         AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = a.id)`);
    const id = orphan.rows[0]?.id;
    if (!id) throw EMAIL_TAKEN();
    const removed = await admin.deleteUser(id);
    if (removed.error) authError(removed.error);
    ({ data, error } = await admin.createUser(attrs));
  }
  if (error || !data.user) return authError(error!);
  return data.user.id;
}

async function deleteAuthUser(id: string) {
  const { error } = await supabaseAdmin().deleteUser(id);
  if (error) console.error(`[auth] could not remove Supabase user ${id} after a failed account creation`, error.message);
}

/**
 * Creates a staff account in the first free slot (2-4): first the Supabase Auth user,
 * then the account row. The database constraint on slots is the hard limit; if the row
 * cannot be added, the Supabase user is removed again.
 */
export async function createStaffUser(db: Database, actorId: string, input: z.infer<typeof createUserSchema>) {
  // Friendly early answers, so Supabase is not touched when the result is already known.
  const existing = await db.select({ slot: users.slot, email: users.email }).from(users);
  if (existing.length >= MAX_ACCOUNTS) throw new AppError(FULL, "CONFLICT");
  if (existing.some((u) => u.email.toLowerCase() === input.email.toLowerCase())) throw EMAIL_TAKEN();

  const id = await createAuthUser(db, input);
  try {
    return await db.transaction(async (tx) => {
      // Blocks concurrent account creation so two admins' requests cannot pick the same slot.
      await tx.execute(sql`LOCK TABLE users IN SHARE ROW EXCLUSIVE MODE`);
      const taken = await tx.select({ slot: users.slot }).from(users);
      const used = new Set(taken.map((r) => r.slot));
      const slot = [2, 3, 4].find((s) => !used.has(s));
      if (!slot) throw new AppError(FULL, "CONFLICT");

      const [user] = await tx
        .insert(users)
        .values({ id, slot, role: "staff", name: input.name, email: input.email })
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
    await deleteAuthUser(id);
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
      // Last step: if Supabase refuses (e.g. the email belongs to another Supabase user), nothing changes here either.
      const { error } = await supabaseAdmin().updateUserById(input.id, {
        email: input.email,
        email_confirm: true,
        user_metadata: { name: input.name },
      });
      if (error) authError(error);
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

/** Deactivating bans the Supabase user (no new sign-ins or token refreshes) and ends every session. */
export async function setUserActive(db: Database, actorId: string, id: string, isActive: boolean) {
  if (id === actorId) throw new AppError("You cannot deactivate your own account.", "VALIDATION");
  const [target] = await db.select({ role: users.role }).from(users).where(eq(users.id, id));
  if (!target || target.role === "admin") throw new AppError("Account not found.", "NOT_FOUND");

  const admin = supabaseAdmin();
  const { error } = await admin.updateUserById(id, { ban_duration: isActive ? "none" : BAN_FOREVER });
  if (error) authError(error);
  try {
    await db.transaction(async (tx) => {
      await tx.update(users).set({ isActive }).where(and(eq(users.id, id), ne(users.role, "admin")));
      if (!isActive) await revokeSessions(tx, id);
      await logActivity(tx, {
        userId: actorId,
        action: isActive ? "user.activated" : "user.deactivated",
        entityType: "user",
        entityId: id,
      });
    });
  } catch (err) {
    // Put Supabase back the way it was so the two never disagree.
    await admin.updateUserById(id, { ban_duration: isActive ? BAN_FOREVER : "none" });
    throw err;
  }
}

/**
 * Sets a password in Supabase Auth. An account made before Supabase Auth was added has no
 * Supabase user yet; it gets one with the same id, so its history stays attached.
 */
async function setAuthPassword(db: Database, account: { id: string; name: string; email: string }, password: string, extra: AdminUserAttributes = {}) {
  const { error } = await supabaseAdmin().updateUserById(account.id, { password, ...extra });
  if (error?.code === "user_not_found") return void (await createAuthUser(db, { ...account, password }));
  if (error) authError(error);
}

/** Admin sets a new password; the person is signed out everywhere. */
export async function resetUserPassword(db: Database, actorId: string, input: z.infer<typeof resetPasswordSchema>) {
  const [target] = await db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(eq(users.id, input.id));
  if (!target) throw new AppError("Account not found.", "NOT_FOUND");
  await setAuthPassword(db, target, input.password);
  await db.transaction(async (tx) => {
    await revokeSessions(tx, input.id);
    await logActivity(tx, { userId: actorId, action: "user.password_reset", entityType: "user", entityId: input.id });
  });
}

/** Seed: create or update the single admin in slot 1, in Supabase Auth and here. */
export async function upsertAdmin(db: Database, input: { name: string; email: string; password: string }) {
  const email = input.email.trim().toLowerCase();
  const [current] = await db.select({ id: users.id }).from(users).where(eq(users.slot, 1));
  if (current) {
    await setAuthPassword(db, { id: current.id, name: input.name, email }, input.password, {
      email,
      email_confirm: true,
      ban_duration: "none",
      user_metadata: { name: input.name },
    });
    await db.update(users).set({ name: input.name, email, isActive: true }).where(eq(users.id, current.id));
    return { id: current.id };
  }
  const id = await createAuthUser(db, { name: input.name, email, password: input.password });
  try {
    await db.insert(users).values({ id, slot: 1, role: "admin", name: input.name, email });
  } catch (err) {
    await deleteAuthUser(id);
    mapUniqueError(err);
  }
  return { id };
}

export async function countUsers(db: Database) {
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(users);
  return r.n;
}

export const changeOwnPasswordSchema = z.object({ current: z.string().min(1, "Enter your current password"), password: passwordSchema });

/** Changes the signed-in person's password and signs out their other devices (this one stays signed in). */
export async function changeOwnPassword(
  db: Database,
  supabase: SupabaseClient,
  user: { id: string; email: string },
  input: z.infer<typeof changeOwnPasswordSchema>,
  ip: string,
) {
  await verifyPassword(db, user.email, input.current, ip);
  await setOwnPassword(db, supabase, user.id, input.password, "user.password_changed");
}

/**
 * Sets a new password for the signed-in person (also used after a reset-by-email link).
 * Supabase ends every session of the user when an admin call changes the password, so
 * this browser is signed straight back in with the new password; other devices stay out.
 */
export async function setOwnPassword(
  db: Database,
  supabase: SupabaseClient,
  userId: string,
  password: string,
  action: "user.password_changed" | "user.password_recovered",
) {
  const [account] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId));
  if (!account) throw new AppError("Account not found.", "NOT_FOUND");
  const { error } = await supabaseAdmin().updateUserById(userId, { password });
  if (error) authError(error);
  const signedIn = await supabase.auth.signInWithPassword({ email: account.email, password });
  if (signedIn.error) console.error("[auth] could not sign back in after a password change", signedIn.error.message);
  const keep = await currentSessionId(supabase);
  await db.transaction(async (tx) => {
    await revokeSessions(tx, userId, keep);
    await logActivity(tx, { userId, action, entityType: "user", entityId: userId });
  });
}
