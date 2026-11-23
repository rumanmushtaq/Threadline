"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, MailCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { IconInput, PasswordInput } from "@/components/auth/fields";
import { Label } from "@/components/ui/label";
import { customerSignUpAction } from "../actions";

const schema = z
  .object({
    name: z.string().trim().min(2, "Enter your name").max(80),
    email: z.email("Enter a valid email"),
    password: z
      .string()
      .min(10, "Use at least 10 characters")
      .max(72, "Use at most 72 characters")
      .regex(/[A-Za-z]/, "Include a letter")
      .regex(/\d/, "Include a number"),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "Passwords do not match" });
type Values = z.input<typeof schema>;

const FIELDS = [
  { name: "name", label: "Full name", type: "text", autoComplete: "name", icon: "user", placeholder: "e.g. Ayesha Khan" },
  { name: "email", label: "Email", type: "email", autoComplete: "email", icon: "mail", placeholder: "you@example.com" },
  { name: "password", label: "Password", type: "password", autoComplete: "new-password", icon: "lock", placeholder: "10+ characters, a letter and a number" },
  { name: "confirm", label: "Confirm password", type: "password", autoComplete: "new-password", icon: "lock", placeholder: "Type it again" },
] as const;

export function SignUpForm({ next }: { next: string }) {
  const router = useRouter();
  const [sentTo, setSentTo] = useState<string | null>(null);
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { name: "", email: "", password: "", confirm: "" } });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async ({ name, email, password }) => {
    const res = await customerSignUpAction({ name, email, password }, next);
    if (!res.ok) {
      for (const [k, v] of Object.entries(res.fieldErrors ?? {})) if (v?.[0]) form.setError(k as keyof Values, { message: v[0] });
      return form.setError("root", { message: res.error });
    }
    if (res.data === "signed_in") {
      router.replace(next);
      router.refresh();
    } else setSentTo(email);
  });

  if (sentTo) {
    return (
      <div role="status" className="space-y-3 rounded-lg border bg-muted/40 p-4 text-sm">
        <MailCheck className="size-5 text-brand" />
        <p>
          Almost done. We sent a link to <span className="font-medium">{sentTo}</span>. Open it to confirm your email and you&apos;ll be signed in.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} method="post" className="space-y-4" noValidate>
      {FIELDS.map((f) => (
        <div key={f.name} className="space-y-2">
          <Label htmlFor={`su-${f.name}`}>{f.label}</Label>
          {f.type === "password" ? (
            <PasswordInput id={`su-${f.name}`} autoComplete={f.autoComplete} placeholder={f.placeholder} aria-invalid={!!errors[f.name]} {...form.register(f.name)} />
          ) : (
            <IconInput icon={f.icon} id={`su-${f.name}`} type={f.type} autoComplete={f.autoComplete} placeholder={f.placeholder} aria-invalid={!!errors[f.name]} {...form.register(f.name)} />
          )}
          {errors[f.name] && <p className="text-xs text-destructive">{errors[f.name]?.message}</p>}
        </div>
      ))}
      {errors.root && (
        <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {errors.root.message}
        </p>
      )}
      <Button type="submit" className="h-11 w-full rounded-xl text-base" disabled={isSubmitting}>
        {isSubmitting && <Loader2 className="animate-spin" />} Create account
      </Button>
    </form>
  );
}
