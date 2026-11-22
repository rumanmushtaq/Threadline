"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CalendarRange, Check, ChevronDown, Loader2 } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RANGE_LABEL, RANGE_PRESETS, type RangePreset } from "@/lib/date-range";

const customSchema = z
  .object({
    from: z.string().min(1, "Pick a start date"),
    to: z.string().min(1, "Pick an end date"),
  })
  .refine((v) => v.from <= v.to, { path: ["to"], message: "End date must be on or after the start date" });

/** Writes the range to the URL; the server page reads it back, so a link shares the same view. */
export function RangePicker({ preset, label, fromDay, toDay }: { preset: RangePreset; label: string; fromDay: string | null; toDay: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const form = useForm<z.infer<typeof customSchema>>({
    resolver: zodResolver(customSchema),
    defaultValues: { from: fromDay ?? toDay, to: toDay },
  });

  const go = (params: Record<string, string>) => {
    setOpen(false);
    startTransition(() => router.replace(`${pathname}?${new URLSearchParams(params)}`, { scroll: false }));
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="min-w-48 justify-between">
          <span className="flex items-center gap-2">
            {pending ? <Loader2 className="animate-spin" /> : <CalendarRange />}
            {label}
          </span>
          <ChevronDown className="opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-3">
        <div className="grid grid-cols-2 gap-1">
          {RANGE_PRESETS.filter((p) => p !== "custom").map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => go({ range: p })}
              className={`flex items-center justify-between rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-muted ${p === preset ? "bg-muted font-medium" : ""}`}
            >
              {RANGE_LABEL[p]}
              {p === preset && <Check className="size-3.5" />}
            </button>
          ))}
        </div>
        <form
          onSubmit={form.handleSubmit((v) => go({ range: "custom", from: v.from, to: v.to }))}
          className="mt-3 space-y-2 border-t pt-3"
        >
          <p className="text-xs font-medium text-muted-foreground">{RANGE_LABEL.custom}</p>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="range-from" className="text-xs">From</Label>
              <Input id="range-from" type="date" {...form.register("from")} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="range-to" className="text-xs">To</Label>
              <Input id="range-to" type="date" {...form.register("to")} />
            </div>
          </div>
          {(form.formState.errors.from || form.formState.errors.to) && (
            <p role="alert" className="text-xs text-destructive">
              {form.formState.errors.from?.message ?? form.formState.errors.to?.message}
            </p>
          )}
          <Button type="submit" size="sm" className="w-full">
            Apply dates
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}
