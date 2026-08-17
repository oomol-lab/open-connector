import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from "@aws-sdk/client-s3";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
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
    expect([...storage.objects.keys()]).toEqual([`transit/${upload.fileId}`]);

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

  it("streams a staged file into S3 with its known content length", async () => {
    const storage = new MemoryS3();
    const service = createService(storage.client);
    const root = await mkdtemp(join(tmpdir(), "connect-s3-transit-"));
    const path = join(root, "upload.tmp");
    await writeFile(path, "staged payload");

    try {
      const upload = await service.createFromPath({
        path,
        sizeBytes: 14,
        name: "report.txt",
        mimeType: "text/plain",
      });

      const objectPut = storage.send.mock.calls
        .map(([command]) => command)
        .find((command) => command instanceof PutObjectCommand && command.input.Key === `transit/${upload.fileId}`);
      expect(objectPut).toBeInstanceOf(PutObjectCommand);
      if (!(objectPut instanceof PutObjectCommand)) {
        throw new Error("Object upload command was not sent.");
      }
      expect(objectPut.input.Body).toBeInstanceOf(Readable);
      expect(objectPut.input.ContentLength).toBe(14);
      await expect(service.read(upload.fileId).then((stored) => stored.file.text())).resolves.toBe("staged payload");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
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

  it("stores and restores a Unicode file name from S3 object metadata", async () => {
    const storage = new MemoryS3();
    const service = createService(storage.client);
    const upload = await service.create(new File(["invoice"], "发票.pdf", { type: "application/pdf" }));

    expect(storage.objects.size).toBe(1);
    await expect(service.read(upload.fileId).then((stored) => stored.name)).resolves.toBe("发票.pdf");
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
  readonly objects = new Map<string, MemoryS3Object>();
  readonly client = new S3Client({
    region: "us-east-1",
    credentials: { accessKeyId: "test", secretAccessKey: "test" },
  });
  readonly send = vi.fn(async (command: object): Promise<object> => {
    if (command instanceof PutObjectCommand) {
      this.objects.set(command.input.Key!, {
        bytes: await bytes(command.input.Body),
        contentType: command.input.ContentType,
        metadata: command.input.Metadata,
        lastModified: new Date(),
      });
      return {};
    }
    if (command instanceof GetObjectCommand) {
      const value = this.objects.get(command.input.Key!);
      if (!value) {
        throw notFound();
      }
      return {
        Body: body(value.bytes),
        ContentLength: value.bytes.byteLength,
        ContentType: value.contentType,
        LastModified: value.lastModified,
        Metadata: value.metadata,
      };
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

interface MemoryS3Object {
  bytes: Uint8Array;
  contentType?: string;
  metadata?: Record<string, string>;
  lastModified: Date;
}

async function bytes(value: unknown): Promise<Uint8Array> {
  if (typeof value === "string") {
    return new TextEncoder().encode(value);
  }
  if (value instanceof Uint8Array) {
    return Uint8Array.from(value);
  }
  if (value instanceof Readable) {
    const chunks: Uint8Array[] = [];
    for await (const chunk of value) {
      chunks.push(typeof chunk === "string" ? new TextEncoder().encode(chunk) : Uint8Array.from(chunk));
    }
    const size = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
    const output = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      output.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return output;
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
