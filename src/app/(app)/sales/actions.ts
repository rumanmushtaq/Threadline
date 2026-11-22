"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { parseOrThrow, runAction } from "@/server/action";
import { requirePermission } from "@/server/auth/current";
import { db } from "@/server/db";
import { cancelShopSale, recordShopSale } from "@/server/shop-sales";

function refresh() {
  revalidatePath("/sales");
  revalidatePath("/dashboard");
  revalidatePath("/inventory");
  revalidatePath("/products");
}

export async function recordShopSaleAction(input: unknown) {
  return runAction(async () => {
    const user = await requirePermission("sale.record");
    const res = await recordShopSale(db, user.id, input);
    refresh();
    return res;
  });
}

export async function cancelShopSaleAction(input: unknown) {
  return runAction(async () => {
    const user = await requirePermission("sale.cancel");
    const { id } = parseOrThrow(z.object({ id: z.uuid() }), input);
    const res = await cancelShopSale(db, user.id, id);
    refresh();
    return res;
  });
}
