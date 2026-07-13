import type { KVNamespaceBinding } from "../cloudflare/cloudflare-bindings.ts";

import { describe, expect, it } from "vitest";
import { KVTransitFileService } from "./kv-transit-files.ts";
import { TransitFileError } from "./transit-file-store.ts";

describe("KVTransitFileService", () => {
  it("uploads, reads, and deletes transit files", async () => {
    const namespace = new MemoryKVNamespace();
    const service = createService(namespace);

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
    expect(response.headers.get("content-length")).toBe("13");
    await expect(response.text()).resolves.toBe("hello transit");

    await expect(service.delete(upload.fileId)).resolves.toBe(true);
    await expect(service.delete(upload.fileId)).resolves.toBe(false);
    await expect(service.read(upload.fileId)).rejects.toMatchObject({ status: 404, code: "file_not_found" });
  });

  it("rejects files over the configured limit", async () => {
    const service = createService(new MemoryKVNamespace(), { maxBytes: 4 });

    await expect(service.create(new File(["12345"], "large.bin"))).rejects.toMatchObject({
      status: 413,
      code: "file_too_large",
    });
  });

  it("writes both keys with KV native expirationTtl", async () => {
    const namespace = new MemoryKVNamespace();
    const service = createService(namespace, { ttlSeconds: 120 });

    const upload = await service.create(new File(["ttl"], "ttl.txt"));

    expect(namespace.entry(`transit/${upload.fileId}`)?.expirationTtl).toBe(120);
    expect(namespace.entry(`transit/${upload.fileId}.meta.json`)?.expirationTtl).toBe(120);
  });

  it("clamps a sub-minimum ttl up to KV's 60 second floor", async () => {
    const namespace = new MemoryKVNamespace();
    const service = createService(namespace, { ttlSeconds: 10 });

    const upload = await service.create(new File(["short"], "short.txt"));

    expect(namespace.entry(`transit/${upload.fileId}`)?.expirationTtl).toBe(60);
  });

  it("clamps maxBytes down to KV's 25 MiB per-value limit", () => {
    const service = createService(new MemoryKVNamespace(), { maxBytes: 100 * 1024 * 1024 });

    expect(service.maxBytes).toBe(25 * 1024 * 1024);
  });

  it("does not delete the surviving key on a partial (eventually consistent) miss", async () => {
    const namespace = new MemoryKVNamespace();
    const service = createService(namespace);
    const upload = await service.create(new File(["payload"], "payload.txt"));

    // Simulate the metadata write not having propagated yet.
    await namespace.delete(`transit/${upload.fileId}.meta.json`);

    await expect(service.read(upload.fileId)).rejects.toMatchObject({ status: 404 });
    // The object key must survive so a later, fully-propagated read can succeed.
    expect(namespace.has(`transit/${upload.fileId}`)).toBe(true);
  });

  it("treats malformed metadata as not found", async () => {
    const namespace = new MemoryKVNamespace();
    const service = createService(namespace);
    const upload = await service.create(new File(["broken"], "broken.txt"));
    await namespace.put(`transit/${upload.fileId}.meta.json`, "{");

    await expect(service.read(upload.fileId)).rejects.toBeInstanceOf(TransitFileError);
    await expect(service.read(upload.fileId)).rejects.toMatchObject({ status: 404 });
  });

  it("fills safe defaults for partial-but-valid metadata", async () => {
    const namespace = new MemoryKVNamespace();
    const service = createService(namespace);
    const upload = await service.create(new File(["body"], "orig.txt", { type: "text/plain" }));
    // Valid JSON, but missing every descriptive field.
    await namespace.put(
      `transit/${upload.fileId}.meta.json`,
      JSON.stringify({ createdAt: "2020-01-01T00:00:00.000Z" }),
    );

    const read = await service.read(upload.fileId);
    expect(read).toMatchObject({ name: "file", mimeType: "application/octet-stream", sizeBytes: 0 });
  });

  it("infers the mime type from the extension when the file has no type", async () => {
    const namespace = new MemoryKVNamespace();
    const service = createService(namespace);

    const upload = await service.create(new File(["{}"], "data.json"));

    expect(upload.mimeType).toBe("application/json");
    await expect(service.read(upload.fileId).then((r) => r.mimeType)).resolves.toBe("application/json");
  });

  it("rejects malformed file ids without touching storage (path-traversal guard)", async () => {
    const service = createService(new MemoryKVNamespace());

    for (const badId of ["../secret", "transit/evil", "ABCDEF", "not-hex", `${"a".repeat(32)}.exe/../x`]) {
      await expect(service.read(badId)).rejects.toMatchObject({ status: 404, code: "file_not_found" });
      await expect(service.delete(badId)).rejects.toMatchObject({ status: 404, code: "file_not_found" });
    }
  });

  it("keeps ordinary letters while escaping quotes, backslashes, and control bytes in the filename header", async () => {
    const namespace = new MemoryKVNamespace();
    const service = createService(namespace);

    // Includes a quote, backslash, CR and LF around ordinary letters (notably "n").
    const upload = await service.create(new File(["ok"], 'a"b\\c\rd\ne.txt'));
    const response = await service.response(upload.fileId);

    // A regex bug here previously replaced the letter "n" and let control bytes through.
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="a_b_c_d_e.txt"');
  });

  it("rejects non-integer, non-positive, or non-finite ttl/maxBytes at construction", () => {
    // NaN maxBytes would otherwise slip past Math.min and disable the size check entirely.
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, 0, -1, 1.5]) {
      expect(() => createService(new MemoryKVNamespace(), { maxBytes: bad })).toThrow(TypeError);
      expect(() => createService(new MemoryKVNamespace(), { ttlSeconds: bad })).toThrow(TypeError);
    }
    // A valid-but-out-of-range value is still accepted and clamped, not rejected.
    expect(() => createService(new MemoryKVNamespace(), { ttlSeconds: 10, maxBytes: 500 * 1024 * 1024 })).not.toThrow();
  });
});

function createService(
  namespace: MemoryKVNamespace,
  options: { ttlSeconds?: number; maxBytes?: number } = {},
): KVTransitFileService {
  return new KVTransitFileService({
    namespace,
    publicOrigin: "http://localhost:3000",
    ttlSeconds: options.ttlSeconds ?? 60,
    maxBytes: options.maxBytes ?? 1024 * 1024,
  });
}

interface StoredValue {
  bytes: ArrayBuffer;
  expirationTtl?: number;
}

class MemoryKVNamespace implements KVNamespaceBinding {
  private readonly store = new Map<string, StoredValue>();

  async put(
    key: string,
    value: string | ArrayBuffer | ArrayBufferView | ReadableStream,
    options?: { expirationTtl?: number; expiration?: number },
  ): Promise<void> {
    this.store.set(key, { bytes: await toArrayBuffer(value), expirationTtl: options?.expirationTtl });
  }

  get(key: string, type: "text"): Promise<string | null>;
  get(key: string, type: "arrayBuffer"): Promise<ArrayBuffer | null>;
  async get(key: string, type: "text" | "arrayBuffer"): Promise<string | ArrayBuffer | null> {
    const stored = this.store.get(key);
    if (!stored) {
      return null;
    }
    return type === "text" ? new TextDecoder().decode(stored.bytes) : stored.bytes.slice(0);
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  has(key: string): boolean {
    return this.store.has(key);
  }

  entry(key: string): StoredValue | undefined {
    return this.store.get(key);
  }
}

async function toArrayBuffer(value: string | ArrayBuffer | ArrayBufferView | ReadableStream): Promise<ArrayBuffer> {
  if (typeof value === "string") {
    return new TextEncoder().encode(value).buffer;
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
