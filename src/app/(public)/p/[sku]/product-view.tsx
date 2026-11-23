"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Check, CheckCircle2, Loader2, Minus, Plus, ShieldCheck, Truck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { formatMoney } from "@/lib/format";
import { AUDIENCE_LABEL, SIZE_LABEL, type Size } from "@/lib/sizes";
import { cn } from "@/lib/utils";
import { orderInputSchema } from "@/lib/validation/order";
import type { PublicProduct } from "@/server/public-products";
import { PublicHeader } from "../../public-header";
import { placeOrderAction } from "./actions";
import { StockBadge } from "@/components/shop/stock-badge";

export type SavedCustomer = { name: string; phone: string | null; whatsapp: string | null; address: string | null; city: string | null };

type Placed = { orderNumber: string; totalMinor: number; productName: string; size: string; quantity: number };

export function ProductView({ product, customer }: { product: PublicProduct; customer: SavedCustomer | null }) {
  const router = useRouter();
  const [active, setActive] = useState(0);
  const firstAvailable = product.sizes.find((s) => s.available > 0)?.size ?? null;
  const [size, setSize] = useState<Size | null>(firstAvailable);
  const [qty, setQty] = useState(1);
  const [open, setOpen] = useState(false);
  const [placed, setPlaced] = useState<Placed | null>(null);

  const selected = product.sizes.find((s) => s.size === size);
  const maxQty = Math.min(selected?.available ?? 0, product.maxOrderQuantity);
  const soldOut = !firstAvailable;
  const image = product.images[active];
  // Visitors can browse freely; ordering needs a shopper account (sign in, then back here).
  const startOrder = () => (customer ? setOpen(true) : router.push(`/account/login?next=${encodeURIComponent(`/p/${product.slug}`)}&reason=order`));

  return (
    <>
      <PublicHeader brand={product.brand} tagline={product.tagline} customer={customer} />

      <main className="mx-auto grid max-w-6xl gap-8 px-4 py-6 pb-28 sm:px-6 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] md:gap-12 md:py-10 md:pb-10">
        <section className="space-y-3">
          <div className="relative overflow-hidden rounded-2xl bg-muted">
            <StockBadge available={product.sizes.reduce((n, s) => n + s.available, 0)} className="absolute top-3 left-3 z-10" />
            {image ? (
              // eslint-disable-next-line @next/next/no-img-element -- CDN or local storage URL
              <img src={image.url} alt={product.name} className="aspect-[4/5] w-full object-cover" />
            ) : (
              <div className="aspect-[4/5]" />
            )}
          </div>
          {product.images.length > 1 && (
            <div className="flex gap-2 overflow-x-auto">
              {product.images.map((img, i) => (
                <button
                  key={img.url}
                  type="button"
                  onClick={() => setActive(i)}
                  aria-label={`Show image ${i + 1}`}
                  className={cn("shrink-0 overflow-hidden rounded-lg border-2 transition", i === active ? "border-foreground" : "border-transparent opacity-75 hover:opacity-100")}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- CDN or local storage URL */}
                  <img src={img.url} alt="" className="h-20 w-16 object-cover" />
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-7 md:pt-4">
          <div className="space-y-3">
            <p className="text-xs font-medium tracking-[0.2em] text-brand uppercase">
              {[product.category, AUDIENCE_LABEL[product.audience]].filter(Boolean).join(" · ")}
            </p>
            <h1 className="font-display text-4xl leading-tight tracking-tight sm:text-5xl">{product.name}</h1>
            <p className="text-2xl font-semibold tabular">{formatMoney(product.price, product.currency)}</p>
            <p className="font-mono text-xs text-muted-foreground">SKU {product.sku}</p>
          </div>

          <p className="leading-relaxed whitespace-pre-line text-muted-foreground">{product.description}</p>

          <div className="space-y-3">
            <div className="flex items-baseline justify-between">
              <p className="text-sm font-medium">Size</p>
              {selected && selected.available > 0 && selected.available <= 5 && (
                <p className="text-xs text-brand">Only {selected.available} left in {selected.size}</p>
              )}
            </div>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Size">
              {product.sizes.map((s) => {
                const out = s.available <= 0;
                return (
                  <button
                    key={s.size}
                    type="button"
                    role="radio"
                    aria-checked={size === s.size}
                    disabled={out}
                    title={out ? "Sold out" : SIZE_LABEL[s.size]}
                    onClick={() => {
                      setSize(s.size);
                      setQty(1);
                    }}
                    className={cn(
                      "h-12 min-w-14 rounded-xl border px-4 text-sm font-medium transition",
                      size === s.size ? "border-foreground bg-foreground text-background" : "hover:border-foreground/50",
                      out && "cursor-not-allowed text-muted-foreground line-through opacity-50 hover:border-border",
                    )}
                  >
                    {s.size}
                  </button>
                );
              })}
            </div>
          </div>

          {!soldOut && (
            <div className="space-y-3">
              <p className="text-sm font-medium">Quantity</p>
              <div className="inline-flex items-center rounded-xl border">
                <Button type="button" variant="ghost" size="icon" aria-label="Decrease quantity" disabled={qty <= 1} onClick={() => setQty((q) => q - 1)}>
                  <Minus />
                </Button>
                <span className="w-10 text-center tabular" aria-live="polite">
                  {qty}
                </span>
                <Button type="button" variant="ghost" size="icon" aria-label="Increase quantity" disabled={qty >= maxQty} onClick={() => setQty((q) => q + 1)}>
                  <Plus />
                </Button>
              </div>
            </div>
          )}

          <div className="hidden md:block">
            <OrderButton soldOut={soldOut} total={formatMoney(product.price * qty, product.currency)} onClick={startOrder} />
          </div>

          <ul className="grid gap-3 border-t pt-6 text-sm text-muted-foreground sm:grid-cols-2">
            <li className="flex items-center gap-2">
              <Truck className="size-4 text-foreground" /> Delivery across the country
            </li>
            <li className="flex items-center gap-2">
              <ShieldCheck className="size-4 text-foreground" /> Pay when you receive
            </li>
          </ul>
        </section>
      </main>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 p-3 backdrop-blur md:hidden">
        <OrderButton soldOut={soldOut} total={formatMoney(product.price * qty, product.currency)} onClick={startOrder} />
      </div>

      <Sheet
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setPlaced(null);
        }}
      >
        <SheetContent side="right" className="gap-0 overflow-y-auto data-[side=right]:w-full sm:data-[side=right]:max-w-lg">
          {placed ? (
            <Confirmation placed={placed} currency={product.currency} onClose={() => setOpen(false)} />
          ) : (
            <OrderForm
              customer={customer}
              product={product}
              imageUrl={product.images[0]?.url ?? null}
              size={size}
              quantity={qty}
              onPlaced={(p) => setPlaced(p)}
            />
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}

function OrderButton({ soldOut, total, onClick }: { soldOut: boolean; total: string; onClick: () => void }) {
  return (
    <Button size="lg" className="h-13 w-full rounded-xl text-base" disabled={soldOut} onClick={onClick}>
      {soldOut ? "Sold out" : `Order Now · ${total}`}
    </Button>
  );
}

const formSchema = orderInputSchema.pick({ customerName: true, phone: true, whatsapp: true, address: true, city: true, notes: true, website: true });
type FormValues = z.input<typeof formSchema>;

function OrderForm({
  customer,
  product,
  imageUrl,
  size,
  quantity,
  onPlaced,
}: {
  customer: SavedCustomer | null;
  product: PublicProduct;
  imageUrl: string | null;
  size: Size | null;
  quantity: number;
  onPlaced: (p: Placed) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const form = useForm<FormValues, unknown, z.output<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    // Filled in from the shopper's account; whatever they send is saved for next time.
    defaultValues: {
      customerName: customer?.name ?? "",
      phone: customer?.phone ?? "",
      whatsapp: customer?.whatsapp ?? "",
      address: customer?.address ?? "",
      city: customer?.city ?? "",
      notes: "",
      website: "",
    },
  });
  const { errors, isSubmitting } = form.formState;
  const notes = useWatch({ control: form.control, name: "notes" }) ?? "";

  const submit = form.handleSubmit(async () => {
    setError(null);
    // Send the raw inputs: the server parses them with the same schema.
    const values = form.getValues();
    const res = await placeOrderAction({ ...values, slug: product.slug, size, quantity });
    if (!res.ok) {
      for (const [k, v] of Object.entries(res.fieldErrors ?? {})) {
        if (v?.[0] && k in values) form.setError(k as keyof FormValues, { message: v[0] });
      }
      setError(res.fieldErrors?.quantity?.[0] ?? res.fieldErrors?.size?.[0] ?? res.error);
      return;
    }
    onPlaced(res.data);
  });

  const field = (name: keyof FormValues, label: string, props: React.ComponentProps<typeof Input> = {}) => (
    <div className="space-y-1.5">
      <Label htmlFor={`o-${name}`}>{label}</Label>
      <Input id={`o-${name}`} aria-invalid={!!errors[name]} {...props} {...form.register(name)} />
      {errors[name] && <p className="text-xs text-destructive">{errors[name]?.message}</p>}
    </div>
  );

  return (
    <form onSubmit={submit} noValidate className="flex h-full flex-col">
      <SheetHeader className="border-b pb-4">
        <SheetTitle className="font-display text-2xl">Your order</SheetTitle>
        <SheetDescription>Check the piece, add where to deliver, and place your order.</SheetDescription>
      </SheetHeader>
      {/* What is being ordered */}
      <div className="flex gap-4 border-b p-4">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- CDN or local storage URL
          <img src={imageUrl} alt="" className="h-24 w-20 shrink-0 rounded-xl object-cover ring-1 ring-black/5" />
        ) : (
          <div className="h-24 w-20 shrink-0 rounded-xl bg-muted" />
        )}
        <div className="min-w-0 flex-1 space-y-1">
          <p className="font-medium leading-snug">{product.name}</p>
          <p className="text-xs text-muted-foreground">
            Size {size ? `${SIZE_LABEL[size]} (${size})` : "not chosen"} · {quantity} {quantity === 1 ? "piece" : "pieces"}
          </p>
          <p className="text-xs text-muted-foreground">{formatMoney(product.price, product.currency)} each</p>
          <p className="pt-1 font-semibold tabular">{formatMoney(product.price * quantity, product.currency)}</p>
        </div>
      </div>
      <p className="px-4 pt-4 text-xs font-medium tracking-[0.2em] text-muted-foreground uppercase">Delivery details</p>
      <div className="flex-1 space-y-4 px-4 pt-3 pb-4">
        {field("customerName", "Full name", { autoComplete: "name" })}
        <div className="grid gap-4 sm:grid-cols-2">
          {field("phone", "Phone number", { type: "tel", inputMode: "tel", autoComplete: "tel", placeholder: "03001234567" })}
          {field("whatsapp", "WhatsApp (optional)", { type: "tel", inputMode: "tel", placeholder: "If different" })}
        </div>
        {field("address", "Delivery address", { autoComplete: "street-address", placeholder: "House, street, area" })}
        {field("city", "City", { autoComplete: "address-level2" })}
        <div className="space-y-1.5">
          <div className="flex justify-between">
            <Label htmlFor="o-notes">Notes (optional)</Label>
            <span className="text-xs text-muted-foreground tabular">{notes.length}/500</span>
          </div>
          <Textarea id="o-notes" rows={3} placeholder="Delivery time, landmark…" {...form.register("notes")} />
          {errors.notes && <p className="text-xs text-destructive">{errors.notes.message}</p>}
        </div>
        {/* Honeypot for bots — hidden from people and screen readers. */}
        <input type="text" tabIndex={-1} autoComplete="off" aria-hidden className="absolute -left-[9999px] h-0 w-0 opacity-0" {...form.register("website")} />
        {error && <p className="rounded-lg bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p>}
      </div>
      <div className="sticky bottom-0 space-y-3 border-t bg-popover p-4">
        <div className="space-y-1.5 text-sm">
          <div className="flex justify-between text-muted-foreground">
            <span>Subtotal</span>
            <span className="tabular">{formatMoney(product.price * quantity, product.currency)}</span>
          </div>
          <div className="flex justify-between text-muted-foreground">
            <span>Delivery</span>
            <span>Confirmed on call</span>
          </div>
          <div className="flex justify-between text-base font-semibold">
            <span>Total</span>
            <span className="tabular">{formatMoney(product.price * quantity, product.currency)}</span>
          </div>
        </div>
        <Button type="submit" size="lg" className="h-12 w-full rounded-xl text-base" disabled={isSubmitting || !size}>
          {isSubmitting && <Loader2 className="animate-spin" />} Place order
        </Button>
        <p className="mt-2 text-center text-xs text-muted-foreground">We will call or WhatsApp you to confirm before dispatch.</p>
      </div>
    </form>
  );
}

function Confirmation({ placed, currency, onClose }: { placed: Placed; currency: string; onClose: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 p-6 text-center">
      <div className="grid size-16 place-items-center rounded-full bg-success/15 text-success">
        <CheckCircle2 className="size-8" />
      </div>
      <div className="space-y-2">
        <SheetTitle className="font-display text-3xl">Order placed</SheetTitle>
        <SheetDescription>Thank you! Keep your order number. We will contact you shortly to confirm delivery.</SheetDescription>
      </div>
      <div className="w-full space-y-2 rounded-xl border p-4 text-left text-sm">
        <Row k="Order number" v={<span className="font-mono font-semibold">{placed.orderNumber}</span>} />
        <Row k="Item" v={`${placed.productName} · ${placed.size}`} />
        <Row k="Quantity" v={placed.quantity} />
        <Row k="Total" v={<span className="font-semibold">{formatMoney(placed.totalMinor, currency)}</span>} />
      </div>
      <div className="flex gap-2">
        <Button asChild className="rounded-xl">
          <a href="/account">Track in my orders</a>
        </Button>
        <Button variant="outline" onClick={onClose} className="rounded-xl">
          <Check /> Done
        </Button>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground">{k}</span>
      <span>{v}</span>
    </div>
  );
}
