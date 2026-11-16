// Formatting helpers shared by server and client. Money is stored as integer minor units.

export function toMinor(major: number) {
  return Math.round(major * 100);
}

export function fromMinor(minor: number) {
  return minor / 100;
}

export function formatMoney(minor: number | bigint | string, symbol = "Rs.") {
  const value = Number(minor) / 100;
  const hasFraction = Math.round(value * 100) % 100 !== 0;
  return `${symbol} ${value.toLocaleString("en-PK", {
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
}

export function formatNumber(n: number | string) {
  return Number(n).toLocaleString("en-PK");
}

export function formatPercent(ratio: number) {
  if (!Number.isFinite(ratio)) return "—";
  return `${(ratio * 100).toFixed(1)}%`;
}

export function formatDate(d: Date | string) {
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function formatDateTime(d: Date | string) {
  return new Date(d).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function timeAgo(d: Date | string) {
  const s = Math.round((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const days = Math.round(h / 24);
  if (days < 30) return `${days} d ago`;
  return formatDate(d);
}
