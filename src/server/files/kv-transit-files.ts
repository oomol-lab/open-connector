import type { KVNamespaceBinding } from "../cloudflare/cloudflare-bindings.ts";
import type { ITransitFileService, TransitFileRead, TransitFileUpload } from "./transit-file-store.ts";

import { extname } from "node:path";
import { contentTypeFromFileId, TransitFileError } from "./transit-file-store.ts";

// Workers KV rejects an `expirationTtl` below 60 seconds.
const KV_MIN_TTL_SECONDS = 60;
// Workers KV rejects any single value larger than 25 MiB.
const KV_MAX_VALUE_BYTES = 25 * 1024 * 1024;

export interface KVTransitFileOptions {
  namespace: KVNamespaceBinding;
  publicOrigin: string;
  // Requested TTL in seconds. Values below KV's 60s minimum are clamped up to 60.
  ttlSeconds: number;
  // Requested max upload size in bytes. Clamped down to KV's 25 MiB per-value limit.
  maxBytes: number;
}

interface TransitFileMetadata {
  name: string;
  mimeType: string;
  createdAt: string;
  sizeBytes: number;
}

export class KVTransitFileService implements ITransitFileService {
  private readonly namespace: KVNamespaceBinding;
  private readonly publicOrigin: string;
  private readonly ttlSeconds: number;
  readonly maxBytes: number;

  constructor(options: KVTransitFileOptions) {
    this.namespace = options.namespace;
    this.publicOrigin = options.publicOrigin.replace(/\/+$/, "");
    // This constructor is exported; a non-finite/fractional/non-positive value would slip
    // through the clamps below (NaN maxBytes silently disables the size check, NaN ttl yields
    // an invalid expirationTtl), so reject anything that is not a positive integer up front.
    this.ttlSeconds = Math.max(positiveInteger(options.ttlSeconds, "ttlSeconds"), KV_MIN_TTL_SECONDS);
    this.maxBytes = Math.min(positiveInteger(options.maxBytes, "maxBytes"), KV_MAX_VALUE_BYTES);
  }

  async create(file: File): Promise<TransitFileUpload> {
    this.assertFileSize(file.size);
    const fileId = `${randomHex(16)}${safeExtension(file.name)}`;
    const metadata: TransitFileMetadata = {
      name: file.name || fileId,
      mimeType: file.type || contentTypeFromFileId(fileId),
      createdAt: new Date().toISOString(),
      sizeBytes: file.size,
    };
    const buffer = await file.arrayBuffer();
    // KV 原生 TTL：写入时直接指定过期时间，无需 cleanupExpired
    await this.namespace.put(objectKey(fileId), buffer, {
      expirationTtl: this.ttlSeconds,
    });
    await this.namespace.put(metadataKey(fileId), JSON.stringify(metadata), {
      expirationTtl: this.ttlSeconds,
    });
    return {
      fileId,
      downloadUrl: `${this.publicOrigin}/api/files/${encodeURIComponent(fileId)}`,
      sizeBytes: metadata.sizeBytes,
      name: metadata.name,
      mimeType: metadata.mimeType,
    };
  }

  async read(fileId: string): Promise<TransitFileRead> {
    const { buffer, metadata } = await this.readObject(fileId);
    return {
      file: new File([buffer], metadata.name, { type: metadata.mimeType }),
      sizeBytes: metadata.sizeBytes,
      name: metadata.name,
      mimeType: metadata.mimeType,
    };
  }

  async response(fileId: string): Promise<Response> {
    const { buffer, metadata } = await this.readObject(fileId);
    return new Response(buffer, {
      headers: {
        "content-length": String(metadata.sizeBytes),
        "content-type": metadata.mimeType,
        "content-disposition": `attachment; filename="${escapeHeaderValue(metadata.name)}"`,
      },
    });
  }

  async delete(fileId: string): Promise<boolean> {
    assertSafeFileId(fileId);
    const existing = await this.namespace.get(objectKey(fileId), "arrayBuffer");
    await Promise.all([this.namespace.delete(objectKey(fileId)), this.namespace.delete(metadataKey(fileId))]);
    return existing != null;
  }

  // KV 依赖原生 TTL 自动过期，无需手动清理
  async cleanupExpired(): Promise<void> {}

  private async readObject(fileId: string): Promise<{
    buffer: ArrayBuffer;
    metadata: TransitFileMetadata;
  }> {
    assertSafeFileId(fileId);
    const [buffer, metadata] = await Promise.all([
      this.namespace.get(objectKey(fileId), "arrayBuffer"),
      this.readMetadata(fileId),
    ]);
    // Workers KV is eventually consistent: a partial miss may be a not-yet-propagated
    // write rather than a genuinely absent file. Never delete on miss (native TTL handles
    // cleanup), otherwise a transient read turns into permanent data loss.
    if (!buffer || !metadata) {
      throw new TransitFileError(404, "file_not_found", "Transit file was not found.");
    }
    return { buffer, metadata };
  }

  private async readMetadata(fileId: string): Promise<TransitFileMetadata | undefined> {
    const raw = await this.namespace.get(metadataKey(fileId), "text");
    if (!raw) return undefined;
    try {
      return normalizeMetadata(JSON.parse(raw) as Partial<TransitFileMetadata>);
    } catch {
      return undefined;
    }
  }

  private assertFileSize(size: number): void {
    if (size > this.maxBytes) {
      throw new TransitFileError(413, "file_too_large", `Transit file must be ${this.maxBytes} bytes or smaller.`);
    }
  }
}

// 以下工具函数与 r2-transit-files.ts 保持一致
function objectKey(fileId: string): string {
  return `transit/${fileId}`;
}
function metadataKey(fileId: string): string {
  return `transit/${fileId}.meta.json`;
}
function assertSafeFileId(fileId: string): void {
  if (!/^[a-f0-9]{32}(?:\.[a-z0-9]{1,16})?$/.test(fileId)) {
    throw new TransitFileError(404, "file_not_found", "Transit file was not found.");
  }
}
function positiveInteger(value: number, field: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new TypeError(`KVTransitFileService: "${field}" must be a positive integer (received ${value}).`);
  }
  return value;
}
function escapeHeaderValue(value: string): string {
  return value.replace(/["\\\r\n]/g, "_");
}
function safeExtension(name: string): string {
  const extension = extname(name).toLowerCase();
  return /^\.[a-z0-9]{1,16}$/.test(extension) ? extension : "";
}
function randomHex(byteLength: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
function normalizeMetadata(input: Partial<TransitFileMetadata>): TransitFileMetadata {
  return {
    name: typeof input.name === "string" && input.name.trim() ? input.name.trim() : "file",
    mimeType:
      typeof input.mimeType === "string" && input.mimeType.trim() ? input.mimeType.trim() : "application/octet-stream",
    createdAt: typeof input.createdAt === "string" && input.createdAt ? input.createdAt : new Date().toISOString(),
    sizeBytes: typeof input.sizeBytes === "number" && Number.isFinite(input.sizeBytes) ? input.sizeBytes : 0,
  };
}
