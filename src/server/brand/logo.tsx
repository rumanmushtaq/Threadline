import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import sharp from "sharp";

export const INK = "#231d18";
export const IVORY = "#f8f4ee";
export const CLAY = "#b4532a";

/**
 * The Threadline mark: a needle standing as the stem of a "T", with a clay thread looping
 * through its eye as the crossbar, inside a stitched ink circle. Drawn in code so it stays
 * sharp at any size and renders the same everywhere (Satori and browsers both read it).
 */
export function LogoMark({ size, ring = true }: { size: number; ring?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <circle cx="50" cy="50" r="48" fill={INK} />
      {ring && <circle cx="50" cy="50" r="41" fill="none" stroke={IVORY} strokeOpacity="0.35" strokeWidth="1.6" strokeDasharray="3.2 4.2" />}
      {/* Needle */}
      <path d="M50 86 L46.6 42 Q46.4 25 50 22 Q53.6 25 53.4 42 Z" fill={IVORY} />
      <ellipse cx="50" cy="31.5" rx="1.5" ry="4.6" fill={INK} />
      {/* Thread through the eye: the crossbar of the T */}
      <path d="M21 45 C30 31 41 29 50 31.5 C59 34 66 27 72 30 C78 33 79 39 74 42" fill="none" stroke={CLAY} strokeWidth="5" strokeLinecap="round" />
    </svg>
  );
}

let fontPromise: Promise<Buffer> | undefined;
const display = () => (fontPromise ??= readFile(path.join(process.cwd(), "assets/fonts/fraunces-latin-600-normal.woff")));

export type LogoCorner = "bottom-right" | "bottom-left" | "top-right" | "top-left";

/** Full logo (mark + name) as a transparent PNG, for downloads and the settings preview. */
export async function renderLogo(brand: string, opts: { dark?: boolean; height?: number } = {}) {
  const h = opts.height ?? 160;
  const text = opts.dark ? IVORY : INK;
  const res = new ImageResponse(
    (
      <div style={{ display: "flex", alignItems: "center", gap: h * 0.18, height: "100%", width: "100%", padding: `0 ${h * 0.1}px` }}>
        <LogoMark size={h * 0.8} />
        <div style={{ display: "flex", fontFamily: "Fraunces", fontSize: h * 0.42, color: text, letterSpacing: h * 0.005 }}>{brand}</div>
      </div>
    ),
    { width: Math.round(h * (1.2 + brand.length * 0.27)), height: h, fonts: [{ name: "Fraunces", data: await display(), weight: 600, style: "normal" }] },
  );
  return Buffer.from(await res.arrayBuffer());
}

const stampCache = new Map<string, Promise<Buffer>>();

/** The badge stamped on customer photos: mark and name on a soft dark pill, made once per brand. */
function stamp(brand: string) {
  let p = stampCache.get(brand);
  if (!p) {
    p = (async () => {
      const h = 128;
      const res = new ImageResponse(
        (
          <div style={{ display: "flex", width: "100%", height: "100%" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 18,
                height: h,
                padding: "0 34px 0 16px",
                borderRadius: h / 2,
                background: "rgba(24,19,16,0.62)",
                border: "2px solid rgba(248,244,238,0.25)",
              }}
            >
              <LogoMark size={h - 28} ring={false} />
              <div style={{ display: "flex", fontFamily: "Fraunces", fontSize: 50, color: IVORY, letterSpacing: 1 }}>{brand}</div>
            </div>
          </div>
        ),
        { width: Math.round(h * 1.4 + brand.length * 32), height: h, fonts: [{ name: "Fraunces", data: await display(), weight: 600, style: "normal" }] },
      );
      // Crop the transparent space to the right of the pill.
      return sharp(Buffer.from(await res.arrayBuffer())).trim().png().toBuffer();
    })();
    p.catch(() => stampCache.delete(brand));
    stampCache.set(brand, p);
  }
  return p;
}

/** Composites the logo onto an already resized image, sized to its width, in the chosen corner. */
export async function withLogo(image: Buffer, opts: { brand: string; corner: LogoCorner }) {
  const meta = await sharp(image).metadata();
  const w = meta.width ?? 800;
  const h = meta.height ?? 1000;
  // Shop cards show a centred 4:5 crop, so keep the logo inside that area or it gets cut off.
  const safeW = Math.min(w, h * 0.8);
  const safeH = Math.min(h, w * 1.25);
  const x0 = (w - safeW) / 2;
  const y0 = (h - safeH) / 2;
  const target = Math.max(96, Math.round(safeW * 0.3));
  const logo = await sharp(await stamp(opts.brand)).resize({ width: target }).toBuffer();
  const lm = await sharp(logo).metadata();
  const margin = Math.round(safeW * 0.035);
  const left = Math.round(opts.corner.endsWith("left") ? x0 + margin : x0 + safeW - (lm.width ?? target) - margin);
  const top = Math.round(opts.corner.startsWith("top") ? y0 + margin : y0 + safeH - (lm.height ?? 0) - margin);
  return sharp(image)
    .composite([{ input: logo, left: Math.max(0, left), top: Math.max(0, top) }])
    .toBuffer();
}
