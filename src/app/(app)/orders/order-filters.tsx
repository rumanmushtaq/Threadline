"use client";

import { Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ORDER_STATUS_LABEL, type OrderStatus } from "@/components/orders/order-status-badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function OrderFilters({ counts }: { counts: Record<string, number> }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const current = params.get("status");

  const update = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("page");
    router.replace(`${pathname}?${next}`, { scroll: false });
  };

  useEffect(() => {
    if (q === (params.get("q") ?? "")) return;
    const t = setTimeout(() => update("q", q.trim() || null), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- debounce only on typing
  }, [q]);

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return (
    <div className="mb-4 space-y-3">
      <div className="flex flex-wrap gap-2">
        {[null, ...(Object.keys(ORDER_STATUS_LABEL) as OrderStatus[])].map((s) => (
          <button
            key={s ?? "all"}
            type="button"
            onClick={() => update("status", s)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-sm transition",
              current === s || (!current && !s) ? "border-foreground bg-foreground text-background" : "hover:border-foreground/40",
            )}
          >
            {s ? ORDER_STATUS_LABEL[s] : "All"} <span className="ml-1 tabular opacity-70">{s ? counts[s] : total}</span>
          </button>
        ))}
      </div>
      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Order number, name, phone or city" className="pl-9" aria-label="Search orders" />
      </div>
    </div>
  );
}
