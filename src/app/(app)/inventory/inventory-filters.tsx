"use client";

import { Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function InventoryFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");

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

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <div className="relative min-w-56 flex-1 sm:max-w-sm">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search product or SKU" className="pl-9" aria-label="Search inventory" />
      </div>
      <Tabs value={params.get("stock") ?? "all"} onValueChange={(v) => update("stock", v === "all" ? null : v)}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="low">Low stock</TabsTrigger>
          <TabsTrigger value="out">Out of stock</TabsTrigger>
        </TabsList>
      </Tabs>
      <Tabs value={params.get("audience") ?? "all"} onValueChange={(v) => update("audience", v === "all" ? null : v)}>
        <TabsList>
          <TabsTrigger value="all">All groups</TabsTrigger>
          <TabsTrigger value="kids">Kids</TabsTrigger>
          <TabsTrigger value="youth">Youth</TabsTrigger>
          <TabsTrigger value="adult">Adult</TabsTrigger>
        </TabsList>
      </Tabs>
    </div>
  );
}
