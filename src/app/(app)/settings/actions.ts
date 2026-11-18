"use server";

import { revalidatePath } from "next/cache";
import { parseOrThrow, runAction } from "@/server/action";
import { getCurrentUser, requestMeta, requirePermission } from "@/server/auth/current";
import { db } from "@/server/db";
import { AppError, pgCode } from "@/server/errors";
import { supabaseServer } from "@/server/supabase/next";
import { categorySchema, saveCategory, settingsSchema, updateSettings } from "@/server/settings";
import { changeOwnPassword, changeOwnPasswordSchema } from "@/server/users";

export async function changePasswordAction(input: unknown) {
  return runAction(async () => {
    const user = await getCurrentUser();
    if (!user) throw new AppError("Your session has expired. Sign in again.", "UNAUTHENTICATED");
    const data = parseOrThrow(changeOwnPasswordSchema, input);
    await changeOwnPassword(db, await supabaseServer(), user, data, (await requestMeta()).ip);
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
