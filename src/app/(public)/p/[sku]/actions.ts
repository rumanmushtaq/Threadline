"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/server/action";
import { requestMeta } from "@/server/auth/current";
import { db } from "@/server/db";
import { placeOrder } from "@/server/orders";

export async function placeOrderAction(input: unknown) {
  return runAction(async () => {
    const { ip } = await requestMeta();
    const res = await placeOrder(db, input, { ip });
    const slug = (input as { slug?: string })?.slug;
    if (slug) revalidatePath(`/p/${slug}`);
    return res;
  });
}
