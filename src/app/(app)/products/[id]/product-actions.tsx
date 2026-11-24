"use client";

import { Archive, ArchiveRestore, ChevronDown, Copy, ExternalLink, Eye, EyeOff, Pencil, Sparkles, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { useCan } from "@/components/app/permissions";
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { ProviderName } from "@/server/ai/provider";
import { deleteProductAction, regenerateImagesAction, setArchivedAction, setPublishedAction } from "../actions";
import { Input } from "@/components/ui/input";

export function ProductActions(props: {
  id: string;
  name: string;
  archived: boolean;
  published: boolean;
  publicUrl: string;
  aiBusy: boolean;
  providers: { name: ProviderName; label: string }[];
  sku: string;
  /** Orders and shop sales that keep this product from being deleted. */
  history: { orders: number; sales: number };
}) {
  const can = useCan();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirmSku, setConfirmSku] = useState("");
  const deletable = props.history.orders === 0 && props.history.sales === 0;

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, success: string) =>
    start(async () => {
      const res = await fn();
      if (res.ok) toast.success(success);
      else toast.error(res.error);
      router.refresh();
    });

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={async () => {
          await navigator.clipboard.writeText(props.publicUrl);
          toast.success("Public link copied", { description: props.publicUrl });
        }}
      >
        <Copy /> Copy link
      </Button>
      {props.published && !props.archived && (
        <Button variant="outline" size="sm" asChild>
          <a href={props.publicUrl} target="_blank" rel="noreferrer">
            <ExternalLink /> Open page
          </a>
        </Button>
      )}
      {can("ai.regenerate") &&
        props.providers.length > 0 &&
        (props.providers.length > 1 ? (
          // Several image services set up: pick one, e.g. the paid one when the free result misses details.
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" disabled={pending || props.aiBusy || props.archived}>
                <Sparkles /> {props.aiBusy ? "Generating…" : "Regenerate AI images"} <ChevronDown />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {props.providers.map((p) => (
                <DropdownMenuItem key={p.name} onSelect={() => run(() => regenerateImagesAction({ id: props.id, provider: p.name }), `Queued with ${p.label}`)}>
                  {p.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <Button
            variant="outline"
            size="sm"
            disabled={pending || props.aiBusy || props.archived}
            onClick={() => run(() => regenerateImagesAction({ id: props.id }), "AI photo generation queued")}
          >
            <Sparkles /> {props.aiBusy ? "Generating…" : "Regenerate AI images"}
          </Button>
        ))}
      {can("product.publish") && !props.archived && (
        <Button
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() =>
            run(
              () => setPublishedAction({ id: props.id, value: !props.published }),
              props.published ? "Public page hidden" : "Product published",
            )
          }
        >
          {props.published ? <EyeOff /> : <Eye />} {props.published ? "Unpublish" : "Publish"}
        </Button>
      )}
      {can("product.edit") && (
        <Button size="sm" asChild>
          <Link href={`/products/${props.id}/edit`}>
            <Pencil /> Edit
          </Link>
        </Button>
      )}
      {can("product.archive") && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" size="sm" disabled={pending}>
              {props.archived ? <ArchiveRestore /> : <Archive />} {props.archived ? "Restore" : "Archive"}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{props.archived ? "Restore this product?" : "Archive this product?"}</AlertDialogTitle>
              <AlertDialogDescription>
                {props.archived
                  ? `${props.name} will appear in the product list again. Its public page stays as it was.`
                  : `${props.name} will be hidden from the product list and its public page will stop working. Stock history and orders are kept. You can restore it any time.`}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() =>
                  run(() => setArchivedAction({ id: props.id, value: !props.archived }), props.archived ? "Product restored" : "Product archived")
                }
              >
                {props.archived ? "Restore" : "Archive"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
      {can("product.delete") && (
        <AlertDialog onOpenChange={() => setConfirmSku("")}>
          <AlertDialogTrigger asChild>
            <Button variant="outline" size="sm" disabled={pending} className="text-destructive hover:text-destructive">
              <Trash2 /> Delete
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{deletable ? `Delete ${props.name} for good?` : "This product can't be deleted"}</AlertDialogTitle>
              <AlertDialogDescription asChild>
                {deletable ? (
                  <div className="space-y-3">
                    <p>
                      This removes the product, its sizes and stock entries, its photos and its public link. <strong>It cannot be undone.</strong> To only hide it, use
                      Archive instead.
                    </p>
                    <label className="block space-y-1.5 text-foreground">
                      <span className="text-sm">
                        Type <span className="font-mono font-semibold">{props.sku}</span> to confirm
                      </span>
                      <Input value={confirmSku} onChange={(e) => setConfirmSku(e.target.value)} autoComplete="off" placeholder={props.sku} aria-label="Type the SKU to confirm" />
                    </label>
                  </div>
                ) : (
                  <p>
                    It has {props.history.sales} shop sale{props.history.sales === 1 ? "" : "s"} and {props.history.orders} order line{props.history.orders === 1 ? "" : "s"}, so it is
                    part of your sales and profit history. Deleting it would change those totals. Archive it instead: it disappears from the shop and lists, and
                    the history stays correct.
                  </p>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{deletable ? "Cancel" : "Close"}</AlertDialogCancel>
              {deletable && (
                <AlertDialogAction
                  variant="destructive"
                  disabled={confirmSku.trim().toUpperCase() !== props.sku.toUpperCase()}
                  onClick={() =>
                    start(async () => {
                      const res = await deleteProductAction({ id: props.id });
                      if (!res.ok) return void toast.error(res.error);
                      toast.success(`${props.sku} deleted`);
                      router.push("/products");
                      router.refresh();
                    })
                  }
                >
                  <Trash2 /> Delete for good
                </AlertDialogAction>
              )}
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
