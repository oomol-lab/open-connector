import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from "@aws-sdk/client-s3";
import { describe, expect, it, vi } from "vitest";
import { S3TransitFileService } from "./s3-transit-files.ts";

describe("S3TransitFileService", () => {
  it("shares transit files across service instances", async () => {
    const storage = new MemoryS3();
    const first = createService(storage.client);
    const second = createService(storage.client);

    const upload = await first.create(new File(["hello transit"], "report.TXT", { type: "text/plain" }));
    expect(upload.fileId).toMatch(/^[a-f0-9]{32}\.txt$/);
    expect(upload.downloadUrl).toBe(`http://localhost:3000/api/files/${upload.fileId}`);
    expect(upload).toMatchObject({
      sizeBytes: 13,
      name: "report.TXT",
      mimeType: "text/plain",
    });

    const read = await second.read(upload.fileId);
    expect(read).toMatchObject({
      sizeBytes: 13,
      name: "report.TXT",
      mimeType: "text/plain",
    });
    await expect(read.file.text()).resolves.toBe("hello transit");

    const response = await second.response(upload.fileId);
    expect(response.headers.get("content-length")).toBe("13");
    expect(response.headers.get("content-type")).toBe("text/plain");
    await expect(response.text()).resolves.toBe("hello transit");

    await expect(second.delete(upload.fileId)).resolves.toBe(true);
    await expect(first.delete(upload.fileId)).resolves.toBe(false);
    await expect(first.read(upload.fileId)).rejects.toMatchObject({ status: 404, code: "file_not_found" });
  });

  it("rejects files over the configured limit", async () => {
    const storage = new MemoryS3();
    const service = createService(storage.client, { maxBytes: 4 });

    await expect(service.create(new File(["12345"], "large.bin"))).rejects.toMatchObject({
      status: 413,
      code: "file_too_large",
    });
    expect(storage.objects.size).toBe(0);
  });

  it("deletes expired files when they are read", async () => {
    const storage = new MemoryS3();
    const service = createService(storage.client, { ttlSeconds: -1 });
    const upload = await service.create(new File(["old"], "old.txt"));

    await expect(service.read(upload.fileId)).rejects.toMatchObject({ status: 404, code: "file_not_found" });
    expect(storage.objects.size).toBe(0);
  });

  it("treats malformed metadata as not found", async () => {
    const storage = new MemoryS3();
    const service = createService(storage.client);
    const upload = await service.create(new File(["broken"], "broken.txt"));
    storage.objects.set(`transit/${upload.fileId}.meta.json`, new TextEncoder().encode("{"));

    await expect(service.read(upload.fileId)).rejects.toMatchObject({ status: 404, code: "file_not_found" });
  });

  it("rejects malformed file ids without touching S3", async () => {
    const storage = new MemoryS3();
    const service = createService(storage.client);

    await expect(service.read("../secret")).rejects.toMatchObject({ status: 404, code: "file_not_found" });
    await expect(service.delete("transit/evil")).rejects.toMatchObject({ status: 404, code: "file_not_found" });
    expect(storage.send).not.toHaveBeenCalled();
  });
});

function createService(
  client: S3Client,
  options: { ttlSeconds?: number; maxBytes?: number } = {},
): S3TransitFileService {
  return new S3TransitFileService({
    client,
    bucket: "transit-files",
    publicOrigin: "http://localhost:3000",
    ttlSeconds: options.ttlSeconds ?? 60,
    maxBytes: options.maxBytes ?? 1024 * 1024,
  });
}

class MemoryS3 {
  readonly objects = new Map<string, Uint8Array>();
  readonly client = new S3Client({
    region: "us-east-1",
    credentials: { accessKeyId: "test", secretAccessKey: "test" },
  });
  readonly send = vi.fn(async (command: object): Promise<object> => {
    if (command instanceof PutObjectCommand) {
      this.objects.set(command.input.Key!, bytes(command.input.Body));
      return {};
    }
    if (command instanceof GetObjectCommand) {
      const value = this.objects.get(command.input.Key!);
      if (!value) {
        throw notFound();
      }
      return { Body: body(value) };
    }
    if (command instanceof HeadObjectCommand) {
      if (!this.objects.has(command.input.Key!)) {
        throw notFound();
      }
      return {};
    }
    if (command instanceof DeleteObjectCommand) {
      this.objects.delete(command.input.Key!);
      return {};
    }
    throw new Error(`Unexpected S3 command: ${command.constructor.name}`);
  });

  constructor() {
    this.client.send = this.send as typeof this.client.send;
  }
}

function bytes(value: unknown): Uint8Array {
  if (typeof value === "string") {
    return new TextEncoder().encode(value);
  }
  if (value instanceof Uint8Array) {
    return Uint8Array.from(value);
  }
  throw new TypeError("Unexpected S3 body.");
}

function body(value: Uint8Array): {
  transformToByteArray(): Promise<Uint8Array>;
  transformToString(): Promise<string>;
  transformToWebStream(): ReadableStream;
} {
  return {
    async transformToByteArray() {
      return Uint8Array.from(value);
    },
    async transformToString() {
      return new TextDecoder().decode(value);
    },
    transformToWebStream() {
      return new Blob([Uint8Array.from(value)]).stream();
    },
  };
}

function notFound(): S3ServiceException {
  return new S3ServiceException({
    name: "NoSuchKey",
    $fault: "client",
    $metadata: { httpStatusCode: 404 },
  });
}
