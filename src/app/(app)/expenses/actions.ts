"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { parseOrThrow, runAction } from "@/server/action";
import { requirePermission } from "@/server/auth/current";
import { db } from "@/server/db";
import { addExpense, addExpenseCategory, cancelExpense } from "@/server/expenses";

function refresh() {
  revalidatePath("/expenses");
  revalidatePath("/dashboard");
  revalidatePath("/sales");
}

export async function addExpenseAction(input: unknown) {
  return runAction(async () => {
    const user = await requirePermission("expense.record");
    const res = await addExpense(db, user.id, input);
    refresh();
    return res;
  });
}

export async function cancelExpenseAction(input: unknown) {
  return runAction(async () => {
    const user = await requirePermission("expense.cancel");
    const { id } = parseOrThrow(z.object({ id: z.uuid() }), input);
    const res = await cancelExpense(db, user.id, id);
    refresh();
    return res;
  });
}

export async function addExpenseCategoryAction(input: unknown) {
  return runAction(async () => {
    const user = await requirePermission("expense.record");
    const res = await addExpenseCategory(db, user.id, input);
    revalidatePath("/expenses");
    return { id: res.id, name: res.name };
  });
}
