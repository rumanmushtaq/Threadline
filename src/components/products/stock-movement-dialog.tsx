"use client";

import { Loader2, PackagePlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { stockMovementAction } from "@/app/(app)/products/actions";
import { useCan } from "@/components/app/permissions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type { Size } from "@/lib/sizes";

type Kind = "stock_in" | "adjustment" | "stock_out";
const KIND_TEXT: Record<Kind, { label: string; hint: string }> = {
  stock_in: { label: "Add stock", hint: "New pieces received. Enter how many per size." },
  adjustment: { label: "Adjust", hint: "Correct a count. Use negative numbers to reduce (e.g. -2)." },
  stock_out: { label: "Stock out", hint: "Pieces leaving without an order: damaged, lost, sold offline." },
};

export function StockMovementDialog({
  productId,
  productName,
  sizes,
  trigger,
}: {
  productId: string;
  productName: string;
  sizes: { size: Size; onHand: number; reserved: number }[];
  trigger?: React.ReactNode;
}) {
  const can = useCan();
  const router = useRouter();
  const kinds = (["stock_in", "adjustment", "stock_out"] as Kind[]).filter((k) =>
    can(k === "stock_in" ? "inventory.stock_in" : k === "stock_out" ? "inventory.stock_out" : "inventory.adjust"),
  );
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<Kind>("stock_in");
  const [qty, setQty] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setQty({});
    setReason("");
    setError(null);
  };

  const submit = async () => {
    setSaving(true);
    setError(null);
    const lines = sizes.map((s) => ({ size: s.size, quantity: Number(qty[s.size] || 0) }));
    const res = await stockMovementAction({ productId, kind, reason, lines });
    setSaving(false);
    if (!res.ok) {
      setError(Object.values(res.fieldErrors ?? {})[0]?.[0] ?? res.error);
      return;
    }
    toast.success(`${KIND_TEXT[kind].label}: ${res.data.map((l) => `${l.size} ${l.delta > 0 ? "+" : ""}${l.delta}`).join(", ")}`);
    setOpen(false);
    reset();
    router.refresh();
  };

  if (!kinds.length) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm" variant="outline">
            <PackagePlus /> Update stock
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Update stock</DialogTitle>
          <DialogDescription>{productName}</DialogDescription>
        </DialogHeader>
        {kinds.length > 1 && (
          <Tabs value={kind} onValueChange={(v) => setKind(v as Kind)}>
            <TabsList className="w-full">
              {kinds.map((k) => (
                <TabsTrigger key={k} value={k}>
                  {KIND_TEXT[k].label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        )}
        <p className="text-sm text-muted-foreground">{KIND_TEXT[kind].hint}</p>
        <div className="divide-y rounded-lg border">
          {sizes.map((s) => (
            <div key={s.size} className="flex items-center justify-between gap-3 px-3 py-2">
              <Label htmlFor={`mv-${s.size}`} className="flex items-center gap-3">
                <span className="grid h-7 min-w-9 place-items-center rounded bg-primary px-1.5 text-xs font-semibold text-primary-foreground">{s.size}</span>
                <span className="text-xs text-muted-foreground tabular">
                  {s.onHand} on hand{s.reserved ? ` · ${s.reserved} reserved` : ""}
                </span>
              </Label>
              <Input
                id={`mv-${s.size}`}
                type="number"
                inputMode="numeric"
                step={1}
                min={kind === "adjustment" ? undefined : 0}
                placeholder="0"
                className="w-24 text-right tabular"
                value={qty[s.size] ?? ""}
                onChange={(e) => setQty((q) => ({ ...q, [s.size]: e.target.value }))}
              />
            </div>
          ))}
        </div>
        <div className="space-y-2">
          <Label htmlFor="mv-reason">Reason {kind === "stock_in" ? "(optional)" : ""}</Label>
          <Textarea id="mv-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={kind === "stock_in" ? "e.g. New batch from supplier" : "e.g. 2 pieces damaged in transit"} />
        </div>
        {error && <p className="rounded-md bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving && <Loader2 className="animate-spin" />} Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
