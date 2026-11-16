"use client";

import { Search, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AUDIENCE_LABEL, AUDIENCES, SIZES } from "@/lib/sizes";
import { cn } from "@/lib/utils";

export function ProductFiltersBar({ categories }: { categories: { id: string; name: string }[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState(params.get("q") ?? "");

  const update = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value && value !== "all") next.set(key, value);
    else next.delete(key);
    next.delete("page");
    startTransition(() => router.replace(`${pathname}?${next}`, { scroll: false }));
  };

  useEffect(() => {
    const current = params.get("q") ?? "";
    if (q === current) return;
    const t = setTimeout(() => update("q", q.trim() || null), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- debounce only on typing
  }, [q]);

  const select = (key: string, placeholder: string, options: { value: string; label: string }[], width = "w-36") => (
    <Select value={params.get(key) ?? "all"} onValueChange={(v) => update(key, v)}>
      <SelectTrigger className={width} aria-label={placeholder}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{placeholder}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  const any = ["q", "audience", "category", "size", "stock", "status"].some((k) => params.get(k));

  return (
    <div className={cn("mb-4 flex flex-wrap items-center gap-2 transition-opacity", pending && "opacity-70")}>
      <div className="relative min-w-56 flex-1">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, SKU or description" className="pl-9" aria-label="Search products" />
      </div>
      {select("category", "All categories", categories.map((c) => ({ value: c.id, label: c.name })), "w-44")}
      {select("audience", "All groups", AUDIENCES.map((a) => ({ value: a, label: AUDIENCE_LABEL[a] })))}
      {select("size", "Any size", SIZES.map((s) => ({ value: s, label: `Size ${s}` })), "w-32")}
      {select("stock", "Any stock", [
        { value: "in", label: "In stock" },
        { value: "low", label: "Low stock" },
        { value: "out", label: "Out of stock" },
      ])}
      {select("status", "Active", [{ value: "archived", label: "Archived" }], "w-32")}
      {any && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setQ("");
            startTransition(() => router.replace(pathname));
          }}
        >
          <X /> Clear
        </Button>
      )}
    </div>
  );
}
