// src/server/files/kv-transit-files.ts
import type { KVNamespaceBinding } from "../cloudflare/cloudflare-bindings.ts";
import type { ITransitFileService, TransitFileRead, TransitFileUpload } from "./transit-file-store.ts";
import { extname } from "node:path";
import { contentTypeFromFileId, TransitFileError } from "./transit-file-store.ts";

export interface KVTransitFileOptions {
  namespace: KVNamespaceBinding;
  publicOrigin: string;
  ttlSeconds: number;
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
    this.ttlSeconds = options.ttlSeconds;
    this.maxBytes = options.maxBytes;
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
    await Promise.all([
      this.namespace.delete(objectKey(fileId)),
      this.namespace.delete(metadataKey(fileId)),
    ]);
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
    if (!buffer || !metadata) {
      await this.delete(fileId);
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
function escapeHeaderValue(value: string): string {
  return value.replace(/["\\\\n]/g, "_");
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
    mimeType: typeof input.mimeType === "string" && input.mimeType.trim() ? input.mimeType.trim() : "application/octet-stream",
    createdAt: typeof input.createdAt === "string" && input.createdAt ? input.createdAt : new Date().toISOString(),
    sizeBytes: typeof input.sizeBytes === "number" && Number.isFinite(input.sizeBytes) ? input.sizeBytes : 0,
  };
}
