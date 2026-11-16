// Shared by the product form (client) and the server, so both apply the same size rules.

export const AUDIENCES = ["kids", "youth", "adult"] as const;
export type Audience = (typeof AUDIENCES)[number];

export const SIZES = ["XS", "S", "M", "L", "XL"] as const;
export type Size = (typeof SIZES)[number];

export const SIZES_BY_AUDIENCE: Record<Audience, readonly Size[]> = {
  kids: ["XS", "S", "M"],
  youth: ["XS", "S", "M", "L"],
  adult: ["M", "L", "XL"],
};

export const AUDIENCE_LABEL: Record<Audience, string> = { kids: "Kids", youth: "Youth", adult: "Adult" };

export const AUDIENCE_HINT: Record<Audience, string> = {
  kids: "Children's wear · XS–M",
  youth: "Teens & young adults · XS–L",
  adult: "Grown-up fits · M–XL",
};

export const SIZE_LABEL: Record<Size, string> = {
  XS: "Extra Small",
  S: "Small",
  M: "Medium",
  L: "Large",
  XL: "Extra Large",
};

export function sortSizes<T extends { size: Size }>(rows: T[]) {
  return [...rows].sort((a, b) => SIZES.indexOf(a.size) - SIZES.indexOf(b.size));
}
