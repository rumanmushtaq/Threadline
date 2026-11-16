"use server";

import { revalidatePath } from "next/cache";
import { parseOrThrow, runAction } from "@/server/action";
import { requirePermission } from "@/server/auth/current";
import { db } from "@/server/db";
import {
  createStaffUser,
  createUserSchema,
  resetPasswordSchema,
  resetUserPassword,
  setUserActive,
  updateUser,
  updateUserSchema,
} from "@/server/users";
import { z } from "zod";

export async function createUserAction(input: unknown) {
  return runAction(async () => {
    const actor = await requirePermission("user.manage");
    const data = parseOrThrow(createUserSchema, input);
    const user = await createStaffUser(db, actor.id, data);
    revalidatePath("/users");
    return { slot: user.slot };
  });
}

export async function updateUserAction(input: unknown) {
  return runAction(async () => {
    const actor = await requirePermission("user.manage");
    await updateUser(db, actor.id, parseOrThrow(updateUserSchema, input));
    revalidatePath("/users");
    return null;
  });
}

export async function resetPasswordAction(input: unknown) {
  return runAction(async () => {
    const actor = await requirePermission("user.manage");
    await resetUserPassword(db, actor.id, parseOrThrow(resetPasswordSchema, input));
    return null;
  });
}

export async function setActiveAction(input: unknown) {
  return runAction(async () => {
    const actor = await requirePermission("user.manage");
    const { id, isActive } = parseOrThrow(z.object({ id: z.uuid(), isActive: z.boolean() }), input);
    await setUserActive(db, actor.id, id, isActive);
    revalidatePath("/users");
    return null;
  });
}
