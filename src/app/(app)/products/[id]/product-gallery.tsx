"use client";

import { AlertCircle, Download, Loader2, Sparkles } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

type Img = { id: string; kind: "original" | "ai_model" | "marketing"; url: string; thumbUrl: string; variant: number };
type Job = { status: "pending" | "processing" | "completed" | "failed"; attempts: number; maxAttempts: number; lastError: string | null } | null;

const KIND_LABEL = { original: "Original", ai_model: "AI photo", marketing: "Marketing card" } as const;

export function ProductGallery({ images, job }: { images: Img[]; job: Job }) {
  const ordered = [...images].sort((a, b) => order(a.kind) - order(b.kind));
  const [activeId, setActiveId] = useState(ordered[0]?.id);
  const active = ordered.find((i) => i.id === activeId) ?? ordered[0];
  const busy = job?.status === "pending" || job?.status === "processing";

  return (
    <section className="rounded-xl border bg-card p-4">
      <div className="relative overflow-hidden rounded-lg bg-muted">
        {active ? (
          // eslint-disable-next-line @next/next/no-img-element -- storage URL
          <img src={active.url} alt={KIND_LABEL[active.kind]} className="mx-auto max-h-[560px] w-auto object-contain" />
        ) : (
          <div className="aspect-[4/5]" />
        )}
        {active && (
          <div className="absolute top-3 left-3 flex gap-2">
            <span className="rounded-full bg-background/90 px-2.5 py-1 text-xs font-medium backdrop-blur">{KIND_LABEL[active.kind]}</span>
          </div>
        )}
        {active && (
          <a
            href={active.url}
            download
            className="absolute top-3 right-3 grid size-8 place-items-center rounded-full bg-background/90 backdrop-blur hover:bg-background"
            aria-label="Download image"
          >
            <Download className="size-4" />
          </a>
        )}
      </div>
      <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
        {ordered.map((img) => (
          <button
            key={img.id}
            type="button"
            onClick={() => setActiveId(img.id)}
            className={cn("shrink-0 overflow-hidden rounded-md border-2", img.id === active?.id ? "border-brand" : "border-transparent")}
            aria-label={`Show ${KIND_LABEL[img.kind]}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- storage URL */}
            <img src={img.thumbUrl} alt="" className="h-20 w-16 object-cover" />
          </button>
        ))}
        {busy &&
          [0, 1].map((i) => (
            <div key={i} className="grid h-20 w-16 shrink-0 animate-pulse place-items-center rounded-md bg-muted">
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            </div>
          ))}
      </div>
      {busy && (
        <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
          <Sparkles className="size-4 text-brand" /> AI model photos are being generated
          {job && job.attempts > 1 ? ` (attempt ${job.attempts} of ${job.maxAttempts})` : ""}. This page updates when you reload.
        </p>
      )}
      {job?.status === "failed" && (
        <p className="mt-3 flex items-start gap-2 rounded-lg bg-destructive/5 p-3 text-sm text-destructive">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <span>
            AI generation failed after {job.attempts} attempts{job.lastError ? `: ${job.lastError}` : "."} The product is not affected — use
            “Regenerate AI images” to try again.
          </span>
        </p>
      )}
    </section>
  );
}

function order(kind: Img["kind"]) {
  return kind === "marketing" ? 0 : kind === "ai_model" ? 1 : 2;
}
