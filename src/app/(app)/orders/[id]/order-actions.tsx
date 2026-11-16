"use client";

import { Ban, Check, PackageCheck, Truck, Wrench } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { transitionOrderAction } from "../actions";

type Target = "confirmed" | "processing" | "dispatched" | "delivered" | "cancelled";

const META: Record<Target, { label: string; icon: React.ComponentType; confirm: string }> = {
  confirmed: { label: "Confirm", icon: Check, confirm: "Confirm this order? Stock stays reserved for the customer." },
  processing: { label: "Processing", icon: Wrench, confirm: "Mark this order as being prepared?" },
  dispatched: { label: "Dispatch", icon: Truck, confirm: "Mark this order as dispatched to the customer?" },
  delivered: { label: "Mark delivered", icon: PackageCheck, confirm: "Mark as delivered? The reserved pieces are deducted from stock permanently and counted as sold." },
  cancelled: { label: "Cancel order", icon: Ban, confirm: "Cancel this order? Any reserved pieces go back to available stock." },
};

export function OrderActions({ id, orderNumber, next }: { id: string; orderNumber: string; next: string[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [target, setTarget] = useState<Target | null>(null);
  const [reason, setReason] = useState("");
  const targets = next as Target[];
  if (!targets.length) return null;

  const run = () =>
    start(async () => {
      if (!target) return;
      const res = await transitionOrderAction({ id, to: target, reason: reason || undefined });
      if (res.ok) toast.success(`${orderNumber} → ${META[target].label.toLowerCase()}`);
      else toast.error(res.error);
      setTarget(null);
      setReason("");
      router.refresh();
    });

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {targets.map((t) => {
          const Icon = META[t].icon;
          return (
            <Button key={t} size="sm" variant={t === "cancelled" ? "outline" : "default"} disabled={pending} onClick={() => setTarget(t)}>
              <Icon /> {META[t].label}
            </Button>
          );
        })}
      </div>
      <AlertDialog open={!!target} onOpenChange={(o) => !o && setTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {target && META[target].label} {orderNumber}
            </AlertDialogTitle>
            <AlertDialogDescription>{target && META[target].confirm}</AlertDialogDescription>
          </AlertDialogHeader>
          {target === "cancelled" && (
            <Textarea rows={2} placeholder="Reason (optional), e.g. customer not reachable" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} />
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Back</AlertDialogCancel>
            <AlertDialogAction onClick={run}>{target && META[target].label}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
