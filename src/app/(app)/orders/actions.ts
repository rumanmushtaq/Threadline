"use server";

import { revalidatePath } from "next/cache";
import { parseOrThrow, runAction } from "@/server/action";
import { requirePermission } from "@/server/auth/current";
import { db } from "@/server/db";
import { transitionOrder, transitionSchema } from "@/server/orders";

export async function transitionOrderAction(input: unknown) {
  return runAction(async () => {
    const user = await requirePermission("order.manage");
    const data = parseOrThrow(transitionSchema, input);
    const res = await transitionOrder(db, user.id, data);
    revalidatePath(`/orders/${data.id}`);
    revalidatePath("/orders");
    revalidatePath("/inventory");
    return res;
  });
}
