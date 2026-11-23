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
