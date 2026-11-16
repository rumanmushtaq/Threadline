"use client";

import { RotateCw } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { regenerateImagesAction } from "../products/actions";

/** Re-renders the page every 10 s while jobs are running. */
export function AutoRefresh() {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), 10_000);
    return () => clearInterval(t);
  }, [router]);
  return null;
}

export function StatusTabs() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  return (
    <Tabs
      value={params.get("status") ?? "all"}
      onValueChange={(v) => router.replace(v === "all" ? pathname : `${pathname}?status=${v}`, { scroll: false })}
      className="mb-4"
    >
      <TabsList>
        <TabsTrigger value="all">All</TabsTrigger>
        <TabsTrigger value="pending">Queued</TabsTrigger>
        <TabsTrigger value="processing">Generating</TabsTrigger>
        <TabsTrigger value="completed">Ready</TabsTrigger>
        <TabsTrigger value="failed">Failed</TabsTrigger>
      </TabsList>
    </Tabs>
  );
}

export function JobRetryButton({ productId, label }: { productId: string; label: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await regenerateImagesAction({ id: productId });
          if (res.ok) toast.success("Generation queued");
          else toast.error(res.error);
          router.refresh();
        })
      }
    >
      <RotateCw className={pending ? "animate-spin" : ""} /> {label}
    </Button>
  );
}
