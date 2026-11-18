import type { SupabaseClient, User } from "@supabase/supabase-js";
import { desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { customerDetailsSchema } from "@/lib/validation/customer";
import { reserveAttempt, signInFailed } from "./auth/login";
import type { Database, Executor } from "./db";
import { customerAccounts, loginAttempts, orderItems, orders, users } from "./db/schema";
import { AppError } from "./errors";
import { allowPerHour } from "./rate-limit";
import { supabaseAdmin } from "./supabase/clients";
import { passwordSchema } from "./users";

// Shoppers sign up and sign in on the shop with Google or email + password. They live in
// Supabase Auth like the team, but have a `customer_accounts` row instead of a `users` row,
// so they can never open a staff page, and a team account is never treated as a shopper.

export type CustomerAccount = typeof customerAccounts.$inferSelect;

const email = z.email("Enter a valid email").max(254).transform((v) => v.trim().toLowerCase());

export const customerSignUpSchema = z.object({
  name: z.string().trim().min(2, "Enter your name").max(80),
  email,
  password: passwordSchema,
});

export const customerLoginSchema = z.object({
  email,
  password: z.string().min(1, "Enter your password").max(200),
});

export { customerDetailsSchema };

const SIGNUPS_PER_IP = 5;
const TEAM_ACCOUNT = "This is a team account. Sign in on the team page instead.";

async function isTeamAccount(db: Executor, id: string) {
  const [row] = await db.select({ id: users.id }).from(users).where(eq(users.id, id)).limit(1);
  return !!row;
}

function displayName(user: User) {
  const meta = user.user_metadata as { name?: string; full_name?: string } | undefined;
  return (meta?.full_name || meta?.name || user.email?.split("@")[0] || "Customer").trim().slice(0, 80);
}

/** The shopper's account row, created the first time they arrive signed in (e.g. after Google). */
async function ensureAccount(db: Executor, user: User): Promise<CustomerAccount | null> {
  if (!user.email || (await isTeamAccount(db, user.id))) return null;
  await db
    .insert(customerAccounts)
    .values({ id: user.id, name: displayName(user), email: user.email.toLowerCase() })
    .onConflictDoNothing({ target: customerAccounts.id });
  const [account] = await db.select().from(customerAccounts).where(eq(customerAccounts.id, user.id));
  return account ?? null;
}

/** The signed-in shopper, verified with Supabase Auth; null for visitors and for team accounts. */
export async function resolveCustomer(db: Executor, supabase: SupabaseClient) {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;
  return ensureAccount(db, user);
}

/**
 * Email + password sign-up. With "Confirm email" on in Supabase (recommended) the person
 * gets a link first; Supabase answers the same way for an email that already has an
 * account, so the form never reveals who is registered.
 */
export async function signUpCustomer(
  db: Database,
  supabase: SupabaseClient,
  input: z.infer<typeof customerSignUpSchema>,
  meta: { ip: string; appUrl: string; next: string },
): Promise<"signed_in" | "check_email"> {
  if (!(await allowPerHour(db, `signup:ip:${meta.ip}`, SIGNUPS_PER_IP))) {
    throw new AppError("Too many sign-ups from this connection. Try again in an hour.", "RATE_LIMITED");
  }
  const { data, error } = await supabase.auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      emailRedirectTo: `${meta.appUrl}/auth/confirm?next=${encodeURIComponent(meta.next)}`,
      data: { name: input.name, full_name: input.name },
    },
  });
  if (error) {
    if (error.code === "weak_password") throw new AppError("Choose a stronger password.", "VALIDATION", { password: [error.message] });
    if (error.code === "email_address_invalid") throw new AppError("Use a real email address.", "VALIDATION", { email: ["Not accepted"] });
    if (error.code === "signup_disabled") throw new AppError("Sign-up is closed right now.", "FORBIDDEN");
    console.error("[auth] customer sign-up failed", error.status, error.code, error.message);
    throw new AppError("Sign-up is unavailable right now. Try again in a minute.", "UNAVAILABLE");
  }
  if (data.session && data.user) {
    if (!(await ensureAccount(db, data.user))) {
      await supabase.auth.signOut({ scope: "local" });
      throw new AppError(TEAM_ACCOUNT, "FORBIDDEN");
    }
    return "signed_in";
  }
  return "check_email";
}

/** Email + password sign-in for shoppers, with the same lockout as the team login. */
export async function loginCustomer(
  db: Database,
  supabase: SupabaseClient,
  input: z.infer<typeof customerLoginSchema>,
  meta: { ip: string },
) {
  const attemptId = await reserveAttempt(db, input.email, meta.ip);
  if (attemptId === null) throw new AppError("Too many failed attempts. Try again in 15 minutes.", "RATE_LIMITED");
  const { data, error } = await supabase.auth.signInWithPassword(input);
  if (error?.code === "email_not_confirmed") {
    throw new AppError("Confirm your email first: open the link we sent you.", "UNAUTHENTICATED");
  }
  if (error || !data.user) return signInFailed(db, attemptId, error);
  const account = await ensureAccount(db, data.user);
  if (!account) {
    await supabase.auth.signOut({ scope: "local" });
    throw new AppError(TEAM_ACCOUNT, "FORBIDDEN");
  }
  await db.update(loginAttempts).set({ success: true }).where(eq(loginAttempts.id, attemptId));
  return account;
}

/** Starts "Continue with Google". Returns the Google page to send the browser to. */
export async function googleSignInUrl(supabase: SupabaseClient, meta: { appUrl: string; next: string }) {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${meta.appUrl}/auth/confirm?next=${encodeURIComponent(meta.next)}`,
      skipBrowserRedirect: true,
      queryParams: { prompt: "select_account" },
    },
  });
  if (error || !data.url) {
    console.error("[auth] Google sign-in could not start", error?.code, error?.message);
    throw new AppError("Google sign-in is unavailable right now.", "UNAVAILABLE");
  }
  return data.url;
}

export async function updateCustomerDetails(db: Database, accountId: string, input: z.infer<typeof customerDetailsSchema>) {
  await db.update(customerAccounts).set(input).where(eq(customerAccounts.id, accountId));
}

/** New password for a signed-in shopper; their other devices are signed out, this one stays in. */
export async function setCustomerPassword(supabase: SupabaseClient, account: Pick<CustomerAccount, "id" | "email">, password: string) {
  const { error } = await supabaseAdmin().updateUserById(account.id, { password });
  if (error?.code === "weak_password") throw new AppError("Choose a stronger password.", "VALIDATION", { password: [error.message] });
  if (error) throw new Error(`Supabase Auth: ${error.code ?? error.status} ${error.message}`);
  // Supabase ends every session when the password is set this way; sign this browser back in.
  await supabase.auth.signInWithPassword({ email: account.email, password });
}

/** The shopper's own orders, newest first (only theirs: filtered by their account id). */
export async function listCustomerOrders(db: Executor, accountId: string) {
  const rows = await db
    .select({ id: orders.id, orderNumber: orders.orderNumber, status: orders.status, totalMinor: orders.totalMinor, createdAt: orders.createdAt })
    .from(orders)
    .where(eq(orders.customerAccountId, accountId))
    .orderBy(desc(orders.createdAt))
    .limit(50);
  if (!rows.length) return [];
  const items = await db
    .select({ orderId: orderItems.orderId, productName: orderItems.productName, size: orderItems.size, quantity: orderItems.quantity })
    .from(orderItems)
    .where(inArray(orderItems.orderId, rows.map((r) => r.id)));
  return rows.map(({ id, ...r }) => ({ ...r, items: items.filter((i) => i.orderId === id).map((i) => ({ productName: i.productName, size: i.size, quantity: i.quantity })) }));
}
