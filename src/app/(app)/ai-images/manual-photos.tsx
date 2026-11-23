"use client";

import { ImagePlus, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { useCan } from "@/components/app/permissions";
import { validateImageFile } from "@/components/products/image-dropzone";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { IMAGE_TYPES } from "@/lib/validation/product";
import { uploadPhoto } from "../products/[id]/upload-photo";

/** The by-hand alternative to AI photos: pick a product, add your own model or detail photos. */
export function ManualPhotos({ products, logoOn }: { products: { id: string; sku: string; name: string }[]; logoOn: boolean }) {
  const can = useCan();
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [productId, setProductId] = useState("");
  const [approveNow, setApproveNow] = useState(true);
  const [busy, setBusy] = useState<{ done: number; total: number } | null>(null);
  const canReview = can("photo.review");
  if (!can("photo.upload")) return null;

  const upload = async (files: FileList | null) => {
    const list = [...(files ?? [])];
    if (input.current) input.current.value = "";
    if (!list.length || !productId) return;
    const good = list.filter((f) => {
      const err = validateImageFile(f);
      if (err) toast.error(`${f.name}: ${err}`);
      return !err;
    });
    let added = 0;
    setBusy({ done: 0, total: good.length });
    for (const [i, f] of good.entries()) {
      const res = await uploadPhoto(productId, f, canReview && approveNow);
      if (res.ok) added++;
      else toast.error(`${f.name}: ${res.error}`);
      setBusy({ done: i + 1, total: good.length });
    }
    setBusy(null);
    if (added) {
      toast.success(`${added} photo${added === 1 ? "" : "s"} added`, {
        description: canReview && approveNow ? "Customers can see them now." : "An admin checks them before customers see them.",
        action: { label: "Open product", onClick: () => router.push(`/products/${productId}#photos`) },
      });
      setOpen(false);
      router.refresh();
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <ImagePlus /> Add photos by hand
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add photos by hand</DialogTitle>
          <DialogDescription>
            Use your own model or detail photos instead of AI ones.{logoOn ? " Your logo is added to the copies customers see." : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="manual-product">Product</Label>
            <Select value={productId} onValueChange={setProductId}>
              <SelectTrigger id="manual-product" className="w-full">
                <SelectValue placeholder="Choose a product" />
              </SelectTrigger>
              <SelectContent>
                {products.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} <span className="font-mono text-xs text-muted-foreground">{p.sku}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {canReview && (
            <div className="flex items-center gap-2">
              <Checkbox id="manual-approve" checked={approveNow} onCheckedChange={(v) => setApproveNow(v === true)} />
              <Label htmlFor="manual-approve" className="font-normal">
                Show to customers right away
              </Label>
            </div>
          )}
          <input ref={input} type="file" multiple accept={IMAGE_TYPES.join(",")} className="sr-only" aria-label="Choose photos" onChange={(e) => upload(e.target.files)} />
        </div>
        <DialogFooter>
          <Button disabled={!productId || !!busy} onClick={() => input.current?.click()}>
            {busy ? <Loader2 className="animate-spin" /> : <ImagePlus />}
            {busy ? `Uploading ${Math.min(busy.done + 1, busy.total)} of ${busy.total}…` : "Choose photos"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
