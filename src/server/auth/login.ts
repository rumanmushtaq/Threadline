import { and, count, eq, gt, sql } from "drizzle-orm";
import { z } from "zod";
import { logActivity } from "../activity";
import type { Executor } from "../db";
import { loginAttempts, users } from "../db/schema";
import { AppError } from "../errors";
import { burnPasswordCheck, verifyPassword } from "./password";
import { createSession } from "./session";

export const loginSchema = z.object({
  email: z.email("Enter a valid email").max(254).transform((v) => v.trim().toLowerCase()),
  password: z.string().min(1, "Enter your password").max(200),
});

const MAX_FAILURES = 5;
const WINDOW_MS = 15 * 60 * 1000;

export async function login(
  db: Executor,
  input: z.infer<typeof loginSchema>,
  meta: { ip: string; userAgent?: string | null },
) {
  const since = new Date(Date.now() - WINDOW_MS);
  const [{ failures }] = await db
    .select({ failures: count() })
    .from(loginAttempts)
    .where(
      and(
        eq(loginAttempts.email, input.email),
        eq(loginAttempts.ip, meta.ip),
        eq(loginAttempts.success, false),
        gt(loginAttempts.createdAt, since),
      ),
    );
  if (failures >= MAX_FAILURES) {
    throw new AppError("Too many failed attempts. Try again in 15 minutes.", "RATE_LIMITED");
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(sql`lower(${users.email})`, input.email))
    .limit(1);

  const valid = user ? await verifyPassword(user.passwordHash, input.password) : (await burnPasswordCheck(input.password), false);

  await db.insert(loginAttempts).values({ email: input.email, ip: meta.ip, success: valid && !!user?.isActive });

  if (!user || !valid) throw new AppError("Email or password is incorrect.", "UNAUTHENTICATED");
  if (!user.isActive) throw new AppError("This account is deactivated. Contact the admin.", "FORBIDDEN");

  const session = await createSession(db, user.id, meta);
  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
  await logActivity(db, { userId: user.id, action: "user.login", entityType: "user", entityId: user.id, ip: meta.ip });
  return session;
}
