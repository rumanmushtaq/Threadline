"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Receipt } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { applyServerErrors } from "@/lib/form-errors";
import { expenseInputSchema, PAYMENT_LABEL, PAYMENT_METHODS, type ExpenseInput } from "@/lib/validation/expense";
import { addExpenseAction, addExpenseCategoryAction } from "./actions";

const NEW = "__new__";

/** "Add expense": fuel, rent, packaging... A new category can be made right in the form. */
export function AddExpense({ categories, currency, today }: { categories: { id: string; name: string }[]; currency: string; today: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [cats, setCats] = useState(categories);
  const [newCat, setNewCat] = useState<string | null>(null);
  const blank = { categoryId: "", amount: undefined, spentOn: today, paymentMethod: "cash", paidTo: "", note: "" } as unknown as ExpenseInput;
  const form = useForm<ExpenseInput>({ resolver: zodResolver(expenseInputSchema), defaultValues: blank });
  const errors = form.formState.errors;

  const createCategory = async () => {
    const res = await addExpenseCategoryAction({ name: newCat ?? "" });
    if (!res.ok) return void toast.error(res.error);
    setCats((c) => [...c, res.data].sort((a, b) => a.name.localeCompare(b.name)));
    form.setValue("categoryId", res.data.id, { shouldValidate: true });
    setNewCat(null);
  };

  const submit = form.handleSubmit(async (values) => {
    const res = await addExpenseAction(values);
    if (!res.ok) return applyServerErrors(res, form.setError);
    toast.success(`Expense ${res.data.expenseNumber} added`, { description: res.data.category });
    form.reset({ ...blank, spentOn: values.spentOn, paymentMethod: values.paymentMethod });
    setOpen(false);
    router.refresh();
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus /> Add expense
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="size-5" /> Add expense
          </DialogTitle>
          <DialogDescription>Money spent running the shop, like fuel, rent or packaging. Stock you buy is added with products, not here.</DialogDescription>
        </DialogHeader>
        <form id="add-expense" onSubmit={submit} className="space-y-4" noValidate>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="exp-category">Category</Label>
              <Controller
                control={form.control}
                name="categoryId"
                render={({ field }) => (
                  <Select value={field.value ?? ""} onValueChange={(v) => (v === NEW ? setNewCat("") : field.onChange(v))}>
                    <SelectTrigger id="exp-category" className="w-full" aria-invalid={!!errors.categoryId}>
                      <SelectValue placeholder="Choose" />
                    </SelectTrigger>
                    <SelectContent>
                      {cats.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                      <SelectSeparator />
                      <SelectItem value={NEW}>+ New category…</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.categoryId && <p className="text-xs text-destructive">{errors.categoryId.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="exp-amount">Amount</Label>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-3 grid place-items-center text-sm text-muted-foreground">{currency}</span>
                <Input id="exp-amount" type="number" min={0} step="0.01" inputMode="decimal" className="pl-11" aria-invalid={!!errors.amount} {...form.register("amount", { valueAsNumber: true })} />
              </div>
              {errors.amount && <p className="text-xs text-destructive">{errors.amount.message}</p>}
            </div>
          </div>

          {newCat !== null && (
            <div className="flex items-end gap-2 rounded-lg border bg-muted/40 p-3">
              <div className="flex-1 space-y-1.5">
                <Label htmlFor="exp-newcat">New category name</Label>
                <Input id="exp-newcat" autoFocus maxLength={40} placeholder="e.g. Stitching" value={newCat} onChange={(e) => setNewCat(e.target.value)} />
              </div>
              <Button type="button" variant="outline" onClick={() => setNewCat(null)}>
                Cancel
              </Button>
              <Button type="button" onClick={createCategory} disabled={(newCat ?? "").trim().length < 2}>
                Add
              </Button>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="exp-date">Date</Label>
              <Input id="exp-date" type="date" max={today} aria-invalid={!!errors.spentOn} {...form.register("spentOn")} />
              {errors.spentOn && <p className="text-xs text-destructive">{errors.spentOn.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="exp-method">Paid by</Label>
              <Controller
                control={form.control}
                name="paymentMethod"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="exp-method" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PAYMENT_METHODS.map((m) => (
                        <SelectItem key={m} value={m}>
                          {PAYMENT_LABEL[m]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="exp-paidto">Paid to (optional)</Label>
            <Input id="exp-paidto" maxLength={80} placeholder="e.g. PSO pump, TCS, landlord" {...form.register("paidTo")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="exp-note">Note (optional)</Label>
            <Input id="exp-note" maxLength={200} placeholder="e.g. delivery run to Gulberg" {...form.register("note")} />
            {errors.note && <p className="text-xs text-destructive">{errors.note.message}</p>}
          </div>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Close
          </Button>
          <Button type="submit" form="add-expense" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? "Saving…" : "Save expense"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
