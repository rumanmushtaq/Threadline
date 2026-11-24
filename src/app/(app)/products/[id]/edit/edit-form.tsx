"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { applyServerErrors } from "@/lib/form-errors";
import { productUpdateSchema } from "@/lib/validation/product";
import { updateProductAction } from "../../actions";

type Values = z.infer<typeof productUpdateSchema>;

export function EditProductForm({
  defaults,
  categories,
  currency,
}: {
  defaults: Values;
  categories: { id: string; name: string }[];
  currency: string;
}) {
  const router = useRouter();
  const form = useForm<Values>({ resolver: zodResolver(productUpdateSchema), defaultValues: defaults });
  const { errors, isSubmitting, isDirty } = form.formState;
  const categoryId = useWatch({ control: form.control, name: "categoryId" });

  const submit = form.handleSubmit(async (values) => {
    const res = await updateProductAction(values);
    if (!res.ok) return applyServerErrors(res, form.setError);
    toast.success("Product updated");
    router.push(`/products/${defaults.id}`);
    router.refresh();
  });

  return (
    <form onSubmit={submit} noValidate className="space-y-5 rounded-xl border bg-card p-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_220px]">
        <div className="space-y-2">
          <Label htmlFor="name">Product name</Label>
          <Input id="name" aria-invalid={!!errors.name} {...form.register("name")} />
          {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
        </div>
        <div className="space-y-2">
          <Label>Category</Label>
          <Select value={categoryId ?? "none"} onValueChange={(v) => form.setValue("categoryId", v === "none" ? null : v, { shouldDirty: true })}>
            <SelectTrigger className="w-full">
              <SelectValue />
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
      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea id="description" rows={5} aria-invalid={!!errors.description} {...form.register("description")} />
        {errors.description && <p className="text-xs text-destructive">{errors.description.message}</p>}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {(["purchasePrice", "sellingPrice"] as const).map((k) => (
          <div key={k} className="space-y-2">
            <Label htmlFor={k}>{k === "purchasePrice" ? "Purchase price per piece" : "Target sale price per piece"}</Label>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground">{currency}</span>
              <Input id={k} type="number" step="0.01" min={0} className="pl-11 tabular" aria-invalid={!!errors[k]} {...form.register(k, { valueAsNumber: true })} />
            </div>
            {errors[k] && <p className="text-xs text-destructive">{errors[k]?.message}</p>}
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Price changes apply to new orders only. Existing orders keep the price they were placed at.
      </p>
      <div className="flex justify-end gap-2 border-t pt-5">
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting || !isDirty}>
          {isSubmitting && <Loader2 className="animate-spin" />} Save changes
        </Button>
      </div>
    </form>
  );
}
