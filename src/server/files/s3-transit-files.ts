import type { ITransitFileService, TransitFileRead, TransitFileUpload } from "./transit-file-store.ts";
import type { GetObjectCommandOutput } from "@aws-sdk/client-s3";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from "@aws-sdk/client-s3";
import { randomBytes } from "node:crypto";
import { extname } from "node:path";
import { contentDispositionForFileName, contentTypeFromFileId, TransitFileError } from "./transit-file-store.ts";

export interface S3TransitFileOptions {
  client: S3Client;
  bucket: string;
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

export class S3TransitFileService implements ITransitFileService {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicOrigin: string;
  private readonly ttlMs: number;
  readonly maxBytes: number;

  constructor(options: S3TransitFileOptions) {
    this.client = options.client;
    this.bucket = options.bucket;
    this.publicOrigin = options.publicOrigin.replace(/\/+$/, "");
    this.ttlMs = options.ttlSeconds * 1000;
    this.maxBytes = options.maxBytes;
  }

  async create(file: File): Promise<TransitFileUpload> {
    this.assertFileSize(file.size);
    const fileId = `${randomBytes(16).toString("hex")}${safeExtension(file.name)}`;
    const metadata = normalizeMetadata({
      name: file.name || fileId,
      mimeType: file.type || contentTypeFromFileId(fileId),
      createdAt: new Date().toISOString(),
      sizeBytes: file.size,
    });

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: objectKey(fileId),
        Body: new Uint8Array(await file.arrayBuffer()),
        ContentLength: file.size,
        ContentType: metadata.mimeType,
      }),
    );
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: metadataKey(fileId),
        Body: JSON.stringify(metadata),
        ContentType: "application/json",
      }),
    );

    return {
      fileId,
      downloadUrl: `${this.publicOrigin}/api/files/${encodeURIComponent(fileId)}`,
      sizeBytes: metadata.sizeBytes,
      name: metadata.name,
      mimeType: metadata.mimeType,
    };
  }

  async read(fileId: string): Promise<TransitFileRead> {
    const { object, metadata } = await this.readObject(fileId);
    return {
      file: new File([Uint8Array.from(await object.Body!.transformToByteArray())], metadata.name, {
        type: metadata.mimeType,
      }),
      sizeBytes: metadata.sizeBytes,
      name: metadata.name,
      mimeType: metadata.mimeType,
    };
  }

  async response(fileId: string): Promise<Response> {
    const { object, metadata } = await this.readObject(fileId);
    return new Response(object.Body!.transformToWebStream(), {
      headers: {
        "content-length": String(metadata.sizeBytes),
        "content-type": metadata.mimeType,
        "content-disposition": contentDispositionForFileName(metadata.name),
      },
    });
  }

  async delete(fileId: string): Promise<boolean> {
    assertSafeFileId(fileId);
    const existing = await this.objectExists(fileId);
    await Promise.all([
      this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: objectKey(fileId) })),
      this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: metadataKey(fileId) })),
    ]);
    return existing;
  }

  async cleanupExpired(): Promise<void> {}

  private async readObject(fileId: string): Promise<{
    object: GetObjectCommandOutput;
    metadata: TransitFileMetadata;
  }> {
    assertSafeFileId(fileId);
    const [object, metadata] = await Promise.all([this.getObject(objectKey(fileId)), this.readMetadata(fileId)]);
    if (!object?.Body || !metadata || this.isExpired(metadata)) {
      await this.delete(fileId);
      throw new TransitFileError(404, "file_not_found", "Transit file was not found.");
    }

    return { object, metadata };
  }

  private async readMetadata(fileId: string): Promise<TransitFileMetadata | undefined> {
    const object = await this.getObject(metadataKey(fileId));
    if (!object?.Body) {
      return undefined;
    }

    try {
      return normalizeMetadata(JSON.parse(await object.Body.transformToString()) as Partial<TransitFileMetadata>);
    } catch {
      return undefined;
    }
  }

  private async getObject(key: string): Promise<GetObjectCommandOutput | undefined> {
    try {
      return await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    } catch (error) {
      if (isNotFound(error)) {
        return undefined;
      }
      throw error;
    }
  }

  private async objectExists(fileId: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: objectKey(fileId) }));
      return true;
    } catch (error) {
      if (isNotFound(error)) {
        return false;
      }
      throw error;
    }
  }

  private assertFileSize(size: number): void {
    if (size > this.maxBytes) {
      throw new TransitFileError(413, "file_too_large", `Transit file must be ${this.maxBytes} bytes or smaller.`);
    }
  }

  private isExpired(metadata: TransitFileMetadata): boolean {
    return Date.now() - Date.parse(metadata.createdAt) > this.ttlMs;
  }
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

function safeExtension(name: string): string {
  const extension = extname(name).toLowerCase();
  return /^\.[a-z0-9]{1,16}$/.test(extension) ? extension : "";
}

function isNotFound(error: unknown): boolean {
  return (
    error instanceof S3ServiceException &&
    (error.$metadata.httpStatusCode === 404 || error.name === "NoSuchKey" || error.name === "NotFound")
  );
}
