import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { supabaseConfig } from "@/server/supabase/clients";

export const dynamic = "force-dynamic";

const REQUIRED = ["DATABASE_URL", "SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SECRET_KEY", "APP_URL", "CRON_SECRET", "STORAGE_DRIVER"];

/** Never echo connection strings or keys back. */
function scrub(message: string) {
  return message.replace(/postgres(ql)?:\/\/\S+/g, "<url>").replace(/sb_(secret|publishable)_\S+/g, "<key>").slice(0, 300);
}

// Deploy check: which settings are present and whether the database and auth config work. Shows no values.
export async function GET() {
  const env = Object.fromEntries(REQUIRED.map((k) => [k, !!process.env[k]]));
  const misnamed = Object.keys(process.env).filter((k) => k.startsWith("NEXT_PUBLIC_SUPABASE") || k === "POSTGRES_URL");

  let database = "ok";
  try {
    await db.execute(sql`select 1 from settings limit 1`);
  } catch (err) {
    const e = err as { code?: string; message?: string; cause?: { code?: string; message?: string } };
    database = scrub(`${e.code ?? e.cause?.code ?? ""} ${e.message ?? ""} ${e.cause?.message ?? ""}`.trim());
  }

  let auth = "ok";
  try {
    supabaseConfig();
  } catch (err) {
    auth = scrub((err as Error).message);
  }

  const ok = database === "ok" && auth === "ok";
  return NextResponse.json({ ok, env, misnamed, database, auth }, { status: ok ? 200 : 500 });
}
