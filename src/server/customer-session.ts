import "server-only";
import { cache } from "react";
import { resolveCustomer } from "./customer-accounts";
import { db } from "./db";
import { supabaseServer } from "./supabase/next";

/** The signed-in shopper for this request (verified once with Supabase), or null. */
export const getCurrentCustomer = cache(async () => resolveCustomer(db, await supabaseServer()));
