"use client";

import { Copy, ExternalLink, Eye, EyeOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { useCan } from "@/components/app/permissions";
import { Button } from "@/components/ui/button";
import { setPublishedAction } from "../products/actions";

export function LinkRowActions({ productId, url, live, published, archived }: { productId: string; url: string; live: boolean; published: boolean; archived: boolean }) {
  const can = useCan();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div className="flex justify-end gap-1">
      <Button
        size="icon"
        variant="ghost"
        className="size-8"
        aria-label="Copy link"
        onClick={async () => {
          await navigator.clipboard.writeText(url);
          toast.success("Link copied");
        }}
      >
        <Copy />
      </Button>
      {live && (
        <Button size="icon" variant="ghost" className="size-8" asChild>
          <a href={url} target="_blank" rel="noreferrer" aria-label="Open public page">
            <ExternalLink />
          </a>
        </Button>
      )}
      {can("product.publish") && !archived && (
        <Button
          size="icon"
          variant="ghost"
          className="size-8"
          disabled={pending}
          aria-label={published ? "Unpublish" : "Publish"}
          onClick={() =>
            start(async () => {
              const res = await setPublishedAction({ id: productId, value: !published });
              if (res.ok) toast.success(published ? "Link hidden" : "Link live");
              else toast.error(res.error);
              router.refresh();
            })
          }
        >
          {published ? <EyeOff /> : <Eye />}
        </Button>
      )}
    </div>
  );
}
