import type { R2BucketBinding, R2ObjectBinding } from "../cloudflare/cloudflare-bindings.ts";

import { describe, expect, it } from "vitest";
import { R2TransitFileService } from "./r2-transit-files.ts";
import { TransitFileError } from "./transit-file-store.ts";

describe("R2TransitFileService", () => {
  it("uploads, reads, and deletes transit files", async () => {
    const bucket = new MemoryR2Bucket();
    const service = createService(bucket);

    const upload = await service.create(new File(["hello transit"], "report.TXT", { type: "text/plain" }));
    expect(upload.fileId).toMatch(/^[a-f0-9]{32}\.txt$/);
    expect(upload.downloadUrl).toBe(`http://localhost:3000/api/files/${upload.fileId}`);
    expect(upload).toMatchObject({
      sizeBytes: 13,
      name: "report.TXT",
      mimeType: "text/plain",
    });

    const read = await service.read(upload.fileId);
    expect(read).toMatchObject({
      sizeBytes: 13,
      name: "report.TXT",
      mimeType: "text/plain",
    });
    await expect(read.file.text()).resolves.toBe("hello transit");

    const response = await service.response(upload.fileId);
    expect(response.headers.get("content-type")).toBe("text/plain");
    await expect(response.text()).resolves.toBe("hello transit");

    await expect(service.delete(upload.fileId)).resolves.toBe(true);
    await expect(service.delete(upload.fileId)).resolves.toBe(false);
    await expect(service.read(upload.fileId)).rejects.toMatchObject({ status: 404, code: "file_not_found" });
  });

  it("rejects files over the configured limit", async () => {
    const service = createService(new MemoryR2Bucket(), { maxBytes: 4 });

    await expect(service.create(new File(["12345"], "large.bin"))).rejects.toMatchObject({
      status: 413,
      code: "file_too_large",
    });
  });

  it("treats expired files as not found", async () => {
    const service = createService(new MemoryR2Bucket(), { ttlSeconds: -1 });
    const upload = await service.create(new File(["old"], "old.txt"));

    await expect(service.read(upload.fileId)).rejects.toBeInstanceOf(TransitFileError);
    await expect(service.read(upload.fileId)).rejects.toMatchObject({ status: 404 });
  });

  it("treats malformed metadata as not found", async () => {
    const bucket = new MemoryR2Bucket();
    const service = createService(bucket);
    const upload = await service.create(new File(["broken"], "broken.txt"));
    await bucket.put(`transit/${upload.fileId}.meta.json`, "{");

    await expect(service.read(upload.fileId)).rejects.toMatchObject({ status: 404 });
  });
});

function createService(
  bucket: MemoryR2Bucket,
  options: { ttlSeconds?: number; maxBytes?: number } = {},
): R2TransitFileService {
  return new R2TransitFileService({
    bucket,
    publicOrigin: "http://localhost:3000",
    ttlSeconds: options.ttlSeconds ?? 60,
    maxBytes: options.maxBytes ?? 1024 * 1024,
  });
}

class MemoryR2Bucket implements R2BucketBinding {
  private readonly objects = new Map<string, MemoryR2Object>();

  async put(
    key: string,
    value: ReadableStream | ArrayBuffer | ArrayBufferView | string | Blob,
    options?: { httpMetadata?: { contentType?: string }; customMetadata?: Record<string, string> },
  ): Promise<unknown> {
    this.objects.set(
      key,
      new MemoryR2Object(await toArrayBuffer(value), options?.httpMetadata, options?.customMetadata),
    );
    return {};
  }

  async get(key: string): Promise<R2ObjectBinding | null> {
    return this.objects.get(key) ?? null;
  }

  async delete(key: string): Promise<void> {
    this.objects.delete(key);
  }
}

class MemoryR2Object implements R2ObjectBinding {
  readonly body: ReadableStream;
  readonly httpMetadata?: { contentType?: string };
  readonly customMetadata?: Record<string, string>;

  private readonly bytes: ArrayBuffer;

  constructor(bytes: ArrayBuffer, httpMetadata?: { contentType?: string }, customMetadata?: Record<string, string>) {
    this.bytes = bytes;
    this.body = new Blob([bytes]).stream();
    this.httpMetadata = httpMetadata;
    this.customMetadata = customMetadata;
  }

  async arrayBuffer(): Promise<ArrayBuffer> {
    return this.bytes.slice(0);
  }
}

async function toArrayBuffer(
  value: ReadableStream | ArrayBuffer | ArrayBufferView | string | Blob,
): Promise<ArrayBuffer> {
  if (typeof value === "string") {
    return new TextEncoder().encode(value).buffer;
  }
  if (value instanceof Blob) {
    return await value.arrayBuffer();
  }
  if (value instanceof ArrayBuffer) {
    return value.slice(0);
  }
  if (ArrayBuffer.isView(value)) {
    const bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    return new Uint8Array(bytes).buffer;
  }

  return await new Response(value).arrayBuffer();
}
