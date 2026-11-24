"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { HandCoins, Plus, Store } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatMoney } from "@/lib/format";
import { applyServerErrors } from "@/lib/form-errors";
import { SIZE_LABEL, type Size } from "@/lib/sizes";
import { recordSaleSchema, type RecordSaleInput } from "@/lib/validation/sale";
import { recordShopSaleAction } from "./actions";

export type SaleOption = {
  id: string;
  sku: string;
  name: string;
  sellingPriceMinor: number;
  purchasePriceMinor: number;
  sizes: { size: Size; available: number }[];
};

/** "Record shop sale": for cash sales in the shop. Stock goes down and the sale counts at once. */
export function RecordSale({ options, currency, today }: { options: SaleOption[]; currency: string; today: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus /> Record shop sale
      </Button>
      <RecordSaleDialog options={options} currency={currency} today={today} open={open} onOpenChange={setOpen} />
    </>
  );
}

/** "Sold" button for one product: opens the sale form with that product already chosen. */
export function SoldButton({ option, currency, today, size = "sm" }: { option: SaleOption | undefined; currency: string; today: string; size?: "sm" | "default" }) {
  const [open, setOpen] = useState(false);
  if (!option) {
    return (
      <Button variant="outline" size={size} disabled title="No pieces left to sell">
        <HandCoins /> Sold
      </Button>
    );
  }
  return (
    <>
      <Button variant="outline" size={size} onClick={() => setOpen(true)} aria-label={`Record a sale of ${option.name}`}>
        <HandCoins /> Sold
      </Button>
      {open && <RecordSaleDialog options={[option]} productId={option.id} currency={currency} today={today} open onOpenChange={setOpen} />}
    </>
  );
}

export function RecordSaleDialog(props: {
  options: SaleOption[];
  currency: string;
  today: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Chosen up front (the "Sold" button): the product picker is replaced by the product itself. */
  productId?: string;
}) {
  const { options, currency, today, open, onOpenChange: setOpen } = props;
  const router = useRouter();
  const fixed = props.productId ? options.find((o) => o.id === props.productId) : undefined;
  const blank = {
    productId: fixed?.id ?? "",
    size: fixed?.sizes.length === 1 ? fixed.sizes[0].size : undefined,
    quantity: 1,
    unitPrice: fixed ? fixed.sellingPriceMinor / 100 : undefined,
    soldOn: today,
    note: "",
  } as unknown as RecordSaleInput;
  const form = useForm<RecordSaleInput>({ resolver: zodResolver(recordSaleSchema), defaultValues: blank });
  const [productId, size, quantity, unitPrice] = useWatch({ control: form.control, name: ["productId", "size", "quantity", "unitPrice"] });
  const product = options.find((o) => o.id === productId);
  const available = product?.sizes.find((s) => s.size === size)?.available;
  const errors = form.formState.errors;

  // Selling under the target price needs a reason, so the owner can see why later.
  const belowBy = product && Number.isFinite(unitPrice) ? product.sellingPriceMinor - Math.round(unitPrice * 100) : 0;

  const submit = form.handleSubmit(async (values) => {
    if (belowBy > 0 && !values.note?.trim()) {
      return form.setError("note", { message: "Write why it sold below the target sale price" }, { shouldFocus: true });
    }
    const res = await recordShopSaleAction(values);
    if (!res.ok) return applyServerErrors(res, form.setError);
    toast.success(`Sale ${res.data.saleNumber} recorded`, { description: `${values.quantity} × ${res.data.productName}` });
    form.reset({ ...blank, soldOn: values.soldOn });
    setOpen(false);
    router.refresh();
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {fixed ? <HandCoins className="size-5" /> : <Store className="size-5" />} {fixed ? "Mark as sold" : "Record shop sale"}
          </DialogTitle>
          <DialogDescription>For pieces sold in person. Stock goes down and the sale counts in sales and profit.</DialogDescription>
        </DialogHeader>

        {options.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">No product has pieces in stock. Add stock first.</p>
        ) : (
          <form id="record-sale" onSubmit={submit} className="space-y-4" noValidate>
            {fixed ? (
              <div>
                <p className="font-medium">{fixed.name}</p>
                <p className="font-mono text-xs text-muted-foreground">{fixed.sku}</p>
              </div>
            ) : (
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
            )}

            {product && <PriceStrip product={product} currency={currency} />}

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
                <Label htmlFor="sale-price">Sell price (each)</Label>
                <div className="relative">
                  <span className="pointer-events-none absolute inset-y-0 left-3 grid place-items-center text-sm text-muted-foreground">{currency}</span>
                  <Input id="sale-price" type="number" min={0} step="0.01" inputMode="decimal" className="pl-11" aria-invalid={!!errors.unitPrice} {...form.register("unitPrice", { valueAsNumber: true })} />
                </div>
                {errors.unitPrice ? (
                  <p className="text-xs text-destructive">{errors.unitPrice.message}</p>
                ) : (
                  product && <p className="text-xs text-muted-foreground">Saved on this sale only. Product prices stay the same.</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sale-date">Sale date</Label>
                <Input id="sale-date" type="date" max={today} aria-invalid={!!errors.soldOn} {...form.register("soldOn")} />
                {errors.soldOn && <p className="text-xs text-destructive">{errors.soldOn.message}</p>}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="sale-note">{belowBy > 0 ? "Note: reason for the lower price" : "Note (optional)"}</Label>
              <Textarea
                id="sale-note"
                rows={2}
                placeholder={belowBy > 0 ? "e.g. regular customer discount, small stain, sold on credit" : "e.g. paid cash"}
                maxLength={200}
                aria-invalid={!!errors.note}
                {...form.register("note")}
              />
              {errors.note ? (
                <p className="text-xs text-destructive">{errors.note.message}</p>
              ) : (
                belowBy > 0 && (
                  <p className="text-xs text-warning">
                    {formatMoney(belowBy, currency)} below the target sale price per piece. A reason is required.
                  </p>
                )
              )}
            </div>

            {product && Number.isFinite(unitPrice) && Number.isFinite(quantity) && quantity > 0 && (
              <p className="flex flex-wrap justify-between gap-x-4 gap-y-1 rounded-lg bg-muted/60 px-3 py-2 text-sm">
                <span>
                  Total <strong className="tabular">{formatMoney(Math.round(unitPrice * 100) * quantity, currency)}</strong>
                </span>
                <ProfitText minor={(Math.round(unitPrice * 100) - product.purchasePriceMinor) * quantity} currency={currency} />
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

/** The product's two stored prices and stock, so the seller sees cost and target before typing the sell price. */
function PriceStrip({ product, currency }: { product: SaleOption; currency: string }) {
  const cells = [
    { label: "Purchase price", value: formatMoney(product.purchasePriceMinor, currency) },
    { label: "Target sale price", value: formatMoney(product.sellingPriceMinor, currency) },
    { label: "In stock", value: `${product.sizes.reduce((n, s) => n + s.available, 0)} pcs` },
  ];
  return (
    <dl className="grid grid-cols-3 divide-x rounded-lg border bg-muted/40">
      {cells.map((c) => (
        <div key={c.label} className="px-3 py-2">
          <dt className="text-[11px] text-muted-foreground">{c.label}</dt>
          <dd className="tabular text-sm font-semibold">{c.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function ProfitText({ minor, currency }: { minor: number; currency: string }) {
  return (
    <span className={minor < 0 ? "text-destructive" : "text-success"}>
      {minor < 0 ? "Loss" : "Profit"} <strong className="tabular">{formatMoney(Math.abs(minor), currency)}</strong>
    </span>
  );
}
