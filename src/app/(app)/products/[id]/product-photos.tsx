"use client";

import { Check, EyeOff, ImagePlus, Loader2, ShieldCheck, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { useCan } from "@/components/app/permissions";
import { validateImageFile } from "@/components/products/image-dropzone";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { IMAGE_TYPES } from "@/lib/validation/product";
import { addPhotoAction, deletePhotoAction, preparePhotoUploadAction, reviewPhotoAction } from "./photo-actions";

export type PhotoItem = {
  id: string;
  kind: "original" | "ai_model" | "marketing" | "photo";
  review: "pending" | "approved" | "hidden";
  thumbUrl: string;
};

const KIND_LABEL = { original: "First photo", ai_model: "AI photo", marketing: "Marketing card", photo: "Added photo" } as const;
const REVIEW = {
  approved: { label: "Customers see it", cls: "bg-success/15 text-success" },
  pending: { label: "Waiting for check", cls: "bg-warning/20 text-foreground" },
  hidden: { label: "Hidden", cls: "bg-muted text-muted-foreground" },
} as const;

/** Upload one file: straight to Cloudinary when it is set up, else through the server. */
async function uploadOne(productId: string, file: File, approveNow: boolean) {
  const fd = new FormData();
  fd.set("productId", productId);
  fd.set("approveNow", String(approveNow));
  const ticket = await preparePhotoUploadAction();
  if (!ticket.ok) return ticket;
  if (ticket.data.mode === "cloudinary") {
    const up = new FormData();
    for (const [k, v] of Object.entries(ticket.data.fields)) up.set(k, v);
    up.set("file", file);
    const r = await fetch(ticket.data.uploadUrl, { method: "POST", body: up }).catch(() => null);
    const body = (await r?.json().catch(() => null)) as { public_id?: string; format?: string; error?: { message?: string } } | null;
    if (!r?.ok || !body?.public_id || !body.format) {
      return { ok: false as const, error: body?.error?.message ?? "The photo could not be uploaded. Check your connection and try again." };
    }
    fd.set("upload", JSON.stringify({ publicId: body.public_id, format: body.format, expires: ticket.data.expires, token: ticket.data.token }));
  } else {
    fd.set("image", file);
  }
  return addPhotoAction(fd);
}

/** Add photos by hand and decide which ones customers see. */
export function ProductPhotos({ productId, photos, archived }: { productId: string; photos: PhotoItem[]; archived: boolean }) {
  const can = useCan();
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<{ done: number; total: number } | null>(null);
  const [approveNow, setApproveNow] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [, start] = useTransition();
  const canReview = can("photo.review");
  const pending = photos.filter((p) => p.review === "pending").length;
  const shown = photos.filter((p) => p.review === "approved").length;

  const pick = async (files: FileList | null) => {
    const list = [...(files ?? [])];
    if (input.current) input.current.value = "";
    if (!list.length) return;
    const bad = list.map((f) => [f, validateImageFile(f)] as const).filter(([, e]) => e);
    for (const [f, e] of bad) toast.error(`${f.name}: ${e}`);
    const good = list.filter((f) => !validateImageFile(f));
    setUploading({ done: 0, total: good.length });
    let added = 0;
    for (const [i, file] of good.entries()) {
      const res = await uploadOne(productId, file, canReview && approveNow);
      if (res.ok) added++;
      else toast.error(`${file.name}: ${res.error}`);
      setUploading({ done: i + 1, total: good.length });
    }
    setUploading(null);
    if (added) {
      toast.success(`${added} photo${added === 1 ? "" : "s"} added`, {
        description: canReview && approveNow ? "Customers can see them now." : "An admin needs to check them before customers see them.",
      });
      router.refresh();
    }
  };

  const act = (id: string, fn: () => Promise<{ ok: boolean; error?: string }>, done: string) => {
    setBusyId(id);
    start(async () => {
      const res = await fn();
      setBusyId(null);
      if (!res.ok) return void toast.error(res.error);
      toast.success(done);
      router.refresh();
    });
  };

  return (
    <section className="rounded-xl border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
        <div>
          <h2 className="font-medium">Photos</h2>
          <p className="text-sm text-muted-foreground">
            {shown} shown to customers{pending ? ` · ${pending} waiting for check` : ""}. Customers only see photos marked “Customers see it”.
          </p>
        </div>
        {can("photo.upload") && !archived && (
          <div className="flex flex-wrap items-center gap-3">
            {canReview && (
              <div className="flex items-center gap-2">
                <Checkbox id="approve-now" checked={approveNow} onCheckedChange={(v) => setApproveNow(v === true)} />
                <Label htmlFor="approve-now" className="text-sm font-normal">
                  Show to customers right away
                </Label>
              </div>
            )}
            <input ref={input} type="file" multiple accept={IMAGE_TYPES.join(",")} className="sr-only" aria-label="Choose photos" onChange={(e) => pick(e.target.files)} />
            <Button onClick={() => input.current?.click()} disabled={!!uploading}>
              {uploading ? <Loader2 className="animate-spin" /> : <ImagePlus />}
              {uploading ? `Uploading ${uploading.done + 1} of ${uploading.total}…` : "Add photos"}
            </Button>
          </div>
        )}
      </div>

      <ul className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-4">
        {photos.map((p) => (
          <li key={p.id} className={`overflow-hidden rounded-lg border ${p.review === "hidden" ? "opacity-60" : ""}`}>
            {/* eslint-disable-next-line @next/next/no-img-element -- storage URL */}
            <img src={p.thumbUrl} alt={KIND_LABEL[p.kind]} className="aspect-[4/5] w-full bg-muted object-cover" />
            <div className="space-y-2 p-2.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-muted-foreground">{KIND_LABEL[p.kind]}</span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${REVIEW[p.review].cls}`}>{REVIEW[p.review].label}</span>
              </div>
              {canReview && (
                <div className="flex flex-wrap gap-1">
                  {p.review !== "approved" && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busyId === p.id}
                      onClick={() => act(p.id, () => reviewPhotoAction({ id: p.id, productId, review: "approved" }), "Photo approved: customers can see it")}
                    >
                      {p.review === "pending" ? <ShieldCheck /> : <Check />} {p.review === "pending" ? "Approve" : "Show"}
                    </Button>
                  )}
                  {p.review !== "hidden" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busyId === p.id}
                      onClick={() => act(p.id, () => reviewPhotoAction({ id: p.id, productId, review: "hidden" }), "Photo hidden from customers")}
                    >
                      <EyeOff /> Hide
                    </Button>
                  )}
                  {p.kind === "photo" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      disabled={busyId === p.id}
                      aria-label="Delete photo"
                      onClick={() => {
                        if (confirm("Delete this photo for good?")) act(p.id, () => deletePhotoAction({ id: p.id }), "Photo deleted");
                      }}
                    >
                      <Trash2 />
                    </Button>
                  )}
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
