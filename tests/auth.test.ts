import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { login } from "@/server/auth/login";
import { can, permissionsFor } from "@/server/auth/permissions";
import { validateSessionToken } from "@/server/auth/session";
import { users } from "@/server/db/schema";
import { createStaffUser, setUserActive } from "@/server/users";
import { db, resetDb, seedUsers, testDb } from "./helpers";

const meta = { ip: "10.0.0.1", userAgent: "vitest" };

beforeEach(resetDb);
afterAll(() => testDb.close());

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
  });

  it("enforces the limit in the database even when the app is bypassed", async () => {
    await seedUsers();
    const raw = (slot: number, role: "admin" | "staff", email: string) =>
      db.insert(users).values({ slot, role, name: "X", email, passwordHash: "x" });
    await expect(raw(5, "staff", "a@x.y")).rejects.toThrow();
    await expect(raw(2, "staff", "b@x.y")).rejects.toThrow(); // slot taken
    await expect(raw(3, "admin", "c@x.y")).rejects.toThrow(); // only slot 1 can be admin
    await expect(raw(1, "staff", "d@x.y")).rejects.toThrow();
  });

  it("refuses duplicate emails case-insensitively", async () => {
    const { adminId } = await seedUsers();
    await expect(
      createStaffUser(db, adminId, { name: "Dup", email: "STAFF1@test.local", password: "password-123" }),
    ).rejects.toThrow(/already used/);
  });
});

describe("login and sessions", () => {
  it("logs in with correct credentials and validates the session", async () => {
    await seedUsers();
    const { token } = await login(db, { email: "staff1@test.local", password: "staff-pass-123" }, meta);
    const session = await validateSessionToken(db, token);
    expect(session?.user.email).toBe("staff1@test.local");
    expect(session?.user.role).toBe("staff");
    expect(await validateSessionToken(db, token + "x")).toBeNull();
  });

  it("rejects a wrong password and locks after five failures", async () => {
    await seedUsers();
    for (let i = 0; i < 5; i++) {
      await expect(login(db, { email: "staff1@test.local", password: "nope" }, meta)).rejects.toThrow(/incorrect/);
    }
    await expect(
      login(db, { email: "staff1@test.local", password: "staff-pass-123" }, meta),
    ).rejects.toThrow(/Too many/);
  });

  it("deactivation ends sessions and blocks login", async () => {
    const { adminId, staffId } = await seedUsers();
    const { token } = await login(db, { email: "staff1@test.local", password: "staff-pass-123" }, meta);
    await setUserActive(db, adminId, staffId, false);
    expect(await validateSessionToken(db, token)).toBeNull();
    await expect(
      login(db, { email: "staff1@test.local", password: "staff-pass-123" }, meta),
    ).rejects.toThrow(/incorrect/);
  });

  it("admin cannot deactivate themselves", async () => {
    const { adminId } = await seedUsers();
    await expect(setUserActive(db, adminId, adminId, false)).rejects.toThrow(/own account/);
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
      Array.from({ length: 30 }, () => login(db, { email: "staff1@test.local", password: "guess" }, meta)),
    );
    const messages = tries.map((t) => (t.status === "rejected" ? (t.reason as Error).message : "ok"));
    expect(messages.filter((m) => /incorrect/.test(m))).toHaveLength(5);
    expect(messages.filter((m) => /Too many/.test(m))).toHaveLength(25);
  });

  it("locks an email after 20 failures from many connections, but not for the owner's known connection", async () => {
    await seedUsers();
    await login(db, { email: "staff1@test.local", password: "staff-pass-123" }, { ip: "10.8.8.8" }); // owner's usual connection
    for (let i = 0; i < 20; i++) {
      await expect(login(db, { email: "staff1@test.local", password: "guess" }, { ip: `10.9.0.${i}` })).rejects.toThrow(/incorrect/);
    }
    await expect(login(db, { email: "staff1@test.local", password: "staff-pass-123" }, { ip: "10.9.1.1" })).rejects.toThrow(/Too many/);
    await expect(login(db, { email: "staff1@test.local", password: "staff-pass-123" }, { ip: "10.8.8.8" })).resolves.toBeTruthy();
  });

  it("two admins creating accounts at once both get a free slot", async () => {
    const { adminId } = await seedUsers();
    const made = await Promise.all([
      createStaffUser(db, adminId, { name: "A", email: "a@test.local", password: "password-123" }),
      createStaffUser(db, adminId, { name: "B", email: "b@test.local", password: "password-123" }),
    ]);
    expect(made.map((m) => m.slot).sort()).toEqual([3, 4]);
  });

  it("only allows same-site redirects after login", async () => {
    const { safeNextPath } = await import("@/lib/safe-next");
    expect(safeNextPath("/orders?status=pending")).toBe("/orders?status=pending");
    for (const bad of ["//evil.com", "/\\evil.com", "/\\\\evil.com", "https://evil.com", "javascript:alert(1)", "/ok\\..\\x", "/\t/evil.com", "/\n/evil.com", undefined]) {
      expect(safeNextPath(bad)).toBe("/dashboard");
    }
  });
});
