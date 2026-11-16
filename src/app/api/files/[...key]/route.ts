import { NextResponse } from "next/server";
import { assertSafeKey, storage } from "@/server/storage";

const TYPES: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };

// Serves files for the local storage driver (development / single-server installs).
export async function GET(_req: Request, ctx: { params: Promise<{ key: string[] }> }) {
  if (process.env.STORAGE_DRIVER && process.env.STORAGE_DRIVER !== "local") return new NextResponse("Not found", { status: 404 });
  const key = (await ctx.params).key.join("/");
  try {
    assertSafeKey(key);
    const body = await storage().get(key);
    const ext = key.split(".").pop()?.toLowerCase() ?? "";
    return new NextResponse(new Uint8Array(body), {
      headers: {
        "Content-Type": TYPES[ext] ?? "application/octet-stream",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
