import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { CloudinaryStorage } from "./cloudinary";

export interface StorageDriver {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  /** Browser-reachable URL for a stored object. */
  url(key: string): string;
}

const SAFE_KEY = /^[a-z0-9][a-z0-9/_.-]*$/i;

export function assertSafeKey(key: string) {
  if (!SAFE_KEY.test(key) || key.includes("..")) throw new Error(`Unsafe storage key: ${key}`);
}

class LocalStorage implements StorageDriver {
  constructor(private root: string) {}
  private file(key: string) {
    assertSafeKey(key);
    return path.join(this.root, key);
  }
  async put(key: string, body: Buffer) {
    const f = this.file(key);
    await mkdir(path.dirname(f), { recursive: true });
    await writeFile(f, body);
  }
  get(key: string) {
    return readFile(this.file(key));
  }
  async delete(key: string) {
    await rm(this.file(key), { force: true });
  }
  url(key: string) {
    return `/api/files/${key}`;
  }
}

class S3Storage implements StorageDriver {
  private client: S3Client;
  constructor(
    private bucket: string,
    private publicUrl: string,
  ) {
    this.client = new S3Client({
      region: process.env.S3_REGION || "auto",
      endpoint: process.env.S3_ENDPOINT || undefined,
      // Supabase Storage and MinIO need path-style URLs.
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID!,
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
      },
    });
  }
  async put(key: string, body: Buffer, contentType: string) {
    assertSafeKey(key);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        // Keys are unique per upload, so objects never change.
        CacheControl: "public, max-age=31536000, immutable",
      }),
    );
  }
  async get(key: string) {
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    return Buffer.from(await res.Body!.transformToByteArray());
  }
  async delete(key: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
  url(key: string) {
    return `${this.publicUrl.replace(/\/$/, "")}/${key}`;
  }
}

let driver: StorageDriver | undefined;

export function storage(): StorageDriver {
  if (driver) return driver;
  if (process.env.STORAGE_DRIVER === "cloudinary") {
    const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;
    if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
      throw new Error("CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET are required");
    }
    driver = new CloudinaryStorage(CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET);
  } else if (process.env.STORAGE_DRIVER === "s3") {
    const { S3_BUCKET, S3_PUBLIC_URL } = process.env;
    if (!S3_BUCKET || !S3_PUBLIC_URL) throw new Error("S3_BUCKET and S3_PUBLIC_URL are required for s3 storage");
    driver = new S3Storage(S3_BUCKET, S3_PUBLIC_URL);
  } else {
    // Local disk is for development only; keep it out of deployment file tracing.
    driver = new LocalStorage(path.resolve(/*turbopackIgnore: true*/ process.env.LOCAL_STORAGE_DIR || "./storage"));
  }
  return driver;
}

export function fileUrl(key: string | null | undefined) {
  return key ? storage().url(key) : null;
}
