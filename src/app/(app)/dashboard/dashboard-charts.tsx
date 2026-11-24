"use client";

import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { AUDIENCE_LABEL, type Audience } from "@/lib/sizes";

const movementConfig = {
  added: { label: "Stock in", color: "var(--chart-2)" },
  removed: { label: "Stock out / sold", color: "var(--chart-1)" },
} satisfies ChartConfig;

const categoryConfig = { pieces: { label: "Pieces", color: "var(--chart-3)" } } satisfies ChartConfig;

const audienceConfig = {
  kids: { label: "Kids", color: "var(--chart-4)" },
  youth: { label: "Youth", color: "var(--chart-1)" },
  adult: { label: "Adult", color: "var(--chart-3)" },
} satisfies ChartConfig;

export function DashboardCharts({
  movement,
  movementUnit,
  rangeLabel,
  byCategory,
  byAudience,
}: {
  movement: { day: string; added: number; removed: number }[];
  movementUnit: "day" | "month";
  rangeLabel: string;
  byCategory: { name: string; products: number; pieces: number }[];
  byAudience: { audience: string; pieces: number }[];
}) {
  const audienceData = (["kids", "youth", "adult"] as Audience[]).map((a) => ({
    audience: a,
    label: AUDIENCE_LABEL[a],
    pieces: byAudience.find((r) => r.audience === a)?.pieces ?? 0,
    fill: `var(--color-${a})`,
  }));
  const audienceTotal = audienceData.reduce((s, r) => s + r.pieces, 0);
  const anyMovement = movement.some((m) => m.added || m.removed);

  return (
    <section className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <ChartCard title="Stock movement" subtitle={`Pieces in and out per ${movementUnit} · ${rangeLabel}`} className="lg:col-span-2">
        {anyMovement ? (
          <ChartContainer config={movementConfig} className="h-64 w-full">
            <BarChart data={movement} margin={{ left: -16, right: 8, top: 8 }}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="day"
                tickLine={false}
                axisLine={false}
                minTickGap={28}
                tickFormatter={(d: string) =>
                  new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", movementUnit === "month" ? { month: "short", year: "2-digit", timeZone: "UTC" } : { day: "numeric", month: "short", timeZone: "UTC" })
                }
              />
              <YAxis tickLine={false} axisLine={false} allowDecimals={false} width={44} />
              <ChartTooltip content={<ChartTooltipContent indicator="dot" />} />
              {/* Bars, not areas: a one-day range still shows something. */}
              <Bar dataKey="added" fill="var(--color-added)" radius={[3, 3, 0, 0]} maxBarSize={28} />
              <Bar dataKey="removed" fill="var(--color-removed)" radius={[3, 3, 0, 0]} maxBarSize={28} />
              <ChartLegend content={<ChartLegendContent />} />
            </BarChart>
          </ChartContainer>
        ) : (
          <EmptyChart text="No stock moved in these dates." />
        )}
      </ChartCard>

      <ChartCard title="Gender / age distribution" subtitle="Pieces on hand by group">
        {audienceTotal ? (
          <ChartContainer config={audienceConfig} className="mx-auto h-64 w-full">
            <PieChart>
              <ChartTooltip content={<ChartTooltipContent nameKey="audience" hideLabel />} />
              <Pie data={audienceData} dataKey="pieces" nameKey="audience" innerRadius={58} strokeWidth={3}>
                {audienceData.map((d) => (
                  <Cell key={d.audience} fill={d.fill} />
                ))}
              </Pie>
              <ChartLegend content={<ChartLegendContent nameKey="audience" />} />
            </PieChart>
          </ChartContainer>
        ) : (
          <EmptyChart text="No stock yet." />
        )}
      </ChartCard>

      <ChartCard title="Product category distribution" subtitle="Pieces on hand per category" className="lg:col-span-3">
        {byCategory.length ? (
          <ChartContainer config={categoryConfig} className="h-56 w-full">
            <BarChart data={byCategory} layout="vertical" margin={{ left: 8, right: 16 }}>
              <CartesianGrid horizontal={false} />
              <XAxis type="number" tickLine={false} axisLine={false} allowDecimals={false} />
              <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} width={140} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="pieces" fill="var(--color-pieces)" radius={4} barSize={18} />
            </BarChart>
          </ChartContainer>
        ) : (
          <EmptyChart text="Assign categories to products to see the split." />
        )}
      </ChartCard>
    </section>
  );
}

function ChartCard({ title, subtitle, className = "", children }: { title: string; subtitle: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={`rounded-xl border bg-card p-4 ${className}`}>
      <h2 className="text-sm font-medium">{title}</h2>
      <p className="mb-3 text-xs text-muted-foreground">{subtitle}</p>
      {children}
    </div>
  );
}

function EmptyChart({ text }: { text: string }) {
  return <div className="grid h-56 place-items-center rounded-lg border border-dashed text-center text-sm text-muted-foreground">{text}</div>;
}
