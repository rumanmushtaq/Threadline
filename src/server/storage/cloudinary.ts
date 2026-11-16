import { createHash } from "node:crypto";
import type { StorageDriver } from "./index";

/** Cloudinary signature: sorted "k=v" pairs joined by "&", plus the API secret, SHA-1 hex. */
export function cloudinarySignature(params: Record<string, string | number>, apiSecret: string) {
  const payload = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
  return createHash("sha1").update(payload + apiSecret).digest("hex");
}

/** Storage keys keep their extension; Cloudinary's public_id is the key without it. */
export function toPublicId(key: string) {
  return key.replace(/\.[a-z0-9]+$/i, "");
}

/**
 * Cloudinary image storage. Uploads keep the original bytes (no incoming transformation),
 * so original product photos are never altered.
 */
export class CloudinaryStorage implements StorageDriver {
  constructor(
    private cloud: string,
    private apiKey: string,
    private apiSecret: string,
  ) {}

  private async call(action: "upload" | "destroy", params: Record<string, string | number>, file?: Blob) {
    const timestamp = Math.floor(Date.now() / 1000);
    const signed = { ...params, timestamp };
    const form = new FormData();
    for (const [k, v] of Object.entries(signed)) form.set(k, String(v));
    form.set("api_key", this.apiKey);
    form.set("signature", cloudinarySignature(signed, this.apiSecret));
    if (file) form.set("file", file);
    const res = await fetch(`https://api.cloudinary.com/v1_1/${this.cloud}/image/${action}`, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(60_000),
    });
    const body = (await res.json().catch(() => ({}))) as { error?: { message?: string }; result?: string };
    if (!res.ok) throw new Error(`Cloudinary ${action} failed: ${body.error?.message ?? `HTTP ${res.status}`}`);
    return body;
  }

  async put(key: string, body: Buffer, contentType: string) {
    await this.call(
      "upload",
      { public_id: toPublicId(key), overwrite: "false", unique_filename: "false" },
      new Blob([new Uint8Array(body)], { type: contentType }),
    );
  }

  async get(key: string) {
    const res = await fetch(this.url(key), { signal: AbortSignal.timeout(60_000) });
    if (!res.ok) throw new Error(`Cloudinary download failed: HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }

  async delete(key: string) {
    await this.call("destroy", { public_id: toPublicId(key), invalidate: "true" });
  }

  url(key: string) {
    // Delivering with the stored extension returns the file in its original format.
    return `https://res.cloudinary.com/${this.cloud}/image/upload/${key}`;
  }
}
