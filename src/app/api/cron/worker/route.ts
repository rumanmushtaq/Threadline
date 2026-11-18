import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { runMaintenance } from "@/server/maintenance";
import "@/server/orders";

// Image generation can take a few minutes per product. Vercel Pro allows 300 s;
// on smaller plans run `pnpm worker` or an external cron instead (see README).
export const maxDuration = 300;

function authorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  const header = req.headers.get("authorization") ?? "";
  if (!secret || secret.length < 32) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const got = Buffer.from(header);
  return got.length === expected.length && timingSafeEqual(got, expected);
}

// Vercel Cron (vercel.json, daily) or any scheduler (every minute is best) calls this with the secret.
export async function GET(req: Request) {
  const startedAt = Date.now();
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Leave 10 s of the function limit for the response.
  const result = await runMaintenance(db, { mustFinishBy: startedAt + (maxDuration - 10) * 1000 });
  return NextResponse.json({ ok: true, ...result });
}
