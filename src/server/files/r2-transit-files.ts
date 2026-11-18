import type { TransitFileAccess, TransitFileRead, TransitFileUpload } from "../../core/types.ts";
import type { R2BucketBinding, R2ObjectBinding } from "../cloudflare/cloudflare-bindings.ts";
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

export interface R2TransitFileOptions {
  bucket: R2BucketBinding;
  publicOrigin: string;
  ttlSeconds: number;
  maxBytes: number;
}

export class R2TransitFileService implements ITransitFileService {
  private readonly bucket: R2BucketBinding;
  private readonly publicOrigin: string;
  private readonly ttlMs: number;
  readonly maxBytes: number;

  constructor(options: R2TransitFileOptions) {
    this.bucket = options.bucket;
    this.publicOrigin = options.publicOrigin;
    this.ttlMs = options.ttlSeconds * 1000;
    this.maxBytes = options.maxBytes;
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

    await this.bucket.put(objectKey(fileId), file.stream(), {
      httpMetadata: { contentType: metadata.mimeType },
    });
    await this.bucket.put(metadataKey(fileId), JSON.stringify(metadata));

    return uploadResult(this.publicOrigin, fileId, metadata);
  }

  async read(fileId: string, access?: TransitFileAccess): Promise<TransitFileRead> {
    const { object, metadata } = await this.readObject(fileId, access);
    return transitFileRead(await object.arrayBuffer(), metadata);
  }

  async response(fileId: string, access?: TransitFileAccess): Promise<Response> {
    const { object, metadata } = await this.readObject(fileId, access);
    return transitFileResponse(object.body, metadata);
  }

  async delete(fileId: string, access?: TransitFileAccess): Promise<boolean> {
    assertSafeFileId(fileId);
    if (access !== undefined) {
      const metadata = await this.readMetadata(fileId);
      if (!metadata || !canAccessFile(metadata.scope, access)) return false;
    }
    const existing = await this.bucket.get(objectKey(fileId));
    await Promise.all([this.bucket.delete(objectKey(fileId)), this.bucket.delete(metadataKey(fileId))]);
    return existing != null;
  }

  async deleteByScope(scope: string): Promise<number> {
    return deleteScopedSidecarFiles(
      scope,
      async (cursor) => {
        const page = await this.bucket.list({ prefix: "transit/", ...(cursor ? { cursor } : {}) });
        return { keys: page.objects.map(({ key }) => key), cursor: page.truncated ? page.cursor : undefined };
      },
      async (fileId) => (await this.readMetadata(fileId))?.scope,
      (fileId) => Promise.all([this.bucket.delete(objectKey(fileId)), this.bucket.delete(metadataKey(fileId))]),
    );
  }

  async cleanupExpired(): Promise<void> {}

  private async readObject(
    fileId: string,
    access?: TransitFileAccess,
  ): Promise<{
    object: R2ObjectBinding;
    metadata: TransitFileMetadata;
  }> {
    assertSafeFileId(fileId);
    const [object, metadata] = await Promise.all([this.bucket.get(objectKey(fileId)), this.readMetadata(fileId)]);
    if (!object || !metadata || this.isExpired(metadata)) {
      await this.delete(fileId);
      throw new TransitFileError(404, "file_not_found", "Transit file was not found.");
    }

    assertFileAccess(metadata.scope, access);
    return { object, metadata };
  }

  private async readMetadata(fileId: string): Promise<TransitFileMetadata | undefined> {
    const metadata = await this.bucket.get(metadataKey(fileId));
    if (!metadata) {
      return undefined;
    }

    try {
      return normalizeMetadata(JSON.parse(await metadataText(metadata)) as Partial<TransitFileMetadata>);
    } catch {
      return undefined;
    }
  }

  private isExpired(metadata: TransitFileMetadata): boolean {
    return Date.now() - Date.parse(metadata.createdAt) > this.ttlMs;
  }
}

async function metadataText(metadata: { arrayBuffer(): Promise<ArrayBuffer> }): Promise<string> {
  return new TextDecoder().decode(await metadata.arrayBuffer());
}
