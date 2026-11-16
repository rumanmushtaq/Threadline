"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { KeyRound, Loader2, Pencil, Plus, ShieldCheck, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { formatDate, timeAgo } from "@/lib/format";
import { applyServerErrors } from "@/lib/form-errors";
import { createUserAction, resetPasswordAction, setActiveAction, updateUserAction } from "./actions";

type SlotUser = {
  id: string;
  slot: number;
  role: "admin" | "staff";
  name: string;
  email: string;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
};

const passwordRule = z
  .string()
  .min(10, "Use at least 10 characters")
  .regex(/[A-Za-z]/, "Include a letter")
  .regex(/\d/, "Include a number");

type DialogState =
  | { mode: "create" }
  | { mode: "edit"; user: SlotUser }
  | { mode: "password"; user: SlotUser }
  | null;

export function UsersBoard({ slots, meId }: { slots: { slot: number; user: SlotUser | null }[]; meId: string }) {
  const [dialog, setDialog] = useState<DialogState>(null);
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const toggleActive = (user: SlotUser, isActive: boolean) =>
    startTransition(async () => {
      const res = await setActiveAction({ id: user.id, isActive });
      if (!res.ok) toast.error(res.error);
      else toast.success(isActive ? `${user.name} can sign in again` : `${user.name} was deactivated and signed out`);
      router.refresh();
    });

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        {slots.map(({ slot, user }) =>
          user ? (
            <Card key={slot} className={user.isActive ? "" : "opacity-70"}>
              <CardContent className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="grid size-10 place-items-center rounded-full bg-primary text-primary-foreground">
                      {user.role === "admin" ? <ShieldCheck className="size-5" /> : <UserRound className="size-5" />}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-medium">{user.name}</p>
                      <p className="truncate text-sm text-muted-foreground">{user.email}</p>
                    </div>
                  </div>
                  <Badge variant={user.role === "admin" ? "default" : "secondary"}>
                    {user.role === "admin" ? "Admin" : `User ${slot - 1}`}
                  </Badge>
                </div>
                <dl className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <dt className="text-muted-foreground">Last sign-in</dt>
                    <dd>{user.lastLoginAt ? timeAgo(user.lastLoginAt) : "Never"}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Created</dt>
                    <dd>{formatDate(user.createdAt)}</dd>
                  </div>
                </dl>
                <div className="flex flex-wrap items-center gap-2 border-t pt-4">
                  <Button size="sm" variant="outline" onClick={() => setDialog({ mode: "edit", user })}>
                    <Pencil /> Edit
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setDialog({ mode: "password", user })}>
                    <KeyRound /> Reset password
                  </Button>
                  {user.role !== "admin" && user.id !== meId && (
                    <label className="ml-auto flex items-center gap-2 text-sm">
                      <Switch
                        checked={user.isActive}
                        disabled={pending}
                        onCheckedChange={(v) => toggleActive(user, v)}
                        aria-label="Account active"
                      />
                      {user.isActive ? "Active" : "Inactive"}
                    </label>
                  )}
                </div>
              </CardContent>
            </Card>
          ) : (
            <button
              key={slot}
              type="button"
              onClick={() => setDialog({ mode: "create" })}
              className="flex min-h-44 flex-col items-center justify-center gap-2 rounded-xl border border-dashed text-sm text-muted-foreground transition hover:border-brand hover:text-foreground"
            >
              <Plus className="size-5" />
              <span className="font-medium">Add User {slot - 1}</span>
              <span className="text-xs">Free account slot</span>
            </button>
          ),
        )}
      </div>

      <UserDialog state={dialog} onClose={() => setDialog(null)} onDone={() => router.refresh()} />
    </>
  );
}

function UserDialog({ state, onClose, onDone }: { state: DialogState; onClose: () => void; onDone: () => void }) {
  return (
    <Dialog open={!!state} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        {state?.mode === "create" && <CreateForm onClose={onClose} onDone={onDone} />}
        {state?.mode === "edit" && <EditForm user={state.user} onClose={onClose} onDone={onDone} />}
        {state?.mode === "password" && <PasswordForm user={state.user} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function Field({ id, label, error, ...props }: React.ComponentProps<typeof Input> & { label: string; error?: string }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} aria-invalid={!!error} {...props} />
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

const createSchema = z.object({ name: z.string().trim().min(2, "Enter a name"), email: z.email("Enter a valid email"), password: passwordRule });

function CreateForm({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const form = useForm({ resolver: zodResolver(createSchema), defaultValues: { name: "", email: "", password: "" } });
  const { errors, isSubmitting } = form.formState;
  const submit = form.handleSubmit(async (values) => {
    const res = await createUserAction(values);
    if (!res.ok) return applyServerErrors(res, form.setError);
    toast.success(`Account created in slot ${res.data.slot}`);
    onDone();
    onClose();
  });
  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <DialogHeader>
        <DialogTitle>Add a user</DialogTitle>
        <DialogDescription>Users can add products and stock. They cannot delete data or manage settings.</DialogDescription>
      </DialogHeader>
      <Field id="name" label="Full name" error={errors.name?.message} {...form.register("name")} />
      <Field id="email" label="Email" type="email" autoComplete="off" error={errors.email?.message} {...form.register("email")} />
      <Field id="password" label="Temporary password" type="password" autoComplete="new-password" error={errors.password?.message} {...form.register("password")} />
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={isSubmitting}>{isSubmitting && <Loader2 className="animate-spin" />} Create account</Button>
      </DialogFooter>
    </form>
  );
}

const editSchema = z.object({ name: z.string().trim().min(2, "Enter a name"), email: z.email("Enter a valid email") });

function EditForm({ user, onClose, onDone }: { user: SlotUser; onClose: () => void; onDone: () => void }) {
  const form = useForm({ resolver: zodResolver(editSchema), defaultValues: { name: user.name, email: user.email } });
  const { errors, isSubmitting } = form.formState;
  const submit = form.handleSubmit(async (values) => {
    const res = await updateUserAction({ id: user.id, ...values });
    if (!res.ok) return applyServerErrors(res, form.setError);
    toast.success("Account updated");
    onDone();
    onClose();
  });
  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <DialogHeader>
        <DialogTitle>Edit account</DialogTitle>
        <DialogDescription>Slot {user.slot} · {user.role === "admin" ? "Admin" : "User"}</DialogDescription>
      </DialogHeader>
      <Field id="name" label="Full name" error={errors.name?.message} {...form.register("name")} />
      <Field id="email" label="Email" type="email" error={errors.email?.message} {...form.register("email")} />
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={isSubmitting}>{isSubmitting && <Loader2 className="animate-spin" />} Save</Button>
      </DialogFooter>
    </form>
  );
}

const passwordSchema = z.object({ password: passwordRule });

function PasswordForm({ user, onClose }: { user: SlotUser; onClose: () => void }) {
  const form = useForm({ resolver: zodResolver(passwordSchema), defaultValues: { password: "" } });
  const { errors, isSubmitting } = form.formState;
  const submit = form.handleSubmit(async (values) => {
    const res = await resetPasswordAction({ id: user.id, ...values });
    if (!res.ok) return applyServerErrors(res, form.setError);
    toast.success(`Password changed. ${user.name} was signed out everywhere.`);
    onClose();
  });
  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <DialogHeader>
        <DialogTitle>Reset password</DialogTitle>
        <DialogDescription>{user.name} will be signed out of all devices.</DialogDescription>
      </DialogHeader>
      <Field id="password" label="New password" type="password" autoComplete="new-password" error={errors.password?.message} {...form.register("password")} />
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={isSubmitting}>{isSubmitting && <Loader2 className="animate-spin" />} Reset password</Button>
      </DialogFooter>
    </form>
  );
}
