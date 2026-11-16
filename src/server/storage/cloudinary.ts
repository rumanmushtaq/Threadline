import { createHash } from "node:crypto";
import type { StorageDriver, StoredObject } from "./index";

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

  /**
   * Lists every resource under a prefix with the Admin API, including raw and video files
   * (a signed image upload ticket could be replayed against those endpoints).
   */
  async *list(prefix: string): AsyncIterable<StoredObject> {
    const auth = `Basic ${Buffer.from(`${this.apiKey}:${this.apiSecret}`).toString("base64")}`;
    for (const type of ["image", "raw", "video"] as const) {
      let cursor: string | undefined;
      do {
        const qs = new URLSearchParams({ prefix, max_results: "500", ...(cursor ? { next_cursor: cursor } : {}) });
        // Admin API: GET /resources/{resource_type}/{delivery_type}?prefix=...
        const res = await fetch(`https://api.cloudinary.com/v1_1/${this.cloud}/resources/${type}/upload?${qs}`, {
          headers: { authorization: auth },
          signal: AbortSignal.timeout(60_000),
        });
        if (!res.ok) throw new Error(`Cloudinary list failed: HTTP ${res.status}`);
        const body = (await res.json()) as { resources?: { public_id: string; format?: string; created_at: string }[]; next_cursor?: string };
        for (const r of body.resources ?? []) {
          const key = type === "image" && r.format ? `${r.public_id}.${r.format}` : r.public_id;
          yield {
            // Raw and video files are never ours to keep: report them under a key nothing references.
            key: type === "image" ? key : `${type}:${key}`,
            createdAt: new Date(r.created_at),
            remove: () => this.call("destroy", { public_id: r.public_id, invalidate: "true" }, undefined, type).then(() => {}),
          };
        }
        cursor = body.next_cursor;
      } while (cursor);
    }
  }

  private async call(action: "upload" | "destroy", params: Record<string, string | number>, file?: Blob, resourceType: "image" | "raw" | "video" = "image") {
    const timestamp = Math.floor(Date.now() / 1000);
    const signed = { ...params, timestamp };
    const form = new FormData();
    for (const [k, v] of Object.entries(signed)) form.set(k, String(v));
    form.set("api_key", this.apiKey);
    form.set("signature", cloudinarySignature(signed, this.apiSecret));
    if (file) form.set("file", file);
    const res = await fetch(`https://api.cloudinary.com/v1_1/${this.cloud}/${resourceType}/${action}`, {
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
