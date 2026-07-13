import type { DokployOperation } from "./operations.ts";

import { describe, expect, it, vi } from "vitest";
import { s } from "../../core/json-schema.ts";
import {
  createDokployContext,
  executeDokployOperation,
  normalizeDokployApiBaseUrl,
  redactSensitive,
  validateDokployCredential,
} from "./runtime.ts";

const schema = s.looseObject({}, { description: "Test schema." });

function operation(overrides: Partial<DokployOperation> = {}): DokployOperation {
  return {
    name: "application-create",
    operationId: "test.operation",
    description: "Test operation.",
    method: "GET",
    path: "/resource/{resourceId}",
    pathFields: ["resourceId"],
    queryFields: ["filter", "tags"],
    bodyFields: [],
    inputSchema: schema,
    outputSchema: schema,
    ...overrides,
  };
}

function context(fetcher: typeof fetch) {
  return createDokployContext({ baseUrl: "https://dokploy.example.com" }, "dokploy-key", fetcher);
}

describe("Dokploy runtime", () => {
  it("normalizes the instance URL and rejects private targets", () => {
    expect(normalizeDokployApiBaseUrl("https://dokploy.example.com/")).toBe("https://dokploy.example.com/api");
    expect(normalizeDokployApiBaseUrl("https://dokploy.example.com/api/")).toBe("https://dokploy.example.com/api");
    expect(() => normalizeDokployApiBaseUrl("http://127.0.0.1:3000")).toThrow(
      "baseUrl must not target private or reserved IP addresses",
    );
  });

  it("validates credentials with an authenticated project search", async () => {
    const fetcher = vi.fn(async (): Promise<Response> => Response.json({ items: [], total: 0 }));
    await expect(
      validateDokployCredential({ baseUrl: "https://dokploy.example.com" }, "dokploy-key", fetcher),
    ).resolves.toMatchObject({
      profile: { accountId: "dokploy:dokploy.example.com", displayName: "Dokploy dokploy.example.com" },
      metadata: { apiBaseUrl: "https://dokploy.example.com/api", validationEndpoint: "/project.search" },
    });
    const [url, init] = fetcher.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.toString()).toBe("https://dokploy.example.com/api/project.search?limit=1&offset=0");
    expect(init.headers).toMatchObject({ "x-api-key": "dokploy-key", "user-agent": "oomol-connect/0.1" });
  });

  it("maps path and repeated query fields from operation metadata", async () => {
    const fetcher = vi.fn(async (): Promise<Response> => Response.json({ ok: true }));
    await executeDokployOperation(
      operation(),
      { resourceId: "a/b", filter: "active", tags: ["one", "two"], ignored: true },
      context(fetcher),
    );
    const [url, init] = fetcher.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.toString()).toBe("https://dokploy.example.com/api/resource/a%2Fb?filter=active&tags=one&tags=two");
    expect(init.method).toBe("GET");
    expect(init.body).toBeUndefined();
  });

  it("maps JSON bodies from operation metadata and omits undefined fields", async () => {
    const fetcher = vi.fn(async (): Promise<Response> => Response.json({ accepted: true }));
    await executeDokployOperation(
      operation({
        method: "POST",
        path: "/resource.create",
        pathFields: [],
        queryFields: [],
        bodyFields: ["name", "note"],
      }),
      { name: "web", note: undefined, ignored: true },
      context(fetcher),
    );
    const [, init] = fetcher.mock.calls[0] as unknown as [URL, RequestInit];
    expect(init.headers).toMatchObject({ "content-type": "application/json" });
    expect(JSON.parse(String(init.body))).toEqual({ name: "web" });
  });

  it.each([
    ["zip", "deployment.zip", "application/zip"],
    ["file", "config.json", "application/json"],
  ])("maps the %s transit-file field to multipart form data", async (field, name, mimeType) => {
    const fetcher = vi.fn(async (): Promise<Response> => Response.json({ accepted: true }));
    const transitFiles = {
      maxBytes: 1_000_000,
      create: vi.fn(),
      delete: vi.fn(),
      read: vi.fn(async () => ({
        file: new File(["payload"], name, { type: mimeType }),
        sizeBytes: 7,
        name,
        mimeType,
      })),
    };
    const runtimeContext = createDokployContext(
      { baseUrl: "https://dokploy.example.com" },
      "dokploy-key",
      fetcher,
      undefined,
      transitFiles,
    );
    await executeDokployOperation(
      operation({
        method: "POST",
        path: "/upload",
        pathFields: [],
        queryFields: [],
        bodyFields: ["resourceId", field],
        fileFields: [field],
        contentType: "multipart/form-data",
      }),
      { resourceId: "resource-1", [field]: { fileId: "transit-1" } },
      runtimeContext,
    );
    const [, init] = fetcher.mock.calls[0] as unknown as [URL, RequestInit];
    expect(init.headers).not.toHaveProperty("content-type");
    const body = init.body as FormData;
    expect(body.get("resourceId")).toBe("resource-1");
    expect(body.get(field)).toMatchObject({ name, type: mimeType });
    expect(transitFiles.read).toHaveBeenCalledWith("transit-1");
  });

  it("can recursively redact sensitive error details without changing safe fields", () => {
    expect(
      redactSensitive({ apiKey: "key", nested: [{ password: "pw", visible: "yes" }], access_token: "token" }),
    ).toEqual({
      apiKey: "[redacted]",
      nested: [{ password: "[redacted]", visible: "yes" }],
      access_token: "[redacted]",
    });
  });

  it("maps invalid credentials to a connection validation error", async () => {
    const fetcher = vi.fn(
      async (): Promise<Response> => Response.json({ message: "Invalid API key" }, { status: 401 }),
    );
    await expect(
      validateDokployCredential({ baseUrl: "https://dokploy.example.com" }, "bad-key", fetcher),
    ).rejects.toMatchObject({ status: 400, message: "Invalid API key" });
  });

  it("rejects a successful non-JSON response", async () => {
    const fetcher = vi.fn(async (): Promise<Response> => new Response("accepted", { status: 200 }));
    await expect(
      executeDokployOperation(
        operation({ path: "/plain", pathFields: [], queryFields: [], bodyFields: [] }),
        {},
        context(fetcher),
      ),
    ).rejects.toMatchObject({ status: 502, message: "Dokploy returned invalid JSON" });
  });

  it("uses bounded non-JSON error text while preserving the upstream status", async () => {
    const fetcher = vi.fn(
      async (): Promise<Response> => new Response("Deployment archive is invalid", { status: 422 }),
    );
    await expect(
      executeDokployOperation(
        operation({ path: "/invalid", pathFields: [], queryFields: [], bodyFields: [] }),
        {},
        context(fetcher),
      ),
    ).rejects.toMatchObject({ status: 422, message: "Deployment archive is invalid" });
  });

  it("truncates oversized non-JSON error messages", async () => {
    const fetcher = vi.fn(async (): Promise<Response> => new Response("x".repeat(20_000), { status: 502 }));
    await expect(
      executeDokployOperation(
        operation({ path: "/long-error", pathFields: [], queryFields: [], bodyFields: [] }),
        {},
        context(fetcher),
      ),
    ).rejects.toMatchObject({ status: 502, message: `${"x".repeat(16_383)}…` });
  });

  it("redacts sensitive query parameters from network errors", async () => {
    const fetcher = vi.fn(async (): Promise<Response> => {
      throw new Error(
        "request to https://dokploy.example.com/api/ai.getModels?apiUrl=https%3A%2F%2Fai.example.com&apiKey=ai-secret&token=metrics-secret failed",
      );
    });
    await expect(
      executeDokployOperation(
        operation({ path: "/network-error", pathFields: [], queryFields: [], bodyFields: [] }),
        {},
        context(fetcher),
      ),
    ).rejects.toMatchObject({
      status: 502,
      message:
        "Dokploy request failed: request to https://dokploy.example.com/api/ai.getModels?apiUrl=https%3A%2F%2Fai.example.com&apiKey=[redacted]&token=[redacted] failed",
    });
  });

  it("rejects responses whose declared content length exceeds the response limit", async () => {
    const fetcher = vi.fn(
      async (): Promise<Response> =>
        new Response("{}", { headers: { "content-length": String(10 * 1024 * 1024 + 1) } }),
    );
    await expect(
      executeDokployOperation(
        operation({ path: "/large", pathFields: [], queryFields: [], bodyFields: [] }),
        {},
        context(fetcher),
      ),
    ).rejects.toMatchObject({ status: 413, message: "Dokploy response exceeds 10485760 bytes" });
  });
});
