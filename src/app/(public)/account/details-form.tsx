"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { applyServerErrors } from "@/lib/form-errors";
import { customerDetailsSchema } from "@/lib/validation/customer";
import { updateDetailsAction } from "./actions";

type Values = z.input<typeof customerDetailsSchema>;

const FIELDS = [
  { name: "name", label: "Full name", autoComplete: "name" },
  { name: "phone", label: "Phone number", autoComplete: "tel", type: "tel" },
  { name: "whatsapp", label: "WhatsApp (optional)", autoComplete: "off", type: "tel" },
  { name: "address", label: "Delivery address", autoComplete: "street-address" },
  { name: "city", label: "City", autoComplete: "address-level2" },
] as const;

export function DetailsForm({ defaults }: { defaults: Values }) {
  const form = useForm<Values, unknown, z.output<typeof customerDetailsSchema>>({ resolver: zodResolver(customerDetailsSchema), defaultValues: defaults });
  const { errors, isSubmitting, isDirty } = form.formState;

  const onSubmit = form.handleSubmit(async () => {
    const values = form.getValues();
    const res = await updateDetailsAction(values);
    if (!res.ok) return applyServerErrors(res, form.setError);
    toast.success("Details saved.");
    form.reset(values);
  });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {FIELDS.map((f) => (
        <div key={f.name} className="space-y-1.5">
          <Label htmlFor={`d-${f.name}`}>{f.label}</Label>
          <Input id={`d-${f.name}`} type={"type" in f ? f.type : "text"} autoComplete={f.autoComplete} aria-invalid={!!errors[f.name]} {...form.register(f.name)} />
          {errors[f.name] && <p className="text-xs text-destructive">{errors[f.name]?.message}</p>}
        </div>
      ))}
      <Button type="submit" disabled={isSubmitting || !isDirty}>
        {isSubmitting && <Loader2 className="animate-spin" />} Save details
      </Button>
    </form>
  );
}
