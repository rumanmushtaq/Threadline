import { and, asc, desc, eq, gte, isNull, lt, sql } from "drizzle-orm";
import { toMinor } from "@/lib/format";
import { expenseCategorySchema, expenseInputSchema } from "@/lib/validation/expense";
import { parseOrThrow } from "./action";
import { logActivity } from "./activity";
import type { Database, Executor } from "./db";
import { expenseCategories, expenses, users } from "./db/schema";
import { businessMidday, businessToday, type ResolvedRange } from "./date-range";
import { AppError, pgCode } from "./errors";

/** Records money spent on running the shop (fuel, rent, packaging...). */
export async function addExpense(db: Database, actorId: string, raw: unknown) {
  const input = parseOrThrow(expenseInputSchema, raw);
  const today = businessToday();
  if (input.spentOn > today) throw new AppError("The date cannot be in the future.", "VALIDATION", { spentOn: ["Pick today or an earlier date"] });

  return db.transaction(async (tx) => {
    const [cat] = await tx.select().from(expenseCategories).where(eq(expenseCategories.id, input.categoryId));
    if (!cat) throw new AppError("That category no longer exists.", "VALIDATION", { categoryId: ["Choose another category"] });
    const [row] = await tx
      .insert(expenses)
      .values({
        categoryId: cat.id,
        amountMinor: toMinor(input.amount),
        // Today's expenses keep the real time; earlier dates get midday so they land on the right day.
        spentAt: input.spentOn === today ? new Date() : businessMidday(input.spentOn),
        paymentMethod: input.paymentMethod,
        paidTo: input.paidTo || null,
        note: input.note || null,
        recordedBy: actorId,
      })
      .returning({ id: expenses.id, expenseNumber: expenses.expenseNumber });
    await logActivity(tx, {
      userId: actorId,
      action: "expense.added",
      entityType: "expense",
      entityId: row.id,
      metadata: { expenseNumber: row.expenseNumber, category: cat.name, amount: toMinor(input.amount) },
    });
    return { ...row, category: cat.name };
  });
}

/** Undoes a mistaken expense: it stays in the list, crossed out, and stops counting. */
export async function cancelExpense(db: Database, actorId: string, id: string) {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(expenses)
      .set({ cancelledAt: new Date(), cancelledBy: actorId })
      .where(and(eq(expenses.id, id), isNull(expenses.cancelledAt)))
      .returning({ id: expenses.id, expenseNumber: expenses.expenseNumber });
    if (!row) throw new AppError("This expense was not found or is already cancelled.", "CONFLICT");
    await logActivity(tx, { userId: actorId, action: "expense.cancelled", entityType: "expense", entityId: row.id, metadata: { expenseNumber: row.expenseNumber } });
    return row;
  });
}

export async function addExpenseCategory(db: Database, actorId: string, raw: unknown) {
  const { name } = parseOrThrow(expenseCategorySchema, raw);
  try {
    const [row] = await db.insert(expenseCategories).values({ name }).returning();
    await logActivity(db, { userId: actorId, action: "expense.category_added", entityType: "expense_category", entityId: row.id, metadata: { name } });
    return row;
  } catch (err) {
    if (pgCode(err) === "23505") throw new AppError("That category already exists.", "CONFLICT", { name: ["Already exists"] });
    throw err;
  }
}

export async function listExpenseCategories(db: Executor) {
  return db.select().from(expenseCategories).where(eq(expenseCategories.isActive, true)).orderBy(asc(expenseCategories.name));
}

const inRange = (range: ResolvedRange) => and(gte(expenses.spentAt, range.from ?? new Date(0)), lt(expenses.spentAt, range.to));

/** Every expense in the dates (cancelled ones too, marked), newest first. */
export async function listExpenses(db: Executor, range: ResolvedRange, categoryId?: string) {
  return db
    .select({
      id: expenses.id,
      number: expenses.expenseNumber,
      spentAt: expenses.spentAt,
      amountMinor: expenses.amountMinor,
      category: expenseCategories.name,
      categoryId: expenses.categoryId,
      paidTo: expenses.paidTo,
      paymentMethod: expenses.paymentMethod,
      note: expenses.note,
      who: users.name,
      cancelled: sql<boolean>`${expenses.cancelledAt} IS NOT NULL`,
    })
    .from(expenses)
    .innerJoin(expenseCategories, eq(expenseCategories.id, expenses.categoryId))
    .leftJoin(users, eq(users.id, expenses.recordedBy))
    .where(and(inRange(range), categoryId ? eq(expenses.categoryId, categoryId) : undefined))
    .orderBy(desc(expenses.spentAt), desc(expenses.expenseNumber))
    .limit(1000);
}

/** Totals for the dates, overall and per category (cancelled expenses never count). */
export async function expenseTotals(db: Executor, range: ResolvedRange) {
  const rows = await db
    .select({ category: expenseCategories.name, categoryId: expenseCategories.id, total: sql<string>`sum(${expenses.amountMinor})`, count: sql<number>`count(*)::int` })
    .from(expenses)
    .innerJoin(expenseCategories, eq(expenseCategories.id, expenses.categoryId))
    .where(and(inRange(range), isNull(expenses.cancelledAt)))
    .groupBy(expenseCategories.id)
    .orderBy(desc(sql`sum(${expenses.amountMinor})`));
  const byCategory = rows.map((r) => ({ category: r.category, categoryId: r.categoryId, total: Number(r.total), count: r.count }));
  return { total: byCategory.reduce((s, r) => s + r.total, 0), count: byCategory.reduce((s, r) => s + r.count, 0), byCategory };
}
