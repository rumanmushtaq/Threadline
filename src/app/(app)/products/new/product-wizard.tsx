"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Check, Copy, ExternalLink, Loader2, Sparkles, Wand2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { ImageDropzone } from "@/components/products/image-dropzone";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatPercent } from "@/lib/format";
import { applyServerErrors } from "@/lib/form-errors";
import { AUDIENCE_HINT, AUDIENCE_LABEL, AUDIENCES, SIZE_LABEL, SIZES_BY_AUDIENCE, type Audience } from "@/lib/sizes";
import { cn } from "@/lib/utils";
import { DESCRIPTION_MAX, priceSummary, productInputSchema, type ProductInput } from "@/lib/validation/product";
import { createProductAction, prepareUploadAction } from "../actions";

type Created = { id: string; sku: string; publicUrl: string };

const money = (n: number, symbol: string) =>
  `${symbol} ${(Number.isFinite(n) ? n : 0).toLocaleString("en-PK", { maximumFractionDigits: 2 })}`;

export function ProductWizard({ categories, currency }: { categories: { id: string; name: string }[]; currency: string }) {
  const router = useRouter();
  const [image, setImage] = useState<File | null>(null);
  const [imageError, setImageError] = useState<string>();
  const [created, setCreated] = useState<Created | null>(null);

  const form = useForm<ProductInput>({
    resolver: zodResolver(productInputSchema),
    defaultValues: {
      name: "",
      description: "",
      categoryId: null,
      audience: undefined,
      quantity: undefined,
      sizes: [],
      purchasePrice: undefined,
      sellingPrice: undefined,
    },
    mode: "onTouched",
  });
  const { register, control, setValue, formState } = form;
  const { errors, isSubmitting } = formState;

  const [audience, quantity, sizes, purchase, selling, description, categoryId] = useWatch({
    control,
    name: ["audience", "quantity", "sizes", "purchasePrice", "sellingPrice", "description", "categoryId"],
  });

  const target = Number.isFinite(quantity) ? quantity : 0;
  const assigned = (sizes ?? []).reduce((s, r) => s + (Number.isFinite(r.quantity) ? r.quantity : 0), 0);
  const remaining = target - assigned;
  const summary = priceSummary(purchase || 0, selling || 0, target);

  const chooseAudience = (a: Audience) => {
    const previous = new Map((sizes ?? []).map((s) => [s.size, s.quantity]));
    setValue("audience", a, { shouldValidate: true });
    setValue(
      "sizes",
      SIZES_BY_AUDIENCE[a].map((size) => ({ size, quantity: previous.get(size) ?? 0 })),
      { shouldValidate: form.formState.isSubmitted },
    );
  };

  const splitEvenly = () => {
    if (!audience || target <= 0) return;
    const list = SIZES_BY_AUDIENCE[audience];
    const base = Math.floor(target / list.length);
    let extra = target - base * list.length;
    setValue(
      "sizes",
      list.map((size) => ({ size, quantity: base + (extra-- > 0 ? 1 : 0) })),
      { shouldValidate: true },
    );
  };

  const onSubmit = form.handleSubmit(
    async (values) => {
      if (!image) {
        setImageError("Upload a product picture first.");
        document.getElementById("step-photo")?.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }
      const fd = new FormData();
      fd.set("data", JSON.stringify(values));
      const ticket = await prepareUploadAction();
      if (!ticket.ok) return void toast.error(ticket.error);
      if (ticket.data.mode === "cloudinary") {
        // Large photos go straight to Cloudinary instead of through the app server.
        const up = new FormData();
        for (const [k, v] of Object.entries(ticket.data.fields)) up.set(k, v);
        up.set("file", image);
        const r = await fetch(ticket.data.uploadUrl, { method: "POST", body: up }).catch(() => null);
        const body = (await r?.json().catch(() => null)) as { public_id?: string; format?: string; error?: { message?: string } } | null;
        if (!r?.ok || !body?.public_id || !body.format) {
          setImageError(body?.error?.message ?? "The photo could not be uploaded. Check your connection and try again.");
          return void toast.error("Photo upload failed");
        }
        fd.set("upload", JSON.stringify({ publicId: body.public_id, format: body.format, expires: ticket.data.expires, token: ticket.data.token }));
      } else {
        fd.set("image", image);
      }
      const res = await createProductAction(fd);
      if (!res.ok) {
        if (res.fieldErrors?.image) setImageError(res.fieldErrors.image[0]);
        return applyServerErrors(res, form.setError);
      }
      toast.success(`Product ${res.data.sku} saved`, { description: "AI photos are being generated in the background." });
      setCreated(res.data);
    },
    () => {
      if (!image) setImageError("Upload a product picture first.");
      toast.error("Please fix the highlighted fields.");
    },
  );

  const sizesError =
    (errors.sizes as { message?: string; root?: { message?: string } } | undefined)?.message ??
    (errors.sizes as { root?: { message?: string } } | undefined)?.root?.message;

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-5">
        <Step id="step-photo" n={1} title="Product picture" hint="The original photo. It is kept untouched and used as the AI reference.">
          <ImageDropzone
            value={image}
            onChange={(f) => {
              setImage(f);
              setImageError(undefined);
            }}
            error={imageError}
          />
        </Step>

        <Step n={2} title="Total quantity" hint="How many pieces you have in total. You will split them by size in step 4.">
          <div className="max-w-48 space-y-2">
            <Label htmlFor="quantity">Pieces</Label>
            <Input
              id="quantity"
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              placeholder="e.g. 50"
              aria-invalid={!!errors.quantity}
              {...register("quantity", { valueAsNumber: true })}
            />
            <FieldError message={errors.quantity?.message} />
          </div>
        </Step>

        <Step n={3} title="Name & description" hint="What customers will read on the product page.">
          <div className="grid gap-4 sm:grid-cols-[1fr_220px]">
            <div className="space-y-2">
              <Label htmlFor="name">Product name</Label>
              <Input id="name" placeholder="Oversized Cotton Tee" aria-invalid={!!errors.name} {...register("name")} />
              <FieldError message={errors.name?.message} />
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Select
                value={categoryId ?? "none"}
                onValueChange={(v) => setValue("categoryId", v === "none" ? null : v)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choose" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No category</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="description">Description</Label>
              <span className={cn("text-xs tabular text-muted-foreground", (description?.length ?? 0) > DESCRIPTION_MAX && "text-destructive")}>
                {description?.length ?? 0}/{DESCRIPTION_MAX}
              </span>
            </div>
            <Textarea
              id="description"
              rows={4}
              placeholder="Premium quality cotton T-shirt with a modern oversized fit, comfortable fabric and stylish design."
              aria-invalid={!!errors.description}
              {...register("description")}
            />
            <FieldError message={errors.description?.message} />
          </div>
        </Step>

        <Step n={4} title="Gender / age group & sizes" hint="Sizes change with the group. Split the total quantity across them.">
          <div role="radiogroup" aria-label="Gender / age group" className="grid gap-3 sm:grid-cols-3">
            {AUDIENCES.map((a) => (
              <button
                key={a}
                type="button"
                role="radio"
                aria-checked={audience === a}
                onClick={() => chooseAudience(a)}
                className={cn(
                  "relative rounded-xl border p-4 text-left transition",
                  audience === a ? "border-brand bg-brand/5 ring-1 ring-brand" : "hover:border-foreground/30 hover:bg-muted/40",
                )}
              >
                {audience === a && (
                  <span className="absolute top-3 right-3 grid size-5 place-items-center rounded-full bg-brand text-brand-foreground">
                    <Check className="size-3" />
                  </span>
                )}
                <p className="font-display text-lg">{AUDIENCE_LABEL[a]}</p>
                <p className="mt-1 text-xs text-muted-foreground">{AUDIENCE_HINT[a]}</p>
              </button>
            ))}
          </div>
          <FieldError message={errors.audience?.message} />

          {audience && (
            <div className="mt-5 overflow-hidden rounded-xl border">
              <div className="flex items-center justify-between gap-2 border-b bg-muted/40 px-4 py-2.5">
                <p className="text-sm font-medium">Size-wise quantity</p>
                <Button type="button" size="sm" variant="ghost" onClick={splitEvenly} disabled={target <= 0}>
                  <Wand2 /> Split evenly
                </Button>
              </div>
              <div className="divide-y">
                {(sizes ?? []).map((row, i) => (
                  <div key={row.size} className="flex items-center justify-between gap-4 px-4 py-2.5">
                    <Label htmlFor={`size-${row.size}`} className="flex items-center gap-3">
                      <span className="grid h-8 min-w-10 place-items-center rounded-md bg-primary px-2 text-xs font-semibold text-primary-foreground">
                        {row.size}
                      </span>
                      <span className="text-sm text-muted-foreground">{SIZE_LABEL[row.size]}</span>
                    </Label>
                    <Input
                      id={`size-${row.size}`}
                      type="number"
                      inputMode="numeric"
                      min={0}
                      step={1}
                      className="w-24 text-right tabular"
                      {...register(`sizes.${i}.quantity`, { valueAsNumber: true })}
                    />
                  </div>
                ))}
              </div>
              <div
                className={cn(
                  "flex items-center justify-between border-t px-4 py-3 text-sm font-medium",
                  target > 0 && remaining === 0 ? "bg-success/10 text-success" : "bg-muted/40",
                )}
              >
                <span>Total</span>
                <span className="tabular">
                  {assigned} / {target || "—"}
                  {target > 0 && remaining !== 0 && (
                    <span className={cn("ml-2 text-xs", remaining < 0 ? "text-destructive" : "text-muted-foreground")}>
                      {remaining > 0 ? `${remaining} left to assign` : `${-remaining} too many`}
                    </span>
                  )}
                </span>
              </div>
            </div>
          )}
          <FieldError message={sizesError} />
        </Step>

        <Step n={5} title="Purchase price per piece" hint="Your cost for one piece. Internal only — never shown to customers.">
          <PriceInput id="purchasePrice" currency={currency} error={errors.purchasePrice?.message} {...register("purchasePrice", { valueAsNumber: true })} placeholder="800" />
        </Step>

        <Step n={6} title="Target selling price per piece" hint="The price customers see on the product page.">
          <PriceInput id="sellingPrice" currency={currency} error={errors.sellingPrice?.message} {...register("sellingPrice", { valueAsNumber: true })} placeholder="1500" />
          {selling > 0 && purchase > selling && (
            <p className="mt-2 text-xs text-warning">The selling price is below the purchase price — this product would sell at a loss.</p>
          )}
        </Step>
      </div>

      <aside className="lg:sticky lg:top-20 lg:self-start">
        <div className="rounded-xl border bg-card p-5">
          <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">Live summary</p>
          <dl className="mt-4 space-y-3 text-sm">
            <Row label="Profit per piece" value={money(summary.profitPerPiece, currency)} tone={summary.profitPerPiece < 0 ? "bad" : undefined} />
            <Row label="Profit margin" value={selling > 0 ? formatPercent(summary.margin) : "—"} />
            <div className="border-t" />
            <Row label="Total purchase value" value={money(summary.totalPurchase, currency)} />
            <Row label="Potential sales value" value={money(summary.totalSales, currency)} />
            <Row label="Estimated gross profit" value={money(summary.estimatedProfit, currency)} strong tone={summary.estimatedProfit < 0 ? "bad" : "good"} />
          </dl>
          <p className="mt-4 rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground">
            Estimates if every piece sells at the target price. Realized profit is counted only from delivered orders.
          </p>
        </div>
        <div className="mt-4 flex items-start gap-3 rounded-xl border border-dashed p-4 text-xs text-muted-foreground">
          <Sparkles className="mt-0.5 size-4 shrink-0 text-brand" />
          After saving, the SKU and public link are created instantly. AI model photos are generated in the background — you can keep working.
        </div>
      </aside>

      <div className="sticky bottom-0 z-30 -mx-4 -mb-6 border-t bg-background/90 backdrop-blur md:-mx-8 lg:col-span-2">
        <div className="flex items-center justify-between gap-3 px-4 py-3 md:px-8">
          <p className="hidden text-sm text-muted-foreground sm:block">
            {target > 0 ? `${target} pieces · ${audience ? AUDIENCE_LABEL[audience] : "no group yet"}` : "Fill in the steps above"}
          </p>
          <div className="ml-auto flex gap-2">
            <Button type="button" variant="outline" onClick={() => router.push("/products")} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting} className="min-w-36">
              {isSubmitting ? <Loader2 className="animate-spin" /> : <Check />} Save Product
            </Button>
          </div>
        </div>
      </div>

      <SuccessDialog
        created={created}
        onAnother={() => {
          form.reset();
          setImage(null);
          setCreated(null);
          window.scrollTo({ top: 0, behavior: "smooth" });
        }}
      />
    </form>
  );
}

function Step({ id, n, title, hint, children }: { id?: string; n: number; title: string; hint: string; children: React.ReactNode }) {
  return (
    <section id={id} className="rounded-xl border bg-card p-5 sm:p-6">
      <div className="mb-4 flex gap-3">
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">{n}</span>
        <div>
          <h2 className="font-medium">{title}</h2>
          <p className="text-sm text-muted-foreground">{hint}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function FieldError({ message }: { message?: string }) {
  return message ? <p className="mt-2 text-xs text-destructive">{message}</p> : null;
}

function PriceInput({ id, currency, error, ...props }: React.ComponentProps<typeof Input> & { currency: string; error?: string }) {
  return (
    <div className="max-w-64">
      <div className="relative">
        <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground">{currency}</span>
        <Input id={id} type="number" inputMode="decimal" min={0} step="0.01" className="pl-11 tabular" aria-invalid={!!error} {...props} />
      </div>
      <FieldError message={error} />
    </div>
  );
}

function Row({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: "good" | "bad" }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn("tabular", strong && "text-base font-semibold", tone === "bad" && "text-destructive", tone === "good" && strong && "text-success")}>
        {value}
      </dd>
    </div>
  );
}

function SuccessDialog({ created, onAnother }: { created: Created | null; onAnother: () => void }) {
  const [copied, setCopied] = useState(false);
  const router = useRouter();
  return (
    <Dialog open={!!created} onOpenChange={(o) => !o && created && router.push(`/products/${created.id}`)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mb-2 grid size-12 place-items-center rounded-full bg-success/15 text-success">
            <Check className="size-6" />
          </div>
          <DialogTitle className="font-display text-2xl">Product saved</DialogTitle>
          <DialogDescription>SKU, stock and public link are ready. AI model photos are being generated now.</DialogDescription>
        </DialogHeader>
        {created && (
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-lg border px-4 py-3">
              <span className="text-sm text-muted-foreground">SKU</span>
              <span className="font-mono text-sm font-semibold">{created.sku}</span>
            </div>
            <div className="flex items-center gap-2 rounded-lg border py-2 pr-2 pl-4">
              <span className="min-w-0 flex-1 truncate font-mono text-xs">{created.publicUrl}</span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={async () => {
                  await navigator.clipboard.writeText(created.publicUrl);
                  setCopied(true);
                  toast.success("Link copied");
                }}
              >
                {copied ? <Check /> : <Copy />} Copy
              </Button>
            </div>
          </div>
        )}
        <DialogFooter className="gap-2 sm:justify-between">
          <Button type="button" variant="outline" onClick={onAnother}>
            Create another
          </Button>
          {created && (
            <Button asChild>
              <Link href={`/products/${created.id}`}>
                View product <ExternalLink />
              </Link>
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
