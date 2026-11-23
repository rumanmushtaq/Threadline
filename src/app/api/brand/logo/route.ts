import { renderLogo } from "@/server/brand/logo";
import { db } from "@/server/db";
import { getSettings } from "@/server/settings";

// The shop logo as a PNG, made from the brand name: ?theme=dark for light text, ?download=1 to save it.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const { brandName } = await getSettings(db);
  const png = await renderLogo(brandName, { dark: url.searchParams.get("theme") === "dark", height: 240 });
  const headers: Record<string, string> = { "Content-Type": "image/png", "Cache-Control": "public, max-age=300" };
  if (url.searchParams.get("download")) headers["Content-Disposition"] = `attachment; filename="${brandName.replace(/[^\w-]+/g, "-").toLowerCase()}-logo.png"`;
  return new Response(new Uint8Array(png), { headers });
}
