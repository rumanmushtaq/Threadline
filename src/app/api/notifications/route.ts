import { NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth/current";
import { db } from "@/server/db";
import { listNotifications, markAllRead } from "@/server/notifications";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  return NextResponse.json(await listNotifications(db, user.id), { headers: { "Cache-Control": "no-store" } });
}

export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  await markAllRead(db, user.id);
  return NextResponse.json({ ok: true });
}
