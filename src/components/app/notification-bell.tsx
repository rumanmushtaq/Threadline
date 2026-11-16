"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

type Notification = { id: string; title: string; body: string | null; href: string | null; readAt: string | null; createdAt: string };

export function NotificationBell() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["notifications"],
    queryFn: async () => {
      const res = await fetch("/api/notifications");
      if (!res.ok) throw new Error("Failed to load notifications");
      return (await res.json()) as { items: Notification[]; unread: number };
    },
    refetchInterval: 30_000,
  });
  const markRead = useMutation({
    mutationFn: () => fetch("/api/notifications", { method: "POST" }),
    onSuccess: () =>
      qc.setQueryData(["notifications"], (old: typeof data) =>
        old ? { unread: 0, items: old.items.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })) } : old,
      ),
  });
  const unread = data?.unread ?? 0;

  return (
    <Popover onOpenChange={(open) => !open && unread > 0 && markRead.mutate()}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Notifications${unread ? ` (${unread} unread)` : ""}`} className="relative">
          <Bell />
          {unread > 0 && (
            <span className="absolute top-1 right-1 grid min-w-4 place-items-center rounded-full bg-brand px-1 text-[10px] leading-4 font-semibold text-brand-foreground">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="border-b px-4 py-3 text-sm font-medium">Notifications</div>
        <div className="max-h-96 overflow-y-auto">
          {!data?.items.length ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">You are all caught up.</p>
          ) : (
            data.items.map((n) => {
              const body = (
                <div className={cn("space-y-0.5 border-b px-4 py-3 last:border-0", !n.readAt && "bg-brand/5")}>
                  <p className="text-sm font-medium">{n.title}</p>
                  {n.body && <p className="text-xs text-muted-foreground">{n.body}</p>}
                  <p className="text-[11px] text-muted-foreground">{timeAgo(n.createdAt)}</p>
                </div>
              );
              return n.href ? (
                <Link key={n.id} href={n.href} className="block hover:bg-muted/60">
                  {body}
                </Link>
              ) : (
                <div key={n.id}>{body}</div>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
