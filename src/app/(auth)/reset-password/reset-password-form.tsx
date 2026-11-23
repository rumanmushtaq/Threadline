"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/auth/fields";
import { Label } from "@/components/ui/label";
import { applyServerErrors } from "@/lib/form-errors";
import type { ActionResult } from "@/server/errors";

const schema = z
  .object({
    password: z
      .string()
      .min(10, "Use at least 10 characters")
      .max(72, "Use at most 72 characters")
      .regex(/[A-Za-z]/, "Include a letter")
      .regex(/\d/, "Include a number"),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "Passwords do not match" });

/** Used by the team and by shoppers; each passes its own action and where to go after. */
export function ResetPasswordForm({
  action,
  doneHref,
}: {
  action: (input: { password: string }) => Promise<ActionResult<null>>;
  doneHref: string;
}) {
  const router = useRouter();
  const form = useForm({ resolver: zodResolver(schema), defaultValues: { password: "", confirm: "" } });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async ({ password }) => {
    const res = await action({ password });
    if (!res.ok) {
      applyServerErrors(res, form.setError);
      return;
    }
    toast.success("Password updated.");
    router.replace(doneHref);
    router.refresh();
  });

  return (
    <form onSubmit={onSubmit} method="post" className="space-y-5" noValidate>
      {(["password", "confirm"] as const).map((k) => (
        <div key={k} className="space-y-2">
          <Label htmlFor={`new-${k}`}>{k === "password" ? "New password" : "Confirm new password"}</Label>
          <PasswordInput id={`new-${k}`} autoComplete="new-password" aria-invalid={!!errors[k]} {...form.register(k)} />
          {errors[k] && <p className="text-xs text-destructive">{errors[k].message}</p>}
        </div>
      ))}
      {errors.root && (
        <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {errors.root.message}
        </p>
      )}
      <Button type="submit" className="w-full" size="lg" disabled={isSubmitting}>
        {isSubmitting && <Loader2 className="animate-spin" />} Save new password
      </Button>
    </form>
  );
}
