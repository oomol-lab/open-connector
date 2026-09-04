import type { TransitFileRead, TransitFileUpload } from "../../core/types.ts";
import type { IStagedTransitFileService, StagedTransitFile, TransitFileInfo } from "./transit-file-store.ts";
import type { GetObjectCommandOutput } from "@aws-sdk/client-s3";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from "@aws-sdk/client-s3";
import { createReadStream } from "node:fs";
import {
  assertFileSize,
  assertSafeFileId,
  contentTypeFromFileId,
  normalizeDescriptor,
  objectKey,
  randomHex,
  safeExtension,
  TransitFileError,
  transitFileRead,
  transitFileResponse,
  uploadResult,
} from "./transit-file-store.ts";

export interface S3TransitFileOptions {
  client: S3Client;
  bucket: string;
  publicOrigin: string;
  ttlSeconds: number;
  maxBytes: number;
}

export interface S3TransitFileCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
}

/** S3 client settings as the Node server reads them from OOMOL_CONNECT_S3_*. */
export interface S3TransitClientOptions {
  region: string;
  endpoint?: string;
  forcePathStyle: boolean;
  credentials?: S3TransitFileCredentials;
}

/**
 * Build the S3 client for the transit-file backend. Checksum calculation stays opt-in so S3-compatible stores
 * without CRC support keep working. The server imports this module only when OOMOL_CONNECT_TRANSIT_FILE_BACKEND=s3,
 * so the AWS SDK stays out of the default startup graph.
 */
export function createS3TransitClient(options: S3TransitClientOptions): S3Client {
  return new S3Client({
    region: options.region,
    endpoint: options.endpoint,
    forcePathStyle: options.forcePathStyle,
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
    credentials: options.credentials,
  });
}

export class S3TransitFileService implements IStagedTransitFileService {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicOrigin: string;
  private readonly ttlMs: number;
  readonly maxBytes: number;

  constructor(options: S3TransitFileOptions) {
    this.client = options.client;
    this.bucket = options.bucket;
    this.publicOrigin = options.publicOrigin;
    this.ttlMs = options.ttlSeconds * 1000;
    this.maxBytes = options.maxBytes;
  }

  async create(file: File): Promise<TransitFileUpload> {
    assertFileSize(file.size, this.maxBytes);
    const fileId = `${randomHex(16)}${safeExtension(file.name)}`;
    const metadata = {
      ...normalizeDescriptor({ name: file.name || fileId, mimeType: file.type || contentTypeFromFileId(fileId) }),
      sizeBytes: file.size,
    };

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: objectKey(fileId),
        Body: new Uint8Array(await file.arrayBuffer()),
        ContentLength: file.size,
        ContentType: metadata.mimeType,
        Metadata: { filename: encodeFileName(metadata.name) },
      }),
    );

    return uploadResult(this.publicOrigin, fileId, metadata);
  }

  async createFromPath(file: StagedTransitFile): Promise<TransitFileUpload> {
    assertFileSize(file.sizeBytes, this.maxBytes);
    const fileId = `${randomHex(16)}${safeExtension(file.name)}`;
    const metadata = {
      ...normalizeDescriptor({ name: file.name || fileId, mimeType: file.mimeType || contentTypeFromFileId(fileId) }),
      sizeBytes: file.sizeBytes,
    };

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: objectKey(fileId),
        Body: createReadStream(file.path),
        ContentLength: file.sizeBytes,
        ContentType: metadata.mimeType,
        Metadata: { filename: encodeFileName(metadata.name) },
      }),
    );

    return uploadResult(this.publicOrigin, fileId, metadata);
  }

  async read(fileId: string): Promise<TransitFileRead> {
    const { object, metadata } = await this.readObject(fileId);
    return transitFileRead(Uint8Array.from(await object.Body!.transformToByteArray()), metadata);
  }

  async response(fileId: string): Promise<Response> {
    const { object, metadata } = await this.readObject(fileId);
    return transitFileResponse(object.Body!.transformToWebStream(), metadata);
  }

  async delete(fileId: string): Promise<boolean> {
    assertSafeFileId(fileId);
    const existing = await this.objectExists(fileId);
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: objectKey(fileId) }));
    return existing;
  }

  async cleanupExpired(): Promise<void> {}

  private async readObject(fileId: string): Promise<{
    object: GetObjectCommandOutput;
    metadata: TransitFileInfo;
  }> {
    assertSafeFileId(fileId);
    const object = await this.getObject(objectKey(fileId));
    if (!object?.Body || !object.LastModified || this.isExpired(object.LastModified)) {
      await this.delete(fileId);
      throw new TransitFileError(404, "file_not_found", "Transit file was not found.");
    }

    return {
      object,
      metadata: {
        ...normalizeDescriptor({
          name: decodeFileName(object.Metadata?.filename) ?? fileId,
          mimeType: object.ContentType || contentTypeFromFileId(fileId),
        }),
        sizeBytes: object.ContentLength ?? 0,
      },
    };
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

  private isExpired(lastModified: Date): boolean {
    return Date.now() - lastModified.getTime() > this.ttlMs;
  }
}

function encodeFileName(name: string): string {
  return Buffer.from(name, "utf8").toString("base64url");
}

function decodeFileName(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  const name = Buffer.from(value, "base64url").toString("utf8");
  return name || undefined;
}

function isNotFound(error: unknown): boolean {
  return (
    error instanceof S3ServiceException &&
    (error.$metadata.httpStatusCode === 404 || error.name === "NoSuchKey" || error.name === "NotFound")
  );
}
