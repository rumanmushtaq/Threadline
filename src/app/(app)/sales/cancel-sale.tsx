"use client";

import { Undo2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { cancelShopSaleAction } from "./actions";

export function CancelSale({ id, number, quantity }: { id: string; number: string; quantity: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = () =>
    start(async () => {
      const res = await cancelShopSaleAction({ id });
      if (!res.ok) return void toast.error(res.error);
      toast.success(`Sale ${res.data.saleNumber} cancelled`, { description: `${quantity} piece${quantity === 1 ? "" : "s"} back in stock` });
      router.refresh();
    });
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="sm" disabled={pending} aria-label={`Cancel sale ${number}`}>
          <Undo2 /> Cancel
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cancel sale {number}?</AlertDialogTitle>
          <AlertDialogDescription>
            Use this for a mistake or a return. {quantity} piece{quantity === 1 ? " goes" : "s go"} back into stock and the sale stops counting in sales and profit. It stays in the list as cancelled.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep sale</AlertDialogCancel>
          <AlertDialogAction onClick={run}>Cancel sale</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
