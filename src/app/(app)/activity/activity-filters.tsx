"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function ActivityFilters({ users }: { users: { id: string; name: string }[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value === "all") next.delete(key);
    else next.set(key, value);
    next.delete("page");
    router.replace(`${pathname}?${next}`, { scroll: false });
  };
  return (
    <div className="mb-4 flex flex-wrap gap-2">
      <Select value={params.get("user") ?? "all"} onValueChange={(v) => set("user", v)}>
        <SelectTrigger className="w-48" aria-label="Filter by person">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Everyone</SelectItem>
          {users.map((u) => (
            <SelectItem key={u.id} value={u.id}>
              {u.name}
            </SelectItem>
          ))}
          <SelectItem value="customer">Customers & system</SelectItem>
        </SelectContent>
      </Select>
      <Select value={params.get("entity") ?? "all"} onValueChange={(v) => set("entity", v)}>
        <SelectTrigger className="w-44" aria-label="Filter by area">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All areas</SelectItem>
          <SelectItem value="product">Products & stock</SelectItem>
          <SelectItem value="order">Orders</SelectItem>
          <SelectItem value="user">Accounts</SelectItem>
          <SelectItem value="settings">Settings</SelectItem>
          <SelectItem value="category">Categories</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
