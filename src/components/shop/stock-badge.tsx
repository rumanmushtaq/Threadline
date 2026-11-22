import { cn } from "@/lib/utils";

/** "Available" or "Sold out" on every shop item, with a nudge when only a few pieces are left. */
/** compact: just "Available" or "Sold out", for small spaces. */
export function StockBadge({ available, className, compact }: { available: number; className?: string; compact?: boolean }) {
  const soldOut = available <= 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full whitespace-nowrap px-2.5 py-1 text-xs font-semibold shadow-sm backdrop-blur",
        soldOut ? "bg-neutral-900/85 text-white" : "bg-emerald-600/90 text-white",
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", soldOut ? "bg-red-400" : "bg-white")} aria-hidden />
      {soldOut ? "Sold out" : !compact && available <= 5 ? `Available · ${available} left` : "Available"}
    </span>
  );
}
