import { RANGE_LABEL, type RangeParams, type RangePreset } from "@/lib/date-range";

/** Days start and end at midnight in the shop's time zone, not the server's (Vercel runs in UTC). */
export const BUSINESS_TZ = process.env.BUSINESS_TIMEZONE || "Asia/Karachi";

export type ResolvedRange = {
  preset: RangePreset;
  label: string;
  /** Inclusive start; null means "from the beginning". */
  from: Date | null;
  /** Exclusive end. */
  to: Date;
  /** Calendar days shown in the picker and labels (inclusive), YYYY-MM-DD. */
  fromDay: string | null;
  toDay: string;
};

type Ymd = { y: number; m: number; d: number };

function ymdIn(tz: string, at: Date): Ymd {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  return { y: get("year"), m: get("month"), d: get("day") };
}

/** Minutes the zone is ahead of UTC at that moment. */
function offsetMinutes(tz: string, at: Date) {
  const name = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "longOffset" }).formatToParts(at).find((p) => p.type === "timeZoneName")!.value;
  const m = name.match(/GMT([+-])(\d{2}):?(\d{2})?/);
  if (!m) return 0;
  return (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] ?? 0));
}

/** Calendar arithmetic in UTC so month and year ends roll over correctly. */
function shift({ y, m, d }: Ymd, days = 0, months = 0): Ymd {
  const t = new Date(Date.UTC(y, m - 1 + months, d + days));
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

function midnight(tz: string, day: Ymd) {
  const guess = Date.UTC(day.y, day.m - 1, day.d);
  return new Date(guess - offsetMinutes(tz, new Date(guess)) * 60_000);
}

const iso = ({ y, m, d }: Ymd) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const parse = (v: string): Ymd => {
  const [y, m, d] = v.split("-").map(Number);
  return { y, m, d };
};

export function resolveRange(params: RangeParams, now = new Date(), tz = BUSINESS_TZ): ResolvedRange {
  const today = ymdIn(tz, now);
  const weekday = (new Date(Date.UTC(today.y, today.m - 1, today.d)).getUTCDay() + 6) % 7; // Monday = 0
  const monthStart = { ...today, d: 1 };

  let start: Ymd | null;
  let end: Ymd; // inclusive
  switch (params.range) {
    case "today":
      [start, end] = [today, today];
      break;
    case "yesterday":
      start = end = shift(today, -1);
      break;
    case "last_7_days":
      [start, end] = [shift(today, -6), today];
      break;
    case "this_week":
      [start, end] = [shift(today, -weekday), today];
      break;
    case "last_week":
      [start, end] = [shift(today, -weekday - 7), shift(today, -weekday - 1)];
      break;
    case "this_month":
      [start, end] = [monthStart, today];
      break;
    case "last_month":
      [start, end] = [shift(monthStart, 0, -1), shift(monthStart, -1)];
      break;
    case "last_30_days":
      [start, end] = [shift(today, -29), today];
      break;
    case "this_year":
      [start, end] = [{ y: today.y, m: 1, d: 1 }, today];
      break;
    case "custom": {
      const a = params.from ?? params.to ?? iso(today);
      const b = params.to ?? params.from ?? iso(today);
      [start, end] = a <= b ? [parse(a), parse(b)] : [parse(b), parse(a)];
      break;
    }
    default:
      [start, end] = [null, today];
  }

  const label =
    params.range === "custom"
      ? start && iso(start) === iso(end)
        ? fmt(end)
        : `${fmt(start!)} – ${fmt(end)}`
      : RANGE_LABEL[params.range];
  return {
    preset: params.range,
    label,
    from: start ? midnight(tz, start) : null,
    to: midnight(tz, shift(end, 1)),
    fromDay: start ? iso(start) : null,
    toDay: iso(end),
  };
}

function fmt(day: Ymd) {
  return new Date(Date.UTC(day.y, day.m - 1, day.d)).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

/** Today's date in the shop's time zone, YYYY-MM-DD. */
export function businessToday(now = new Date(), tz = BUSINESS_TZ) {
  return iso(ymdIn(tz, now));
}

/** Midday of a calendar day in the shop's time zone: a safe moment for a sale with no time. */
export function businessMidday(day: string, tz = BUSINESS_TZ) {
  return new Date(midnight(tz, parse(day)).getTime() + 12 * 3_600_000);
}
