"use client";

import { Archive, ArchiveRestore, ChevronDown, Copy, ExternalLink, Eye, EyeOff, Pencil, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
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
import { regenerateImagesAction, setArchivedAction, setPublishedAction } from "../actions";

export function ProductActions(props: {
  id: string;
  name: string;
  archived: boolean;
  published: boolean;
  publicUrl: string;
  aiBusy: boolean;
  providers: { name: ProviderName; label: string }[];
}) {
  const can = useCan();
  const router = useRouter();
  const [pending, start] = useTransition();

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
    </div>
  );
}
