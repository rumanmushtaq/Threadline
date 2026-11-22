"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Store } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatMoney } from "@/lib/format";
import { applyServerErrors } from "@/lib/form-errors";
import { SIZE_LABEL, type Size } from "@/lib/sizes";
import { recordSaleSchema, type RecordSaleInput } from "@/lib/validation/sale";
import { recordShopSaleAction } from "./actions";

type Option = { id: string; sku: string; name: string; sellingPriceMinor: number; sizes: { size: Size; available: number }[] };

/** "Record shop sale": for cash sales in the shop. Stock goes down and the sale counts at once. */
export function RecordSale({ options, currency, today }: { options: Option[]; currency: string; today: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const blank = { productId: "", size: undefined, quantity: 1, unitPrice: undefined, soldOn: today, note: "" } as unknown as RecordSaleInput;
  const form = useForm<RecordSaleInput>({ resolver: zodResolver(recordSaleSchema), defaultValues: blank });
  const [productId, size, quantity, unitPrice] = useWatch({ control: form.control, name: ["productId", "size", "quantity", "unitPrice"] });
  const product = options.find((o) => o.id === productId);
  const available = product?.sizes.find((s) => s.size === size)?.available;
  const errors = form.formState.errors;

  const submit = form.handleSubmit(async (values) => {
    const res = await recordShopSaleAction(values);
    if (!res.ok) return applyServerErrors(res, form.setError);
    toast.success(`Sale ${res.data.saleNumber} recorded`, { description: `${values.quantity} × ${res.data.productName}` });
    form.reset({ ...blank, soldOn: values.soldOn });
    setOpen(false);
    router.refresh();
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus /> Record shop sale
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Store className="size-5" /> Record shop sale
          </DialogTitle>
          <DialogDescription>For pieces sold in person. Stock goes down and the sale counts in sales and profit.</DialogDescription>
        </DialogHeader>

        {options.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">No product has pieces in stock. Add stock first.</p>
        ) : (
          <form id="record-sale" onSubmit={submit} className="space-y-4" noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="sale-product">Product</Label>
              <Controller
                control={form.control}
                name="productId"
                render={({ field }) => (
                  <Select
                    value={field.value ?? ""}
                    onValueChange={(v) => {
                      field.onChange(v);
                      const p = options.find((o) => o.id === v);
                      form.setValue("size", (p?.sizes.length === 1 ? p.sizes[0].size : undefined) as Size, { shouldValidate: false });
                      if (p) form.setValue("unitPrice", p.sellingPriceMinor / 100);
                    }}
                  >
                    <SelectTrigger id="sale-product" className="w-full" aria-invalid={!!errors.productId}>
                      <SelectValue placeholder="Choose a product" />
                    </SelectTrigger>
                    <SelectContent>
                      {options.map((o) => (
                        <SelectItem key={o.id} value={o.id}>
                          {o.name} <span className="font-mono text-xs text-muted-foreground">{o.sku}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.productId && <p className="text-xs text-destructive">{errors.productId.message}</p>}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="sale-size">Size</Label>
                <Controller
                  control={form.control}
                  name="size"
                  render={({ field }) => (
                    <Select value={field.value ?? ""} onValueChange={field.onChange} disabled={!product}>
                      <SelectTrigger id="sale-size" className="w-full" aria-invalid={!!errors.size}>
                        <SelectValue placeholder="Choose" />
                      </SelectTrigger>
                      <SelectContent>
                        {product?.sizes.map((s) => (
                          <SelectItem key={s.size} value={s.size}>
                            {SIZE_LABEL[s.size]} ({s.size}) · {s.available} left
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {errors.size && <p className="text-xs text-destructive">{errors.size.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sale-qty">Quantity</Label>
                <Input id="sale-qty" type="number" min={1} max={available} inputMode="numeric" aria-invalid={!!errors.quantity} {...form.register("quantity", { valueAsNumber: true })} />
                {errors.quantity ? (
                  <p className="text-xs text-destructive">{errors.quantity.message}</p>
                ) : (
                  available !== undefined && <p className="text-xs text-muted-foreground">{available} in stock</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="sale-price">Sold for (each)</Label>
                <div className="relative">
                  <span className="pointer-events-none absolute inset-y-0 left-3 grid place-items-center text-sm text-muted-foreground">{currency}</span>
                  <Input id="sale-price" type="number" min={0} step="0.01" inputMode="decimal" className="pl-11" aria-invalid={!!errors.unitPrice} {...form.register("unitPrice", { valueAsNumber: true })} />
                </div>
                {errors.unitPrice && <p className="text-xs text-destructive">{errors.unitPrice.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sale-date">Sale date</Label>
                <Input id="sale-date" type="date" max={today} aria-invalid={!!errors.soldOn} {...form.register("soldOn")} />
                {errors.soldOn && <p className="text-xs text-destructive">{errors.soldOn.message}</p>}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="sale-note">Note (optional)</Label>
              <Input id="sale-note" placeholder="e.g. paid cash, discount for regular customer" maxLength={200} {...form.register("note")} />
              {errors.note && <p className="text-xs text-destructive">{errors.note.message}</p>}
            </div>

            {product && Number.isFinite(unitPrice) && Number.isFinite(quantity) && quantity > 0 && (
              <p className="rounded-lg bg-muted/60 px-3 py-2 text-sm">
                Total <strong className="tabular">{formatMoney(Math.round(unitPrice * 100) * quantity, currency)}</strong>
              </p>
            )}
          </form>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Close
          </Button>
          {options.length > 0 && (
            <Button type="submit" form="record-sale" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? "Saving…" : "Record sale"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
