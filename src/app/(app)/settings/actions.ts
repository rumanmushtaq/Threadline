"use server";

import { revalidatePath } from "next/cache";
import { parseOrThrow, runAction } from "@/server/action";
import { getCurrentSession, requirePermission } from "@/server/auth/current";
import { db } from "@/server/db";
import { AppError, pgCode } from "@/server/errors";
import { categorySchema, saveCategory, settingsSchema, updateSettings } from "@/server/settings";
import { changeOwnPassword, changeOwnPasswordSchema } from "@/server/users";

export async function changePasswordAction(input: unknown) {
  return runAction(async () => {
    const session = await getCurrentSession();
    if (!session) throw new AppError("Your session has expired. Sign in again.", "UNAUTHENTICATED");
    await changeOwnPassword(db, session.user.id, parseOrThrow(changeOwnPasswordSchema, input), session.sessionId);
    return null;
  });
}

export async function updateSettingsAction(input: unknown) {
  return runAction(async () => {
    const user = await requirePermission("settings.manage");
    await updateSettings(db, user.id, parseOrThrow(settingsSchema, input));
    revalidatePath("/", "layout");
    return null;
  });
}

export async function saveCategoryAction(input: unknown) {
  return runAction(async () => {
    const user = await requirePermission("settings.manage");
    try {
      await saveCategory(db, user.id, parseOrThrow(categorySchema, input));
    } catch (err) {
      if (pgCode(err) === "23505") throw new AppError("A category with this name already exists.", "CONFLICT", { name: ["Already exists"] });
      throw err;
    }
    revalidatePath("/settings");
    return null;
  });
}
