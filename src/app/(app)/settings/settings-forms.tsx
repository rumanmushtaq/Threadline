"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Check, Download, Loader2, Plus, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { applyServerErrors } from "@/lib/form-errors";
import { LOGO_CORNERS, settingsSchema } from "@/server/settings-schema";
import { changePasswordAction, saveCategoryAction, syncLogosAction, updateSettingsAction } from "./actions";

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border bg-card">
      <div className="border-b px-6 py-4">
        <h2 className="font-medium">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="p-6">{children}</div>
    </section>
  );
}

function Err({ m }: { m?: string }) {
  return m ? <p className="text-xs text-destructive">{m}</p> : null;
}

const pwSchema = z
  .object({
    current: z.string().min(1, "Enter your current password"),
    password: z.string().min(10, "Use at least 10 characters").regex(/[A-Za-z]/, "Include a letter").regex(/\d/, "Include a number"),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "Passwords do not match" });

export function AccountSettings({ name, email }: { name: string; email: string }) {
  const form = useForm({ resolver: zodResolver(pwSchema), defaultValues: { current: "", password: "", confirm: "" } });
  const { errors, isSubmitting } = form.formState;
  const submit = form.handleSubmit(async ({ current, password }) => {
    const res = await changePasswordAction({ current, password });
    if (!res.ok) return applyServerErrors(res, form.setError);
    toast.success("Password changed. Other devices were signed out.");
    form.reset();
  });
  return (
    <Section title="Your account" description={`${name} · ${email}`}>
      <form onSubmit={submit} method="post" noValidate className="grid gap-4 sm:grid-cols-3">
        {(["current", "password", "confirm"] as const).map((k) => (
          <div key={k} className="space-y-2">
            <Label htmlFor={`pw-${k}`}>{k === "current" ? "Current password" : k === "password" ? "New password" : "Confirm new password"}</Label>
            <Input id={`pw-${k}`} type="password" autoComplete={k === "current" ? "current-password" : "new-password"} aria-invalid={!!errors[k]} {...form.register(k)} />
            <Err m={errors[k]?.message} />
          </div>
        ))}
        <div className="sm:col-span-3">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="animate-spin" />} Change password
          </Button>
        </div>
      </form>
    </Section>
  );
}

type SettingsValues = z.infer<typeof settingsSchema>;

export function SystemSettings({ defaults }: { defaults: SettingsValues }) {
  const router = useRouter();
  const form = useForm<SettingsValues>({ resolver: zodResolver(settingsSchema), defaultValues: defaults });
  const { errors, isSubmitting, isDirty } = form.formState;
  const submit = form.handleSubmit(async (values) => {
    const res = await updateSettingsAction({ ...values, brandTagline: values.brandTagline || null });
    if (!res.ok) return applyServerErrors(res, form.setError);
    toast.success("Settings saved");
    form.reset(values);
    router.refresh();
  });
  const num = { valueAsNumber: true } as const;
  return (
    <Section title="Workspace" description="Brand shown on marketing images and public pages, stock alerts and order rules.">
      <form onSubmit={submit} noValidate className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="brandName">Brand name</Label>
          <Input id="brandName" {...form.register("brandName")} />
          <Err m={errors.brandName?.message} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="brandTagline">Tagline (optional)</Label>
          <Input id="brandTagline" placeholder="Everyday fashion, honest prices" {...form.register("brandTagline")} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="currencySymbol">Currency symbol</Label>
          <Input id="currencySymbol" className="max-w-28" {...form.register("currencySymbol")} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="lowStockThreshold">Low-stock alert at (pieces)</Label>
          <Input id="lowStockThreshold" type="number" min={0} className="max-w-28" {...form.register("lowStockThreshold", num)} />
          <Err m={errors.lowStockThreshold?.message} />
        </div>
        <div className="space-y-2">
          <Label>Stock reservation</Label>
          <Controller
            control={form.control}
            name="reservationPolicy"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="on_order">Reserve when the customer orders</SelectItem>
                  <SelectItem value="on_confirm">Reserve when an admin confirms</SelectItem>
                </SelectContent>
              </Select>
            )}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="pendingOrderExpiryHours">Auto-cancel pending orders after (hours, 0 = never)</Label>
          <Input id="pendingOrderExpiryHours" type="number" min={0} className="max-w-28" {...form.register("pendingOrderExpiryHours", num)} />
          <Err m={errors.pendingOrderExpiryHours?.message} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="maxOrderQuantity">Max pieces per customer order</Label>
          <Input id="maxOrderQuantity" type="number" min={1} className="max-w-28" {...form.register("maxOrderQuantity", num)} />
          <Err m={errors.maxOrderQuantity?.message} />
        </div>
        <label className="flex items-center justify-between gap-3 rounded-lg border p-3 sm:col-span-2">
          <span>
            <span className="block text-sm font-medium">Publish new products automatically</span>
            <span className="text-xs text-muted-foreground">New products get a live public link right after saving.</span>
          </span>
          <Controller
            control={form.control}
            name="autoPublishProducts"
            render={({ field }) => <Switch checked={field.value} onCheckedChange={field.onChange} />}
          />
        </label>
        <label className="flex items-center justify-between gap-3 rounded-lg border p-3 sm:col-span-2">
          <span>
            <span className="block text-sm font-medium">Put the logo on product photos</span>
            <span className="text-xs text-muted-foreground">On every new photo customers see: AI photos, marketing cards and photos added by hand. Originals stay clean.</span>
          </span>
          <Controller control={form.control} name="photoLogo" render={({ field }) => <Switch checked={field.value} onCheckedChange={field.onChange} />} />
        </label>
        <div className="space-y-2">
          <Label>Logo corner</Label>
          <Controller
            control={form.control}
            name="photoLogoCorner"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LOGO_CORNERS.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c.replace("-", " ").replace(/^./, (x) => x.toUpperCase())}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </div>
        <div className="sm:col-span-2">
          <Button type="submit" disabled={isSubmitting || !isDirty}>
            {isSubmitting && <Loader2 className="animate-spin" />} Save settings
          </Button>
        </div>
      </form>
    </Section>
  );
}

export function CategoriesSettings({ categories }: { categories: { id: string; name: string; isActive: boolean }[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  const save = async (input: { id?: string; name: string; isActive: boolean }) => {
    setSaving(true);
    const res = await saveCategoryAction(input);
    setSaving(false);
    if (!res.ok) {
      setError(res.fieldErrors?.name?.[0] ?? res.error);
      return false;
    }
    setError(undefined);
    router.refresh();
    return true;
  };

  return (
    <Section title="Categories" description="Product types used for filtering and the dashboard. Hidden categories stay on existing products.">
      <form
        className="mb-4 flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await save({ name, isActive: true })) {
            setName("");
            toast.success("Category added");
          }
        }}
      >
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New category name" className="max-w-xs" aria-label="New category name" />
        <Button type="submit" variant="outline" disabled={saving || name.trim().length < 2}>
          <Plus /> Add
        </Button>
      </form>
      <Err m={error} />
      <div className="flex flex-wrap gap-2">
        {categories.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => save({ id: c.id, name: c.name, isActive: !c.isActive })}
            title={c.isActive ? "Click to hide" : "Click to show"}
          >
            <Badge variant={c.isActive ? "secondary" : "outline"} className={c.isActive ? "" : "text-muted-foreground line-through"}>
              {c.isActive && <Check className="size-3" />} {c.name}
            </Badge>
          </button>
        ))}
      </div>
    </Section>
  );
}

/** The generated logo: preview on light and dark, downloads, and bringing older photos in line. */
export function LogoSettings({ brand, on, pending }: { brand: string; on: boolean; pending: number }) {
  const router = useRouter();
  const [progress, setProgress] = useState<{ done: number; left: number } | null>(null);
  // The brand name in the URL busts the browser cache after a rename.
  const src = (theme: string, download = false) => `/api/brand/logo?theme=${theme}&v=${encodeURIComponent(brand)}${download ? "&download=1" : ""}`;

  const run = async (redoAll: boolean) => {
    let done = 0;
    let first = true;
    for (;;) {
      const res = await syncLogosAction({ redoAll: redoAll && first });
      first = false;
      if (!res.ok) {
        toast.error(res.error);
        break;
      }
      done += res.data.done;
      setProgress({ done, left: res.data.left });
      if (!res.data.left || !res.data.done) break;
    }
    setProgress(null);
    toast.success(`${done} photo${done === 1 ? "" : "s"} updated`);
    router.refresh();
  };

  return (
    <Section title="Logo" description="Made from your brand name. It is stamped in the chosen corner of the photos customers see.">
      <div className="grid gap-4 sm:grid-cols-2">
        {(["light", "dark"] as const).map((t) => (
          <div key={t} className={`grid h-32 place-items-center rounded-lg border ${t === "dark" ? "bg-[#231d18]" : "bg-[#f8f4ee]"}`}>
            {/* eslint-disable-next-line @next/next/no-img-element -- generated PNG */}
            <img src={src(t)} alt={`${brand} logo on ${t}`} className="h-16 w-auto" />
          </div>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button asChild variant="outline" size="sm">
          <a href={src("light", true)}>
            <Download /> Logo for light backgrounds
          </a>
        </Button>
        <Button asChild variant="outline" size="sm">
          <a href={src("dark", true)}>
            <Download /> Logo for dark backgrounds
          </a>
        </Button>
      </div>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
        <p className="text-sm">
          {progress
            ? `Updating photos… ${progress.done} done, ${progress.left} left`
            : pending
              ? `${pending} existing photo${pending === 1 ? "" : "s"} ${on ? "do not have the logo yet" : "still show the logo"}.`
              : on
                ? "Every customer photo has the logo."
                : "No customer photo shows the logo."}
        </p>
        <div className="flex gap-2">
          {pending > 0 && (
            <Button size="sm" disabled={!!progress} onClick={() => run(false)}>
              {progress ? <Loader2 className="animate-spin" /> : <RefreshCw />} {on ? "Add logo to them" : "Remove it"}
            </Button>
          )}
          {on && (
            <Button size="sm" variant="ghost" disabled={!!progress} onClick={() => run(true)} title="After changing the brand name or corner">
              Redo all photos
            </Button>
          )}
        </div>
      </div>
    </Section>
  );
}
