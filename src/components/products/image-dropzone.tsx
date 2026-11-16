"use client";

import { ImagePlus, RefreshCw, Trash2, UploadCloud } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { IMAGE_MAX_BYTES, IMAGE_TYPES } from "@/lib/validation/product";
import { cn } from "@/lib/utils";

export function validateImageFile(file: File): string | null {
  if (!(IMAGE_TYPES as readonly string[]).includes(file.type)) return "Use a JPG, JPEG, PNG or WebP image.";
  if (file.size > IMAGE_MAX_BYTES) return "Images must be 8 MB or smaller.";
  return null;
}

export function ImageDropzone({
  value,
  onChange,
  error,
}: {
  value: File | null;
  onChange: (file: File | null) => void;
  error?: string;
}) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!value) return;
    const url = URL.createObjectURL(value);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- object URL must be created and revoked with the file
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [value]);

  const pick = (file: File | undefined) => {
    if (!file) return;
    const problem = validateImageFile(file);
    setLocalError(problem);
    if (!problem) onChange(file);
  };

  const shownError = localError ?? error;

  if (value && preview) {
    return (
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview */}
        <img src={preview} alt="Product preview" className="aspect-[4/5] w-full rounded-xl border object-cover sm:w-44" />
        <div className="space-y-3">
          <div>
            <p className="max-w-64 truncate text-sm font-medium">{value.name}</p>
            <p className="text-xs text-muted-foreground">{(value.size / 1024 / 1024).toFixed(2)} MB · used as the AI reference photo</p>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
              <RefreshCw /> Replace
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setPreview(null);
                onChange(null);
              }}
            >
              <Trash2 /> Remove
            </Button>
          </div>
        </div>
        <input ref={inputRef} type="file" accept={IMAGE_TYPES.join(",")} className="sr-only" onChange={(e) => pick(e.target.files?.[0])} />
      </div>
    );
  }

  return (
    <div>
      <label
        htmlFor={inputId}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          pick(e.dataTransfer.files?.[0]);
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-10 text-center transition",
          dragging ? "border-brand bg-brand/5" : "border-border hover:border-foreground/30 hover:bg-muted/40",
          shownError && "border-destructive/60",
        )}
      >
        <div className="grid size-12 place-items-center rounded-full bg-muted">
          {dragging ? <ImagePlus className="size-5" /> : <UploadCloud className="size-5 text-muted-foreground" />}
        </div>
        <div>
          <p className="text-sm font-medium">
            Drag the product photo here, or <span className="text-brand underline underline-offset-4">browse</span>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">JPG, JPEG, PNG or WebP · up to 8 MB · a clear, well-lit photo works best</p>
        </div>
      </label>
      <input
        id={inputId}
        ref={inputRef}
        type="file"
        accept={IMAGE_TYPES.join(",")}
        className="sr-only"
        onChange={(e) => pick(e.target.files?.[0])}
      />
      {shownError && <p className="mt-2 text-xs text-destructive">{shownError}</p>}
    </div>
  );
}
