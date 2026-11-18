import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { MAILPIT_URL } from "../scripts/local-supabase";
import { login } from "@/server/auth/login";
import { can, permissionsFor } from "@/server/auth/permissions";
import { requestPasswordReset } from "@/server/auth/recovery";
import { resolveSession } from "@/server/auth/session";
import { rateLimitEvents, users } from "@/server/db/schema";
import { pgConstraint } from "@/server/errors";
import { supabaseAdmin } from "@/server/supabase/clients";
import { changeOwnPassword, createStaffUser, resetUserPassword, setOwnPassword, setUserActive, updateUser } from "@/server/users";
import { browser, copyOf, db, forgedCopyOf, resetDb, seedUsers, testDb } from "./helpers";

const meta = { ip: "10.0.0.1", userAgent: "vitest" };
const STAFF = { email: "staff1@test.local", password: "staff-pass-123" };

beforeEach(resetDb);
afterAll(() => testDb.close());

async function signedIn(who = STAFF, ip = meta.ip) {
  const b = browser();
  await login(db, b.supabase, who, { ip });
  return b;
}

const whoIs = async (b: ReturnType<typeof browser>) => (await resolveSession(db, b.supabase))?.user.email ?? null;

async function countAuthUsers() {
  const res = await db.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM auth.users`);
  return res.rows[0].n;
}

describe("four-account limit", () => {
  it("allows admin + three staff, then refuses a fifth account", async () => {
    const { adminId } = await seedUsers();
    await createStaffUser(db, adminId, { name: "Two", email: "s2@test.local", password: "password-123" });
    await createStaffUser(db, adminId, { name: "Three", email: "s3@test.local", password: "password-123" });
    await expect(
      createStaffUser(db, adminId, { name: "Four", email: "s4@test.local", password: "password-123" }),
    ).rejects.toThrow(/four accounts/);
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(users);
    expect(n).toBe(4);
    expect(await countAuthUsers()).toBe(4);
  });

  it("enforces the limit in the database even when the app is bypassed", async () => {
    await seedUsers();
    const admin = supabaseAdmin();
    const raw = async (slot: number, role: "admin" | "staff", email: string) => {
      const { data } = await admin.createUser({ email, password: "password-123", email_confirm: true });
      return db.insert(users).values({ id: data.user!.id, slot, role, name: "X", email });
    };
    await expect(raw(5, "staff", "a@x.y")).rejects.toThrow();
    await expect(raw(2, "staff", "b@x.y")).rejects.toThrow(); // slot taken
    await expect(raw(3, "admin", "c@x.y")).rejects.toThrow(); // only slot 1 can be admin
    await expect(raw(1, "staff", "d@x.y")).rejects.toThrow();
  });

  it("every account row must belong to a Supabase Auth user", async () => {
    const err = await db
      .insert(users)
      .values({ id: crypto.randomUUID(), slot: 2, role: "staff", name: "Ghost", email: "ghost@x.y" })
      .catch((e: unknown) => e);
    expect(pgConstraint(err)).toBe("users_auth_user_fk");
  });

  it("refuses duplicate emails case-insensitively", async () => {
    const { adminId } = await seedUsers();
    await expect(
      createStaffUser(db, adminId, { name: "Dup", email: "STAFF1@test.local", password: "password-123" }),
    ).rejects.toThrow(/already used/);
  });

  it("two admins racing for the last slot: one wins, the loser's Supabase user is removed", async () => {
    const { adminId } = await seedUsers();
    await createStaffUser(db, adminId, { name: "Two", email: "s2@test.local", password: "password-123" });
    const results = await Promise.allSettled([
      createStaffUser(db, adminId, { name: "A", email: "a@test.local", password: "password-123" }),
      createStaffUser(db, adminId, { name: "B", email: "b@test.local", password: "password-123" }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await countAuthUsers()).toBe(4);
  });

  it("replaces a leftover team user from a failed attempt", async () => {
    const { adminId } = await seedUsers();
    // Left behind by an earlier failed team-account creation (marked by this app).
    await supabaseAdmin().createUser({ email: "left@test.local", password: "old-pass-123", email_confirm: true, app_metadata: { threadline: "team" } });
    await createStaffUser(db, adminId, { name: "Left", email: "left@test.local", password: "new-pass-123" });
    await expect(signedIn({ email: "left@test.local", password: "new-pass-123" })).resolves.toBeTruthy();
  });
});

describe("login and sessions (Supabase Auth)", () => {
  it("signs in with correct credentials and the session is verified with Supabase", async () => {
    await seedUsers();
    const b = await signedIn();
    expect([...b.jar.keys()].some((k) => k.startsWith("sb-"))).toBe(true);
    expect(await whoIs(b)).toBe("staff1@test.local");
    expect((await resolveSession(db, b.supabase))?.user.role).toBe("staff");
    expect(await whoIs(browser())).toBeNull();
  });

  it("a forged cookie is not a session", async () => {
    const { adminId } = await seedUsers();
    const b = await signedIn();
    // Rewrite the session to claim to be the admin: the signature no longer matches.
    expect(await whoIs(forgedCopyOf(b, adminId))).toBeNull();
    expect(await whoIs(forgedCopyOf(b, crypto.randomUUID()))).toBeNull();
  });

  it("rejects a wrong password and locks after five failures", async () => {
    await seedUsers();
    for (let i = 0; i < 5; i++) {
      await expect(login(db, browser().supabase, { ...STAFF, password: "nope" }, meta)).rejects.toThrow(/incorrect/);
    }
    await expect(login(db, browser().supabase, STAFF, meta)).rejects.toThrow(/Too many/);
  });

  it("signing out ends the session on the server, not just in this browser", async () => {
    await seedUsers();
    const b = await signedIn();
    const stolen = copyOf(b);
    await b.supabase.auth.signOut({ scope: "local" });
    expect(await whoIs(b)).toBeNull();
    expect(await whoIs(stolen)).toBeNull();
  });

  it("deactivation ends sessions, blocks login, and reactivation restores it", async () => {
    const { adminId, staffId } = await seedUsers();
    const b = await signedIn();
    await setUserActive(db, adminId, staffId, false);
    expect(await whoIs(b)).toBeNull();
    await expect(b.supabase.auth.refreshSession()).resolves.toMatchObject({ data: { session: null } });
    await expect(login(db, browser().supabase, STAFF, meta)).rejects.toThrow(/incorrect/);

    await setUserActive(db, adminId, staffId, true);
    expect(await whoIs(await signedIn())).toBe("staff1@test.local");
  });

  it("a Supabase user without a Threadline account cannot get in", async () => {
    await seedUsers();
    await supabaseAdmin().createUser({ email: "outsider@test.local", password: "outsider-123", email_confirm: true });
    const b = browser();
    await expect(login(db, b.supabase, { email: "outsider@test.local", password: "outsider-123" }, meta)).rejects.toThrow(/incorrect/);
    expect(b.jar.size).toBe(0);
    // Even a valid Supabase session gives no access without an account here.
    const direct = browser();
    await direct.supabase.auth.signInWithPassword({ email: "outsider@test.local", password: "outsider-123" });
    expect(await whoIs(direct)).toBeNull();
  });

  it("admin cannot deactivate themselves", async () => {
    const { adminId } = await seedUsers();
    await expect(setUserActive(db, adminId, adminId, false)).rejects.toThrow(/own account/);
  });
});

describe("passwords", () => {
  it("admin password reset signs the person out everywhere", async () => {
    const { adminId, staffId } = await seedUsers();
    const b = await signedIn();
    await resetUserPassword(db, adminId, { id: staffId, password: "brand-new-123" });
    expect(await whoIs(b)).toBeNull();
    await expect(login(db, browser().supabase, STAFF, meta)).rejects.toThrow(/incorrect/);
    expect(await whoIs(await signedIn({ ...STAFF, password: "brand-new-123" }, "10.0.0.2"))).toBe("staff1@test.local");
  });

  it("changing your own password keeps this device and signs out the others", async () => {
    const { staffId } = await seedUsers();
    const phone = await signedIn(STAFF, "10.0.0.5");
    const laptop = await signedIn();
    const user = { id: staffId, email: STAFF.email };
    await expect(
      changeOwnPassword(db, laptop.supabase, user, { current: "wrong-pass-1", password: "changed-pass-123" }, meta.ip),
    ).rejects.toThrow(/current password is incorrect/);
    await changeOwnPassword(db, laptop.supabase, user, { current: STAFF.password, password: "changed-pass-123" }, meta.ip);
    expect(await whoIs(laptop)).toBe("staff1@test.local");
    expect(await whoIs(phone)).toBeNull();
    expect(await whoIs(await signedIn({ ...STAFF, password: "changed-pass-123" }))).toBe("staff1@test.local");
  });

  it("an email change is applied in Supabase Auth too", async () => {
    const { adminId, staffId } = await seedUsers();
    await updateUser(db, adminId, { id: staffId, name: "Staff One", email: "renamed@test.local" });
    expect(await whoIs(await signedIn({ email: "renamed@test.local", password: STAFF.password }))).toBe("renamed@test.local");
  });

  it("forgot password: the email link signs this browser in and a new password can be set", async () => {
    const { staffId } = await seedUsers();
    await fetch(`${MAILPIT_URL}/api/v1/messages`, { method: "DELETE" });
    const b = browser();
    const appUrl = "http://localhost:3300";
    await requestPasswordReset(db, b.supabase, STAFF.email, { ip: meta.ip, appUrl });
    await requestPasswordReset(db, browser().supabase, "nobody@test.local", { ip: meta.ip, appUrl });

    const inbox = (await (await fetch(`${MAILPIT_URL}/api/v1/messages`)).json()) as { messages: { ID: string; To: { Address: string }[] }[] };
    expect(inbox.messages.map((m) => m.To[0].Address)).toEqual([STAFF.email]); // nothing sent to unknown emails
    const mail = (await (await fetch(`${MAILPIT_URL}/api/v1/message/${inbox.messages[0].ID}`)).json()) as { Text: string };
    const link = mail.Text.match(/https?:\/\/\S+verify\S+/)![0].replace(/&amp;/g, "&");

    // Supabase checks the token and sends the browser back to the app with a one-time code.
    const res = await fetch(link, { redirect: "manual" });
    const back = new URL(res.headers.get("location")!);
    expect(back.origin + back.pathname).toBe(`${appUrl}/auth/confirm`);
    expect(back.searchParams.get("next")).toBe("/reset-password");
    const { error } = await b.supabase.auth.exchangeCodeForSession(back.searchParams.get("code")!);
    expect(error).toBeNull();
    expect(await whoIs(b)).toBe(STAFF.email);

    await setOwnPassword(db, b.supabase, staffId, "recovered-pass-123", "user.password_recovered");
    expect(await whoIs(await signedIn({ ...STAFF, password: "recovered-pass-123" }))).toBe(STAFF.email);
  });

  it("the recommended token_hash email link works in any browser", async () => {
    await seedUsers();
    const { data } = await supabaseAdmin().generateLink({ type: "recovery", email: STAFF.email });
    const other = browser();
    const { error } = await other.supabase.auth.verifyOtp({ type: "recovery", token_hash: data.properties!.hashed_token });
    expect(error).toBeNull();
    expect(await whoIs(other)).toBe(STAFF.email);
  });

  it("reset emails are rate limited per connection and per email", async () => {
    await seedUsers();
    for (let i = 0; i < 8; i++) {
      await requestPasswordReset(db, browser().supabase, STAFF.email, { ip: "10.7.7.7", appUrl: "http://localhost:3300" });
    }
    for (let i = 0; i < 8; i++) {
      await requestPasswordReset(db, browser().supabase, `x${i}@test.local`, { ip: "10.6.6.6", appUrl: "http://localhost:3300" });
    }
    const uses = await db.select({ key: rateLimitEvents.key }).from(rateLimitEvents);
    const n = (key: string) => uses.filter((u) => u.key === key).length;
    expect(n(`reset:email:${STAFF.email}`)).toBe(3);
    expect(n("reset:ip:10.6.6.6")).toBe(5);
  });
});

describe("permissions", () => {
  it("staff can create products but cannot manage admin areas", () => {
    expect(can("staff", "product.create")).toBe(true);
    expect(can("staff", "inventory.stock_in")).toBe(true);
    for (const p of ["product.edit", "product.archive", "user.manage", "settings.manage", "order.manage", "activity.view", "inventory.adjust"] as const) {
      expect(can("staff", p)).toBe(false);
    }
    expect(permissionsFor("admin").length).toBeGreaterThan(permissionsFor("staff").length);
  });
});

describe("hardening", () => {
  it("parallel password guesses cannot get past the lockout", async () => {
    await seedUsers();
    const tries = await Promise.allSettled(
      Array.from({ length: 30 }, () => login(db, browser().supabase, { ...STAFF, password: "guess" }, meta)),
    );
    const messages = tries.map((t) => (t.status === "rejected" ? (t.reason as Error).message : "ok"));
    expect(messages.filter((m) => /incorrect/.test(m))).toHaveLength(5);
    expect(messages.filter((m) => /Too many/.test(m))).toHaveLength(25);
  });

  it("locks an email after 20 failures from many connections, but not for the owner's known connection", async () => {
    await seedUsers();
    await signedIn(STAFF, "10.8.8.8"); // owner's usual connection
    for (let i = 0; i < 20; i++) {
      await expect(login(db, browser().supabase, { ...STAFF, password: "guess" }, { ip: `10.9.0.${i}` })).rejects.toThrow(/incorrect/);
    }
    await expect(login(db, browser().supabase, STAFF, { ip: "10.9.1.1" })).rejects.toThrow(/Too many/);
    await expect(login(db, browser().supabase, STAFF, { ip: "10.8.8.8" })).resolves.toBeTruthy();
  });

  it("two admins creating accounts at once both get a free slot", async () => {
    const { adminId } = await seedUsers();
    const made = await Promise.all([
      createStaffUser(db, adminId, { name: "A", email: "a@test.local", password: "password-123" }),
      createStaffUser(db, adminId, { name: "B", email: "b@test.local", password: "password-123" }),
    ]);
    expect(made.map((m) => m!.slot).sort()).toEqual([3, 4]);
  });

  it("only allows same-site redirects after login", async () => {
    const { safeNextPath } = await import("@/lib/safe-next");
    expect(safeNextPath("/orders?status=pending")).toBe("/orders?status=pending");
    for (const bad of ["//evil.com", "/\\evil.com", "/\\\\evil.com", "https://evil.com", "javascript:alert(1)", "/ok\\..\\x", "/\t/evil.com", "/\n/evil.com", undefined]) {
      expect(safeNextPath(bad)).toBe("/dashboard");
    }
  });
});
