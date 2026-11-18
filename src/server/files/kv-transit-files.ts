import type { TransitFileAccess, TransitFileRead, TransitFileUpload } from "../../core/types.ts";
import type { KVNamespaceBinding } from "../cloudflare/cloudflare-bindings.ts";
import type { ITransitFileService, TransitFileMetadata } from "./transit-file-store.ts";

import {
  assertFileAccess,
  canAccessFile,
  deleteScopedSidecarFiles,
  assertFileSize,
  assertSafeFileId,
  contentTypeFromFileId,
  metadataKey,
  normalizeDescriptor,
  normalizeMetadata,
  objectKey,
  randomHex,
  safeExtension,
  TransitFileError,
  transitFileRead,
  transitFileResponse,
  uploadResult,
} from "./transit-file-store.ts";

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

export class KVTransitFileService implements ITransitFileService {
  private readonly namespace: KVNamespaceBinding;
  private readonly publicOrigin: string;
  private readonly ttlSeconds: number;
  readonly maxBytes: number;

  constructor(options: KVTransitFileOptions) {
    this.namespace = options.namespace;
    this.publicOrigin = options.publicOrigin;
    // This constructor is exported; a non-finite/fractional/non-positive value would slip
    // through the clamps below (NaN maxBytes silently disables the size check, NaN ttl yields
    // an invalid expirationTtl), so reject anything that is not a positive integer up front.
    this.ttlSeconds = Math.max(positiveInteger(options.ttlSeconds, "ttlSeconds"), KV_MIN_TTL_SECONDS);
    this.maxBytes = Math.min(positiveInteger(options.maxBytes, "maxBytes"), KV_MAX_VALUE_BYTES);
  }

  async create(file: File, options?: TransitFileAccess): Promise<TransitFileUpload> {
    assertFileSize(file.size, this.maxBytes);
    const fileId = `${randomHex(16)}${safeExtension(file.name)}`;
    const metadata: TransitFileMetadata = {
      ...normalizeDescriptor({ name: file.name || fileId, mimeType: file.type || contentTypeFromFileId(fileId) }),
      createdAt: new Date().toISOString(),
      sizeBytes: file.size,
      ...(options?.scope === undefined ? {} : { scope: options.scope }),
    };
    const buffer = await file.arrayBuffer();
    // KV applies its native TTL when the entry is written, so no cleanup pass is needed.
    await this.namespace.put(objectKey(fileId), buffer, {
      expirationTtl: this.ttlSeconds,
    });
    await this.namespace.put(metadataKey(fileId), JSON.stringify(metadata), {
      expirationTtl: this.ttlSeconds,
    });
    return uploadResult(this.publicOrigin, fileId, metadata);
  }

  async read(fileId: string, access?: TransitFileAccess): Promise<TransitFileRead> {
    const { buffer, metadata } = await this.readObject(fileId, access);
    return transitFileRead(buffer, metadata);
  }

  async response(fileId: string, access?: TransitFileAccess): Promise<Response> {
    const { buffer, metadata } = await this.readObject(fileId, access);
    return transitFileResponse(buffer, metadata);
  }

  async delete(fileId: string, access?: TransitFileAccess): Promise<boolean> {
    assertSafeFileId(fileId);
    if (access !== undefined) {
      const metadata = await this.readMetadata(fileId);
      if (!metadata || !canAccessFile(metadata.scope, access)) return false;
    }
    const existing = await this.namespace.get(objectKey(fileId), "arrayBuffer");
    await Promise.all([this.namespace.delete(objectKey(fileId)), this.namespace.delete(metadataKey(fileId))]);
    return existing != null;
  }

  async deleteByScope(scope: string): Promise<number> {
    return deleteScopedSidecarFiles(
      scope,
      async (cursor) => {
        const page = await this.namespace.list({ prefix: "transit/", ...(cursor ? { cursor } : {}) });
        return { keys: page.keys.map(({ name }) => name), cursor: page.list_complete ? undefined : page.cursor };
      },
      async (fileId) => (await this.readMetadata(fileId))?.scope,
      (fileId) => Promise.all([this.namespace.delete(objectKey(fileId)), this.namespace.delete(metadataKey(fileId))]),
    );
  }

  // KV expires entries through its native TTL without manual cleanup.
  async cleanupExpired(): Promise<void> {}

  private async readObject(
    fileId: string,
    access?: TransitFileAccess,
  ): Promise<{
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
    assertFileAccess(metadata.scope, access);
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
}

function positiveInteger(value: number, field: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new TypeError(`KVTransitFileService: "${field}" must be a positive integer (received ${value}).`);
  }
  return value;
}
