import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { runMaintenance } from "@/server/maintenance";
import "@/server/orders";

export const maxDuration = 60;

function authorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  const header = req.headers.get("authorization") ?? "";
  if (!secret || secret.length < 32) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const got = Buffer.from(header);
  return got.length === expected.length && timingSafeEqual(got, expected);
}

// Vercel Cron (vercel.json) or any scheduler calls this every minute with the secret.
export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const result = await runMaintenance(db);
  return NextResponse.json({ ok: true, ...result });
}
