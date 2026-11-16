import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import sharp from "sharp";

export type CardInfo = {
  name: string;
  sku: string;
  price: string;
  sizes: string[];
  audience: string;
  category: string | null;
  brand: string;
  tagline: string | null;
};

export const CARD = { width: 1080, height: 1350 };

let fontsPromise: Promise<{ name: string; data: Buffer; weight: 400 | 600 | 700; style: "normal" }[]> | undefined;
function fonts() {
  const dir = path.join(process.cwd(), "assets/fonts");
  fontsPromise ??= Promise.all([
    readFile(path.join(dir, "inter-latin-400-normal.woff")).then((data) => ({ name: "Inter", data, weight: 400 as const, style: "normal" as const })),
    readFile(path.join(dir, "inter-latin-600-normal.woff")).then((data) => ({ name: "Inter", data, weight: 600 as const, style: "normal" as const })),
    readFile(path.join(dir, "inter-latin-700-normal.woff")).then((data) => ({ name: "Inter", data, weight: 700 as const, style: "normal" as const })),
    readFile(path.join(dir, "fraunces-latin-600-normal.woff")).then((data) => ({ name: "Fraunces", data, weight: 600 as const, style: "normal" as const })),
  ]);
  return fontsPromise;
}

const INK = "#231d18";
const IVORY = "#f8f4ee";
const CLAY = "#b4532a";

/**
 * Deterministic marketing card: the AI photo plus text drawn by code, so the name,
 * SKU, price and sizes are always exactly right.
 */
export async function composeMarketingCard(photo: Buffer, info: CardInfo, layout: number): Promise<Buffer> {
  const photoJpeg = await sharp(photo).rotate().resize({ width: CARD.width, height: CARD.height, fit: "cover" }).jpeg({ quality: 88 }).toBuffer();
  const src = `data:image/jpeg;base64,${photoJpeg.toString("base64")}`;
  const element = layout % 2 === 0 ? <PanelLayout src={src} info={info} /> : <OverlayLayout src={src} info={info} />;
  const res = new ImageResponse(element, { ...CARD, fonts: await fonts() });
  const png = Buffer.from(await res.arrayBuffer());
  return sharp(png).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
}

function SizeChips({ sizes, dark }: { sizes: string[]; dark?: boolean }) {
  return (
    <div style={{ display: "flex", gap: 12 }}>
      {sizes.map((s) => (
        <div
          key={s}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            minWidth: 64,
            height: 52,
            padding: "0 14px",
            borderRadius: 12,
            border: `2px solid ${dark ? "rgba(255,255,255,0.7)" : INK}`,
            color: dark ? "#fff" : INK,
            fontSize: 24,
            fontWeight: 600,
          }}
        >
          {s}
        </div>
      ))}
    </div>
  );
}

function PanelLayout({ src, info }: { src: string; info: CardInfo }) {
  const meta = [info.category, info.audience].filter(Boolean).join(" · ");
  return (
    <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", background: IVORY, fontFamily: "Inter" }}>
      <div style={{ display: "flex", position: "relative", width: "100%", height: 960 }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- rendered by satori, not the browser */}
        <img src={src} width={1080} height={960} style={{ objectFit: "cover", width: 1080, height: 960 }} alt="" />
        <div
          style={{
            display: "flex",
            position: "absolute",
            top: 40,
            left: 40,
            padding: "12px 22px",
            borderRadius: 999,
            background: "rgba(248,244,238,0.92)",
            color: INK,
            fontSize: 24,
            fontWeight: 600,
            letterSpacing: 4,
            textTransform: "uppercase",
          }}
        >
          {info.brand}
        </div>
      </div>
      <div style={{ display: "flex", flex: 1, padding: "40px 56px", justifyContent: "space-between", gap: 32 }}>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", flex: 1 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", fontSize: 24, color: CLAY, fontWeight: 600, letterSpacing: 3, textTransform: "uppercase" }}>{meta}</div>
            <div style={{ display: "flex", fontFamily: "Fraunces", fontSize: info.name.length > 30 ? 46 : 58, lineHeight: 1.05, color: INK }}>{info.name}</div>
          </div>
          <SizeChips sizes={info.sizes} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", justifyContent: "space-between" }}>
          <div style={{ display: "flex", padding: "14px 26px", borderRadius: 18, background: INK, color: IVORY, fontSize: 48, fontWeight: 700 }}>{info.price}</div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
            <div style={{ display: "flex", fontSize: 22, color: "#6b6159" }}>SKU</div>
            <div style={{ display: "flex", fontSize: 28, fontWeight: 600, color: INK, letterSpacing: 1 }}>{info.sku}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function OverlayLayout({ src, info }: { src: string; info: CardInfo }) {
  return (
    <div style={{ display: "flex", position: "relative", width: "100%", height: "100%", fontFamily: "Inter", color: "#fff" }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- rendered by satori, not the browser */}
      <img src={src} width={1080} height={1350} style={{ position: "absolute", top: 0, left: 0, width: 1080, height: 1350, objectFit: "cover" }} alt="" />
      <div
        style={{
          display: "flex",
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: 620,
          backgroundImage: "linear-gradient(to bottom, rgba(20,16,13,0), rgba(20,16,13,0.88))",
        }}
      />
      <div style={{ display: "flex", position: "absolute", top: 48, left: 48, right: 48, justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 30, fontWeight: 700, letterSpacing: 6, textTransform: "uppercase", textShadow: "0 2px 12px rgba(0,0,0,0.35)" }}>{info.brand}</div>
          {info.tagline ? <div style={{ display: "flex", fontSize: 20, opacity: 0.85, textShadow: "0 2px 12px rgba(0,0,0,0.35)" }}>{info.tagline}</div> : null}
        </div>
        <div style={{ display: "flex", padding: "16px 28px", borderRadius: 999, background: CLAY, fontSize: 44, fontWeight: 700 }}>{info.price}</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", position: "absolute", left: 56, right: 56, bottom: 56, gap: 22 }}>
        <div style={{ display: "flex", fontSize: 24, fontWeight: 600, letterSpacing: 3, textTransform: "uppercase", opacity: 0.85 }}>
          {[info.category, info.audience].filter(Boolean).join(" · ")}
        </div>
        <div style={{ display: "flex", fontFamily: "Fraunces", fontSize: info.name.length > 30 ? 60 : 76, lineHeight: 1.02 }}>{info.name}</div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <SizeChips sizes={info.sizes} dark />
          <div style={{ display: "flex", fontSize: 26, fontWeight: 600, opacity: 0.9 }}>{info.sku}</div>
        </div>
      </div>
    </div>
  );
}
