import { z } from "zod";

// Dashboard date filter, shared by the picker (client) and the queries (server). It lives in the URL.

export const RANGE_PRESETS = [
  "today",
  "yesterday",
  "last_7_days",
  "this_week",
  "last_week",
  "this_month",
  "last_month",
  "last_30_days",
  "this_year",
  "all_time",
  "custom",
] as const;
export type RangePreset = (typeof RANGE_PRESETS)[number];

export const RANGE_LABEL: Record<RangePreset, string> = {
  today: "Today",
  yesterday: "Yesterday",
  last_7_days: "Last 7 days",
  this_week: "This week",
  last_week: "Last week",
  this_month: "This month",
  last_month: "Last month",
  last_30_days: "Last 30 days",
  this_year: "This year",
  all_time: "All time",
  custom: "Custom dates",
};

export const DEFAULT_RANGE: RangePreset = "all_time";

const isoDay = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().startsWith(v));

/** Bad or missing values fall back to defaults, so a hand-edited URL never breaks the page. */
export const rangeParamsSchema = z.object({
  range: z.enum(RANGE_PRESETS).catch(DEFAULT_RANGE),
  from: isoDay.optional().catch(undefined),
  to: isoDay.optional().catch(undefined),
});
export type RangeParams = z.infer<typeof rangeParamsSchema>;
