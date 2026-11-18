"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, MailCheck } from "lucide-react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { forgotPasswordAction } from "../actions";

const schema = z.object({ email: z.email("Enter a valid email") });

export function ForgotPasswordForm() {
  const form = useForm({ resolver: zodResolver(schema), defaultValues: { email: "" } });
  const { errors, isSubmitting, isSubmitSuccessful } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    const res = await forgotPasswordAction(values);
    if (!res.ok) form.setError("root", { message: res.error });
  });

  if (isSubmitSuccessful && !errors.root) {
    return (
      <div role="status" className="space-y-4 rounded-lg border bg-muted/40 p-4 text-sm">
        <MailCheck className="size-5 text-brand" />
        <p>If that email belongs to an account, a reset link is on its way. It works once and expires in an hour.</p>
        <Link href="/login" className="font-medium underline underline-offset-4">Back to sign in</Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} method="post" className="space-y-5" noValidate>
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" autoComplete="email" autoFocus aria-invalid={!!errors.email} {...form.register("email")} />
        {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
      </div>
      {errors.root && (
        <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {errors.root.message}
        </p>
      )}
      <Button type="submit" className="w-full" size="lg" disabled={isSubmitting}>
        {isSubmitting && <Loader2 className="animate-spin" />} Send reset link
      </Button>
      <p className="text-center text-sm">
        <Link href="/login" className="text-muted-foreground underline underline-offset-4">Back to sign in</Link>
      </p>
    </form>
  );
}
