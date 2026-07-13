import type {
  AssetsBinding,
  D1DatabaseBinding,
  D1PreparedStatementBinding,
  KVNamespaceBinding,
  R2BucketBinding,
  R2ObjectBinding,
} from "./cloudflare/cloudflare-bindings.ts";
import type { CloudflareEnv } from "./cloudflare/cloudflare-env.ts";

import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "./cloudflare.ts";

const provider = {
  service: "example",
  displayName: "Example",
  categories: ["Developer Tools"],
  authTypes: ["no_auth"],
  auth: [{ type: "no_auth" }],
  actions: [],
};

describe("cloudflare worker", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("writes connection logs to console", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const response = await worker.fetch(
      new Request("https://connect.example.com/api/connections/example", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          authType: "no_auth",
          connectionName: "work",
          values: {
            apiKey: "unused-secret",
          },
        }),
      }),
      createEnv(),
      createExecutionContext(),
    );

    expect(response.status).toBe(200);
    expect(info).toHaveBeenCalledWith(
      "connection started",
      expect.objectContaining({
        service: "example",
        authType: "no_auth",
        connectionName: "work",
      }),
    );
    expect(info).toHaveBeenCalledWith(
      "connection completed",
      expect.objectContaining({
        service: "example",
        authType: "no_auth",
        connectionName: "work",
      }),
    );
    expect(JSON.stringify(info.mock.calls)).not.toContain("unused-secret");
  });

  it("selects the KV backend and round-trips a file when TRANSIT_FILES_BACKEND is kv", async () => {
    const namespace = new MemoryKVNamespace();
    // A distinct host keeps this out of the R2 test's cached app instance.
    const origin = "https://kv.example.com";
    const env: CloudflareEnv = {
      DB: new UnusedD1Database(),
      TRANSIT_FILES: namespace,
      TRANSIT_FILES_BACKEND: "kv",
      ASSETS: memoryAssets({ "/catalog/apps.json": [provider] }),
    };

    const form = new FormData();
    form.set("file", new File(["kv-payload"], "note.txt", { type: "text/plain" }));
    const uploadResponse = await worker.fetch(
      new Request(`${origin}/api/files`, { method: "POST", body: form }),
      env,
      createExecutionContext(),
    );
    expect(uploadResponse.status).toBe(200);
    const upload = (await uploadResponse.json()) as { fileId: string };
    expect(upload.fileId).toMatch(/^[a-f0-9]{32}\.txt$/);

    // Only KVTransitFileService writes an expirationTtl; its presence proves the KV
    // backend (not R2) was selected end-to-end from the TRANSIT_FILES_BACKEND flag.
    expect(namespace.entry(`transit/${upload.fileId}`)?.expirationTtl).toBe(86_400);

    const getResponse = await worker.fetch(
      new Request(`${origin}/api/files/${upload.fileId}`),
      env,
      createExecutionContext(),
    );
    expect(getResponse.status).toBe(200);
    await expect(getResponse.text()).resolves.toBe("kv-payload");
  });

  it("defaults to the R2 backend when TRANSIT_FILES_BACKEND is unset and round-trips a file", async () => {
    const bucket = new MemoryR2Bucket();
    // A distinct host keeps this out of the other tests' cached app instances.
    const origin = "https://r2.example.com";
    const env: CloudflareEnv = {
      DB: new UnusedD1Database(),
      TRANSIT_FILES: bucket,
      // TRANSIT_FILES_BACKEND intentionally omitted -> must fall back to R2.
      ASSETS: memoryAssets({ "/catalog/apps.json": [provider] }),
    };

    const form = new FormData();
    form.set("file", new File(["r2-payload"], "note.txt", { type: "text/plain" }));
    const uploadResponse = await worker.fetch(
      new Request(`${origin}/api/files`, { method: "POST", body: form }),
      env,
      createExecutionContext(),
    );
    expect(uploadResponse.status).toBe(200);
    const upload = (await uploadResponse.json()) as { fileId: string };
    expect(upload.fileId).toMatch(/^[a-f0-9]{32}\.txt$/);

    // Only R2TransitFileService writes httpMetadata.contentType (KV never does); its
    // presence proves the R2 backend was selected by default from an absent flag.
    expect(bucket.stored(`transit/${upload.fileId}`)?.httpMetadata?.contentType).toBe("text/plain");

    const getResponse = await worker.fetch(
      new Request(`${origin}/api/files/${upload.fileId}`),
      env,
      createExecutionContext(),
    );
    expect(getResponse.status).toBe(200);
    await expect(getResponse.text()).resolves.toBe("r2-payload");
  });
});

function createEnv(): CloudflareEnv {
  return {
    DB: new UnusedD1Database(),
    TRANSIT_FILES: new UnusedR2Bucket(),
    ASSETS: memoryAssets({
      "/catalog/apps.json": [provider],
    }),
  };
}

function createExecutionContext(): Parameters<typeof worker.fetch>[2] {
  return {
    waitUntil() {},
    passThroughOnException() {},
  };
}

function memoryAssets(files: Record<string, unknown>): AssetsBinding {
  return {
    async fetch(request) {
      const pathname = new URL(request.url).pathname;
      if (!(pathname in files)) {
        return new Response("not found", { status: 404 });
      }

      return Response.json(files[pathname]);
    },
  };
}

class UnusedD1Database implements D1DatabaseBinding {
  prepare(query: string): D1PreparedStatementBinding {
    throw new Error(`Unexpected D1 query: ${query}`);
  }
}

class UnusedR2Bucket implements R2BucketBinding {
  async put(): Promise<unknown> {
    throw new Error("Unexpected R2 put");
  }

  async get(): Promise<R2ObjectBinding | null> {
    throw new Error("Unexpected R2 get");
  }

  async delete(): Promise<void> {
    throw new Error("Unexpected R2 delete");
  }
}

class MemoryKVNamespace implements KVNamespaceBinding {
  private readonly store = new Map<string, { bytes: ArrayBuffer; expirationTtl?: number }>();

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

  entry(key: string): { bytes: ArrayBuffer; expirationTtl?: number } | undefined {
    return this.store.get(key);
  }
}

class MemoryR2Bucket implements R2BucketBinding {
  private readonly objects = new Map<string, MemoryR2Object>();

  async put(
    key: string,
    value: ReadableStream | ArrayBuffer | ArrayBufferView | string | Blob,
    options?: { httpMetadata?: { contentType?: string } },
  ): Promise<unknown> {
    this.objects.set(key, new MemoryR2Object(await toArrayBuffer(value), options?.httpMetadata));
    return {};
  }

  async get(key: string): Promise<R2ObjectBinding | null> {
    return this.objects.get(key) ?? null;
  }

  async delete(key: string): Promise<void> {
    this.objects.delete(key);
  }

  stored(key: string): MemoryR2Object | undefined {
    return this.objects.get(key);
  }
}

class MemoryR2Object implements R2ObjectBinding {
  readonly body: ReadableStream;
  readonly httpMetadata?: { contentType?: string };

  private readonly bytes: ArrayBuffer;

  constructor(bytes: ArrayBuffer, httpMetadata?: { contentType?: string }) {
    this.bytes = bytes;
    this.body = new Blob([bytes]).stream();
    this.httpMetadata = httpMetadata;
  }

  async arrayBuffer(): Promise<ArrayBuffer> {
    return this.bytes.slice(0);
  }
}

async function toArrayBuffer(
  value: string | ArrayBuffer | ArrayBufferView | ReadableStream | Blob,
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
