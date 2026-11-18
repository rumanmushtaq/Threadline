"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/server/action";
import { requestMeta } from "@/server/auth/current";
import { getCurrentCustomer } from "@/server/customer-session";
import { db } from "@/server/db";
import { AppError } from "@/server/errors";
import { placeOrder } from "@/server/orders";

export async function placeOrderAction(input: unknown) {
  return runAction(async () => {
    // Orders need a signed-in shopper: the order is linked to their account and they can follow it.
    const account = await getCurrentCustomer();
    if (!account) throw new AppError("Sign in to place your order.", "UNAUTHENTICATED");
    const { ip } = await requestMeta();
    const res = await placeOrder(db, input, { ip, customerAccountId: account.id });
    const slug = (input as { slug?: string })?.slug;
    if (slug) revalidatePath(`/p/${slug}`);
    revalidatePath("/account");
    return res;
  });
}
