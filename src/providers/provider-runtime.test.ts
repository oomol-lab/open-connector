import type { ExecutionContext, ResolvedCredential, TransitFileRead, TransitFileWriter } from "../core/types.ts";

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  credentialProviderProxyBaseUrl,
  createProviderProxyUrl,
  defineProviderProxy,
  defineBearerProviderProxy,
  normalizeProviderProxyHeaders,
  normalizeProviderProxyQuery,
  ProviderRequestError,
  readProviderProxyResponse,
  uploadProviderUrlToTransitFile,
} from "./provider-runtime.ts";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("provider runtime file helpers", () => {
  it("bounds provider URL downloads before creating transit files", async () => {
    const transitFiles = new MemoryTransitFiles(4);

    await expect(
      uploadProviderUrlToTransitFile(
        {
          url: "https://provider.example/report.txt",
          name: "report.txt",
          source: "example",
        },
        {
          fetcher: async () => new Response("12345"),
          transitFiles,
        },
      ),
    ).rejects.toMatchObject({
      status: 413,
      message: "report.txt exceeds 4 bytes",
    });
    expect(transitFiles.createdFiles).toHaveLength(0);
  });

  it("stores bounded provider URL downloads", async () => {
    const transitFiles = new MemoryTransitFiles(32);

    const upload = await uploadProviderUrlToTransitFile(
      {
        url: "https://provider.example/report.txt",
        name: "report.txt",
        source: "example",
      },
      {
        fetcher: async () => new Response("hello", { headers: { "content-type": "text/plain" } }),
        transitFiles,
      },
    );

    expect(upload).toMatchObject({
      fileId: "file-1",
      name: "report.txt",
      mimeType: "text/plain",
      sizeBytes: 5,
    });
    await expect(transitFiles.createdFiles[0]?.text()).resolves.toBe("hello");
  });
});

describe("provider proxy helpers", () => {
  it("builds provider-owned URLs from relative endpoints and scalar query values", () => {
    const url = createProviderProxyUrl("https://api.example.com/v1", "/items", {
      limit: 10,
      includeArchived: false,
      empty: "",
      nested: { rejected: true },
    });

    expect(url.toString()).toBe("https://api.example.com/v1/items?limit=10&includeArchived=false&empty=");
  });

  it("rejects absolute, protocol-relative, and parent-traversal endpoints", () => {
    expect(() => createProviderProxyUrl("https://api.example.com", "https://evil.test/a")).toThrow(
      ProviderRequestError,
    );
    expect(() => createProviderProxyUrl("https://api.example.com", "//evil.test/a")).toThrow(ProviderRequestError);
    expect(() => createProviderProxyUrl("https://api.example.com/v1", "/../admin")).toThrow(ProviderRequestError);
    expect(() => createProviderProxyUrl("https://api.example.com/v1", "/%2e%2e/admin")).toThrow(ProviderRequestError);
  });

  it("normalizes caller headers without forwarding hop-by-hop or auth headers", () => {
    const headers = normalizeProviderProxyHeaders({
      accept: "application/json",
      authorization: "Bearer caller-token",
      host: "evil.test",
      "x-trace-id": " trace-1 ",
      ignored: 123,
    });

    expect(Object.fromEntries(headers.entries())).toEqual({
      accept: "application/json",
      "x-trace-id": "trace-1",
    });
  });

  it("normalizes scalar query values", () => {
    expect(
      normalizeProviderProxyQuery({
        page: 2,
        exact: true,
        search: "oomol",
        nested: { value: "ignored" },
      }),
    ).toEqual({
      page: "2",
      exact: "true",
      search: "oomol",
    });
  });

  it("reads JSON proxy responses and preserves response headers", async () => {
    const response = new Response(JSON.stringify({ ok: true }), {
      status: 201,
      headers: { "content-type": "application/json", "x-request-id": "req_1" },
    });

    await expect(readProviderProxyResponse(response)).resolves.toEqual({
      status: 201,
      headers: {
        "content-type": "application/json",
        "x-request-id": "req_1",
      },
      data: { ok: true },
    });
  });

  it("reads binary proxy responses as bounded base64 payloads", async () => {
    const response = new Response(Uint8Array.from([0, 1, 2, 255]), {
      status: 200,
      headers: { "content-type": "application/octet-stream" },
    });

    await expect(readProviderProxyResponse(response, { maxBytes: 4 })).resolves.toEqual({
      status: 200,
      headers: {
        "content-type": "application/octet-stream",
      },
      bodyEncoding: "base64",
      data: "AAEC/w==",
    });
  });

  it("rejects proxy responses over the configured byte limit", async () => {
    const response = new Response("12345", {
      headers: { "content-type": "text/plain" },
    });

    await expect(readProviderProxyResponse(response, { maxBytes: 4 })).rejects.toMatchObject({
      status: 413,
      message: "proxy response exceeds 4 bytes",
    });
  });

  it("executes bearer proxy requests with runtime credentials", async () => {
    const fetcher = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit): Promise<Response> =>
        new Response(JSON.stringify({ id: "item_1" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetcher);

    const credential: ResolvedCredential = {
      authType: "api_key",
      apiKey: "provider-token",
      values: { apiKey: "provider-token" },
      profile: { accountId: "acct_1", displayName: "Example", grantedScopes: [] },
      metadata: {},
    };
    const context: ExecutionContext = {
      getCredential: async () => credential,
    };

    const proxy = defineBearerProviderProxy({
      service: "example",
      baseUrl: "https://api.example.com/v1",
    });
    const result = await proxy(
      {
        endpoint: "/items",
        method: "POST",
        headers: { accept: "application/json" },
        body: { name: "example" },
      },
      context,
    );

    expect(result).toEqual({
      ok: true,
      response: {
        status: 200,
        headers: { "content-type": "application/json" },
        data: { id: "item_1" },
      },
    });
    expect(fetcher).toHaveBeenCalledWith(
      new URL("https://api.example.com/v1/items"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ name: "example" }),
      }),
    );
    const init = fetcher.mock.calls[0]![1] as RequestInit;
    expect(Object.fromEntries((init.headers as Headers).entries())).toMatchObject({
      accept: "application/json",
      authorization: "Bearer provider-token",
      "content-type": "application/json",
      "user-agent": "oomol-connect/0.1",
    });
  });

  it("bounds provider proxy error response bodies", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (): Promise<Response> => new Response("x".repeat(20 * 1024 * 1024 + 1), { status: 500 })),
    );

    const proxy = defineProviderProxy({
      service: "example",
      baseUrl: "https://api.example.com",
      auth: { type: "none" },
    });

    await expect(
      proxy(
        {
          endpoint: "/items",
          method: "GET",
        },
        {
          getCredential: async () => undefined,
        },
      ),
    ).resolves.toMatchObject({
      ok: false,
      error: {
        code: "invalid_input",
        message: "proxy error response exceeds 20971520 bytes",
        details: {
          status: 413,
        },
      },
    });
  });

  it("injects API key credentials into proxy request headers", async () => {
    const fetcher = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit): Promise<Response> =>
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetcher);

    const proxy = defineProviderProxy({
      service: "example",
      baseUrl: "https://api.example.com",
      auth: { type: "api_key_header", name: "x-api-key" },
    });
    const result = await proxy(
      {
        endpoint: "/items",
        method: "GET",
        headers: { authorization: "Bearer caller-token" },
      },
      {
        getCredential: async () => ({
          authType: "api_key",
          apiKey: "provider-key",
          values: { apiKey: "provider-key" },
          profile: { accountId: "acct_1", displayName: "Example", grantedScopes: [] },
          metadata: {},
        }),
      },
    );

    expect(result.ok).toBe(true);
    const init = fetcher.mock.calls[0]![1] as RequestInit;
    expect(Object.fromEntries((init.headers as Headers).entries())).toMatchObject({
      "user-agent": "oomol-connect/0.1",
      "x-api-key": "provider-key",
    });
    expect((init.headers as Headers).has("authorization")).toBe(false);
  });

  it("injects API key credentials into proxy request query parameters", async () => {
    const fetcher = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit): Promise<Response> => new Response("{}", { status: 200 }),
    );
    vi.stubGlobal("fetch", fetcher);

    const proxy = defineProviderProxy({
      service: "example",
      baseUrl: "https://api.example.com/v1",
      auth: { type: "api_key_query", name: "api_key" },
    });
    await proxy(
      {
        endpoint: "/items",
        method: "GET",
        query: {
          api_key: "caller-key",
          page: 2,
        },
      },
      {
        getCredential: async () => ({
          authType: "api_key",
          apiKey: "provider-key",
          values: { apiKey: "provider-key" },
          profile: { accountId: "acct_1", displayName: "Example", grantedScopes: [] },
          metadata: {},
        }),
      },
    );

    const url = fetcher.mock.calls[0]![0] as URL;
    expect(url.origin + url.pathname).toBe("https://api.example.com/v1/items");
    expect(url.searchParams.get("page")).toBe("2");
    expect(url.searchParams.get("api_key")).toBe("provider-key");
  });

  it("injects API key credentials into proxy Basic authorization headers", async () => {
    const fetcher = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit): Promise<Response> => new Response("{}", { status: 200 }),
    );
    vi.stubGlobal("fetch", fetcher);

    const proxy = defineProviderProxy({
      service: "example",
      baseUrl: "https://api.example.com",
      auth: { type: "api_key_basic", suffix: ":" },
    });
    await proxy(
      {
        endpoint: "/items",
        method: "GET",
      },
      {
        getCredential: async () => ({
          authType: "api_key",
          apiKey: "provider-key",
          values: { apiKey: "provider-key" },
          profile: { accountId: "acct_1", displayName: "Example", grantedScopes: [] },
          metadata: {},
        }),
      },
    );

    const init = fetcher.mock.calls[0]![1] as RequestInit;
    expect((init.headers as Headers).get("authorization")).toBe("Basic cHJvdmlkZXIta2V5Og==");
  });

  it("resolves proxy base URLs from credential metadata", async () => {
    const fetcher = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit): Promise<Response> => new Response("{}", { status: 200 }),
    );
    vi.stubGlobal("fetch", fetcher);

    const proxy = defineProviderProxy({
      service: "example",
      baseUrl: credentialProviderProxyBaseUrl("apiBaseUrl"),
      auth: { type: "api_key_header", name: "x-api-key" },
    });
    await proxy(
      {
        endpoint: "/items",
        method: "GET",
      },
      {
        getCredential: async () => ({
          authType: "api_key",
          apiKey: "provider-key",
          values: { apiKey: "provider-key" },
          profile: { accountId: "acct_1", displayName: "Example", grantedScopes: [] },
          metadata: { apiBaseUrl: "https://tenant.example.com/api" },
        }),
      },
    );

    expect(fetcher).toHaveBeenCalledWith(new URL("https://tenant.example.com/api/items"), expect.any(Object));
  });

  it("executes no-auth proxy requests without resolving credentials", async () => {
    const fetcher = vi.fn(async (): Promise<Response> => new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetcher);
    const getCredential = vi.fn();

    const proxy = defineProviderProxy({
      service: "example",
      baseUrl: "https://api.example.com",
      auth: { type: "none" },
    });
    const result = await proxy(
      {
        endpoint: "/status",
        method: "GET",
      },
      { getCredential },
    );

    expect(result).toMatchObject({ ok: true });
    expect(getCredential).not.toHaveBeenCalled();
  });
});

class MemoryTransitFiles implements TransitFileWriter {
  readonly createdFiles: File[] = [];
  readonly maxBytes: number;

  constructor(maxBytes: number) {
    this.maxBytes = maxBytes;
  }

  async create(file: File): Promise<{
    fileId: string;
    downloadUrl: string;
    sizeBytes: number;
    name: string;
    mimeType: string;
  }> {
    if (file.size > this.maxBytes) {
      throw new ProviderRequestError(413, "file too large");
    }
    this.createdFiles.push(file);
    return {
      fileId: `file-${this.createdFiles.length}`,
      downloadUrl: `http://localhost/files/${this.createdFiles.length}`,
      sizeBytes: file.size,
      name: file.name,
      mimeType: file.type,
    };
  }

  read(_fileId: string): Promise<TransitFileRead> {
    throw new Error("not implemented");
  }

  async delete(_fileId: string): Promise<boolean> {
    return false;
  }
}
