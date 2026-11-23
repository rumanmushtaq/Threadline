import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { can } from "@/server/auth/permissions";
import { moneyInRange } from "@/server/dashboard";
import { businessToday, resolveRange } from "@/server/date-range";
import { activityLogs, expenseCategories, expenses } from "@/server/db/schema";
import { addExpense, addExpenseCategory, cancelExpense, expenseTotals, listExpenseCategories, listExpenses } from "@/server/expenses";
import { db, resetDb, seedUsers, testDb } from "./helpers";

let ids: { adminId: string; staffId: string };
let fuel: string;
let rent: string;
beforeEach(async () => {
  await resetDb();
  ids = await seedUsers();
  const cats = new Map((await listExpenseCategories(db)).map((c) => [c.name, c.id]));
  fuel = cats.get("Fuel")!;
  rent = cats.get("Rent")!;
});
afterAll(() => testDb.close());

const allTime = resolveRange({ range: "all_time" });
const exp = (over: Record<string, unknown> = {}) => ({ categoryId: fuel, amount: 1500, spentOn: businessToday(), paymentMethod: "cash", paidTo: "PSO", note: "delivery run", ...over });

describe("expenses", () => {
  it("come with ready-made categories like Fuel and Rent", async () => {
    const names = (await listExpenseCategories(db)).map((c) => c.name);
    expect(names).toEqual(expect.arrayContaining(["Fuel", "Rent", "Packaging", "Delivery & courier", "Other"]));
  });

  it("are saved, numbered, logged and counted in net profit", async () => {
    const a = await addExpense(db, ids.adminId, exp());
    expect(a).toMatchObject({ expenseNumber: "EXP-000001", category: "Fuel" });
    await addExpense(db, ids.adminId, exp({ categoryId: rent, amount: 20000, paymentMethod: "bank", paidTo: "", note: "" }));
    const [row] = await db.select().from(expenses).where(eq(expenses.id, a.id));
    expect(row).toMatchObject({ amountMinor: 150_000, paidTo: "PSO", paymentMethod: "cash", recordedBy: ids.adminId });

    const t = await expenseTotals(db, allTime);
    expect(t).toMatchObject({ total: 2_150_000, count: 2 });
    expect(t.byCategory.map((c) => c.category)).toEqual(["Rent", "Fuel"]); // biggest first
    const m = await moneyInRange(db, allTime);
    expect(m).toMatchObject({ expenses: 2_150_000, expenseCount: 2, netProfit: -2_150_000 });
    expect(await db.select().from(activityLogs).where(eq(activityLogs.action, "expense.added"))).toHaveLength(2);
  });

  it("land on their own day and only count inside the chosen dates", async () => {
    await addExpense(db, ids.adminId, exp({ spentOn: "2026-02-10" }));
    const [row] = await db.select().from(expenses);
    expect(row.spentAt.toISOString()).toBe("2026-02-10T07:00:00.000Z"); // midday in Karachi
    expect((await expenseTotals(db, resolveRange({ range: "custom", from: "2026-02-10", to: "2026-02-10" }))).total).toBe(150_000);
    expect((await expenseTotals(db, resolveRange({ range: "custom", from: "2026-02-11", to: "2026-02-28" }))).total).toBe(0);
  });

  it("stop counting when cancelled, but stay in the list", async () => {
    const a = await addExpense(db, ids.adminId, exp());
    await cancelExpense(db, ids.adminId, a.id);
    expect((await expenseTotals(db, allTime)).total).toBe(0);
    expect((await moneyInRange(db, allTime)).expenses).toBe(0);
    expect((await listExpenses(db, allTime))[0]).toMatchObject({ number: "EXP-000001", cancelled: true });
    await expect(cancelExpense(db, ids.adminId, a.id)).rejects.toThrow(/already cancelled/);
  });

  it("can be filtered by category", async () => {
    await addExpense(db, ids.adminId, exp());
    await addExpense(db, ids.adminId, exp({ categoryId: rent, amount: 5000 }));
    expect((await listExpenses(db, allTime, rent)).map((r) => r.category)).toEqual(["Rent"]);
  });

  it("refuse bad input and change nothing", async () => {
    for (const bad of [{ amount: 0 }, { amount: -5 }, { amount: 10.555 }, { spentOn: "2999-01-01" }, { categoryId: "nope" }, { paymentMethod: "cheque" }, { note: "x".repeat(201) }]) {
      await expect(addExpense(db, ids.adminId, exp(bad))).rejects.toThrow();
    }
    await expect(addExpense(db, ids.adminId, exp({ categoryId: "00000000-0000-4000-8000-000000000000" }))).rejects.toThrow(/no longer exists/);
    expect(await db.select().from(expenses)).toHaveLength(0);
  });

  it("allow new categories, once per name", async () => {
    const c = await addExpenseCategory(db, ids.adminId, { name: "Stitching" });
    try {
      await addExpense(db, ids.adminId, exp({ categoryId: c.id }));
      await expect(addExpenseCategory(db, ids.adminId, { name: "Stitching" })).rejects.toThrow(/already exists/);
      await expect(addExpenseCategory(db, ids.adminId, { name: "x" })).rejects.toThrow();
    } finally {
      await db.delete(expenses);
      await db.delete(expenseCategories).where(eq(expenseCategories.id, c.id));
    }
  });

  it("are for the admin only", () => {
    for (const p of ["expense.view", "expense.record", "expense.cancel"] as const) {
      expect(can("admin", p)).toBe(true);
      expect(can("staff", p)).toBe(false);
    }
  });
});
