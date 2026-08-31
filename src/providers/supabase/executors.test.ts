import type { ExecutionContext, ResolvedCredential, TransitFileStore } from "../../core/types.ts";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { executeAction } from "../../core/execution.ts";
import { setDefaultGuardedFetchDnsLookup } from "../../core/guarded-fetch.ts";
import { ProviderRequestError } from "../provider-runtime.ts";
import { provider } from "./definition.ts";
import { credentialValidators, executors } from "./executors.ts";
import { supabaseProviderScopes } from "./scopes.ts";

interface CapturedRequest {
  url: URL;
  method: string;
  authorization: string | null;
  apiKey: string | null;
  headers: Record<string, string>;
  bodyBytes: Uint8Array | null;
}

const projectRef = "abcdefghijklmnopqrst";
const oauthCredential: Extract<ResolvedCredential, { authType: "oauth2" }> = {
  authType: "oauth2",
  accessToken: "supabase-management-token",
  tokenType: "Bearer",
  profile: { accountId: "supabase:test", displayName: "Supabase test", grantedScopes: [] },
  metadata: {},
};

beforeEach(() => {
  setDefaultGuardedFetchDnsLookup(null);
});

afterEach(() => {
  setDefaultGuardedFetchDnsLookup(undefined);
  vi.unstubAllGlobals();
});

describe("Supabase credential validation", () => {
  it("validates OAuth through /v1/profile and uses gotrue_id as the account identity", async () => {
    const calls: string[] = [];
    const result = await credentialValidators.oauth2!(oauthCredential, {
      fetcher: async (input) => {
        calls.push(String(input));
        return Response.json({
          gotrue_id: "11111111-2222-3333-4444-555555555555",
          primary_email: "ada@example.com",
          username: "ada",
        });
      },
    });

    expect(calls).toEqual(["https://api.supabase.com/v1/profile"]);
    expect(result).toEqual({
      profile: {
        accountId: "11111111-2222-3333-4444-555555555555",
        displayName: "ada",
        grantedScopes: supabaseProviderScopes,
      },
      metadata: {
        validationEndpoint: "/profile",
        gotrueId: "11111111-2222-3333-4444-555555555555",
        username: "ada",
        primaryEmail: "ada@example.com",
      },
    });
  });

  it("rejects an OAuth profile response that is missing gotrue_id", async () => {
    await expect(
      credentialValidators.oauth2!(oauthCredential, {
        fetcher: async () => Response.json({ primary_email: "ada@example.com", username: "ada" }),
      }),
    ).rejects.toEqual(new ProviderRequestError(502, "malformed supabase response: profile.gotrue_id is required."));
  });

  it("rejects unauthorized OAuth profile responses", async () => {
    await expect(
      credentialValidators.oauth2!(oauthCredential, {
        fetcher: async () => Response.json({ message: "invalid token" }, { status: 401 }),
      }),
    ).rejects.toMatchObject({ status: 400, message: "invalid token" });
  });

  it("keeps API-key validation on organizations even when the list is empty", async () => {
    const calls: string[] = [];
    const result = await credentialValidators.apiKey!(
      { apiKey: "sbp_test", values: {} },
      {
        fetcher: async (input) => {
          calls.push(String(input));
          return Response.json([]);
        },
      },
    );

    expect(calls).toEqual(["https://api.supabase.com/v1/organizations"]);
    expect(result).toMatchObject({
      profile: { displayName: "Supabase OAuth" },
      metadata: {
        validationEndpoint: "/organizations",
        organizationCount: 0,
        organizations: [],
        identitySource: "access_token_fingerprint",
      },
    });
  });
});

describe("Supabase download_storage_object", () => {
  it("uses a revealed secret key and stores the exact object bytes", async () => {
    const content = new Uint8Array([83, 117, 112, 0, 255]);
    const requests = stubResponses([
      Response.json([
        apiKeyRecord({
          id: "publishable-1",
          name: "default",
          type: "publishable",
          api_key: "sb_publishable_test",
        }),
        apiKeyRecord({ id: "secret-1", name: "default", type: "secret", api_key: "sb_secret_test" }),
      ]),
      new Response(content, { headers: { "content-type": "application/pdf" } }),
    ]);
    const { store, create } = createTransitFileStore(1024);

    const result = await executeDownload(
      { projectRef, bucketId: "documents", objectPath: "reports/annual report #1.pdf" },
      store,
    );

    expect(result).toEqual({
      ok: true,
      output: {
        fileId: "documents/reports/annual report #1.pdf",
        name: "annual report #1.pdf",
        mimeType: "application/pdf",
        sizeBytes: content.length,
        file: {
          fileId: "transit-file-1",
          downloadUrl: "http://localhost/api/files/transit-file-1",
          sizeBytes: content.length,
          name: "annual report #1.pdf",
          mimeType: "application/pdf",
        },
      },
    });
    expect(requests).toHaveLength(2);
    expect(requests[0]?.url.pathname).toBe(`/v1/projects/${projectRef}/api-keys`);
    expect(requests[0]?.url.searchParams.get("reveal")).toBe("true");
    expect(requests[0]?.authorization).toBe("Bearer supabase-management-token");
    expect(requests[1]?.url.hostname).toBe(`${projectRef}.supabase.co`);
    expect(requests[1]?.url.pathname).toBe(
      "/storage/v1/object/authenticated/documents/reports/annual%20report%20%231.pdf",
    );
    expect(requests[1]?.apiKey).toBe("sb_secret_test");
    expect(requests[1]?.authorization).toBeNull();
    expect(create).toHaveBeenCalledOnce();
    expect(new Uint8Array(await create.mock.calls[0]![0].arrayBuffer())).toEqual(content);
  });

  it("uses Authorization only for an explicitly selected legacy service_role key", async () => {
    const requests = stubResponses([
      Response.json(
        apiKeyRecord({ id: "service-role-1", name: "service_role", type: "legacy", api_key: "legacy-jwt" }),
      ),
      new Response("ok", { headers: { "content-type": "text/plain" } }),
    ]);
    const { store } = createTransitFileStore(1024);

    const result = await executeDownload(
      { projectRef, bucketId: "documents", objectPath: "notes.txt", apiKeyId: "service-role-1" },
      store,
    );

    expect(result.ok).toBe(true);
    expect(requests[0]?.url.pathname).toBe(`/v1/projects/${projectRef}/api-keys/service-role-1`);
    expect(requests[1]?.apiKey).toBe("legacy-jwt");
    expect(requests[1]?.authorization).toBe("Bearer legacy-jwt");
  });

  it("preserves boundary whitespace in the object path", async () => {
    const requests = stubResponses([
      Response.json([apiKeyRecord({ id: "secret-1", name: "default", type: "secret", api_key: "sb_secret_test" })]),
      new Response("ok", { headers: { "content-type": "text/plain" } }),
    ]);
    const { store } = createTransitFileStore(1024);

    const result = await executeDownload(
      { projectRef, bucketId: "documents", objectPath: " reports/annual report.pdf " },
      store,
    );

    expect(result).toMatchObject({
      ok: true,
      output: {
        fileId: "documents/ reports/annual report.pdf ",
        name: "annual report.pdf ",
        file: { name: "annual report.pdf " },
      },
    });
    expect(requests[1]?.url.pathname).toBe(
      "/storage/v1/object/authenticated/documents/%20reports/annual%20report.pdf%20",
    );
  });

  it("rejects dot segments instead of normalizing the object path", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const { store } = createTransitFileStore(1024);

    const result = await executeDownload({ projectRef, bucketId: "documents", objectPath: "a/../secret" }, store);

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "invalid_input",
        message: "objectPath must not contain . or .. path segments",
      },
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("honors the transit size limit without storing a partial object", async () => {
    const requests = stubResponses([
      Response.json([apiKeyRecord({ id: "secret-1", name: "default", type: "secret", api_key: "sb_secret_test" })]),
      new Response(new Uint8Array([1, 2, 3])),
    ]);
    const { store, create } = createTransitFileStore(2);

    const result = await executeDownload({ projectRef, bucketId: "documents", objectPath: "large.bin" }, store);

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "invalid_input",
        message: "Supabase Storage download exceeds 2 bytes",
        details: { status: 413 },
      },
    });
    expect(requests).toHaveLength(2);
    expect(create).not.toHaveBeenCalled();
  });

  it("returns a clear error before egress when transit storage is unavailable", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);

    const result = await executeDownload({ projectRef, bucketId: "documents", objectPath: "report.pdf" });

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "invalid_input",
        message: "supabase download_storage_object requires local transit file storage",
      },
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects a project reference that could change the Storage host", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const { store } = createTransitFileStore(1024);

    const result = await executeDownload(
      { projectRef: "evil.example.com", bucketId: "documents", objectPath: "report.pdf" },
      store,
    );

    expect(result).toMatchObject({ ok: false, error: { code: "invalid_input" } });
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("Supabase upload_storage_object", () => {
  it("uploads a transit file via secret key with PUT and etag", async () => {
    const uploadBody = new Uint8Array([1, 2, 3]);
    const file = new File([uploadBody], "hello.txt", { type: "text/plain" });
    const requests = stubResponses([
      Response.json([apiKeyRecord({ id: "secret-1", name: "default", type: "secret", api_key: "sb_secret_test" })]),
      new Response(JSON.stringify({ Key: "documents/hello.txt" }), { headers: { etag: '"etag-up-1"' } }),
    ]);
    const { store } = createTransitFileStoreWithRead(1024, file);

    const result = await executeUpload(
      { projectRef, bucketId: "documents", objectPath: "hello.txt", file: { fileId: "transit-file-1" } },
      store,
    );

    expect(result).toEqual({
      ok: true,
      output: {
        bucketId: "documents",
        objectPath: "hello.txt",
        fileId: "documents/hello.txt",
        name: "hello.txt",
        mimeType: "text/plain",
        sizeBytes: uploadBody.length,
        etag: '"etag-up-1"',
      },
    });
    expect(requests).toHaveLength(2);
    expect(requests[1]?.url.hostname).toBe(`${projectRef}.supabase.co`);
    expect(requests[1]?.url.pathname).toBe("/storage/v1/object/documents/hello.txt");
    expect(requests[1]?.apiKey).toBe("sb_secret_test");
    expect(requests[1]?.authorization).toBeNull();
  });

  it("uses Authorization header for legacy service_role when explicitly selected", async () => {
    const file = new File([new Uint8Array([1, 2])], "b.txt", { type: "application/octet-stream" });
    const requests = stubResponses([
      Response.json(
        apiKeyRecord({ id: "service-role-1", name: "service_role", type: "legacy", api_key: "legacy-jwt" }),
      ),
      new Response("", { headers: { etag: '"etag-legacy"' } }),
    ]);
    const { store } = createTransitFileStoreWithRead(1024, file);
    const result = await executeUpload(
      {
        projectRef,
        bucketId: "documents",
        objectPath: "b.txt",
        file: { fileId: "transit-file-1" },
        apiKeyId: "service-role-1",
      },
      store,
    );
    expect(result.ok).toBe(true);
    expect(requests[1]?.apiKey).toBe("legacy-jwt");
    expect(requests[1]?.authorization).toBe("Bearer legacy-jwt");
  });

  it("rejects dot segments before any egress", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const file = new File([new Uint8Array([1])], "a.txt", { type: "text/plain" });
    const { store } = createTransitFileStoreWithRead(1024, file);
    const result = await executeUpload(
      { projectRef, bucketId: "documents", objectPath: "a/../secret", file: { fileId: "transit-file-1" } },
      store,
    );
    expect(result).toMatchObject({
      ok: false,
      error: { code: "invalid_input", message: "objectPath must not contain . or .. path segments" },
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects a projectRef that could change the Storage host", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const file = new File([new Uint8Array([1])], "a.txt", { type: "text/plain" });
    const { store } = createTransitFileStoreWithRead(1024, file);
    const result = await executeUpload(
      {
        projectRef: "evil.example.com",
        bucketId: "documents",
        objectPath: "a.txt",
        file: { fileId: "transit-file-1" },
      },
      store,
    );
    expect(result).toMatchObject({ ok: false, error: { code: "invalid_input" } });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns clear error before egress when transit storage is unavailable", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const result = await executeUpload({
      projectRef,
      bucketId: "documents",
      objectPath: "a.txt",
      file: { fileId: "transit-file-1" },
    });
    expect(result).toMatchObject({
      ok: false,
      error: { code: "invalid_input", message: "supabase upload_storage_object requires local transit file storage" },
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("preserves boundary whitespace in objectPath", async () => {
    const file = new File([new Uint8Array([1])], "a.txt", { type: "text/plain" });
    const requests = stubResponses([
      Response.json([apiKeyRecord({ id: "secret-1", name: "default", type: "secret", api_key: "sb_secret_test" })]),
      new Response("", { headers: {} }),
    ]);
    const { store } = createTransitFileStoreWithRead(1024, file);
    const result = await executeUpload(
      { projectRef, bucketId: "documents", objectPath: " reports/a.txt ", file: { fileId: "transit-file-1" } },
      store,
    );
    expect(result.ok).toBe(true);
    expect(requests[1]?.url.pathname).toBe("/storage/v1/object/documents/%20reports/a.txt%20");
  });

  it("sends cache-control and content-type overrides", async () => {
    const file = new File([new Uint8Array([1])], "a.txt", { type: "text/plain" });
    const requests = stubResponses([
      Response.json([apiKeyRecord({ id: "secret-1", name: "default", type: "secret", api_key: "sb_secret_test" })]),
      new Response("", { headers: { etag: '"etag-2"' } }),
    ]);
    const { store } = createTransitFileStoreWithRead(1024, file);
    const result = await executeUpload(
      {
        projectRef,
        bucketId: "documents",
        objectPath: "a.txt",
        file: { fileId: "transit-file-1" },
        contentType: "text/csv",
        cacheControl: "3600",
      },
      store,
    );
    expect(result.ok).toBe(true);
    expect(requests[1]?.url.pathname).toBe("/storage/v1/object/documents/a.txt");
    expect(requests[1]?.headers["content-type"]).toBe("text/csv");
    expect(requests[1]?.headers["cache-control"]).toBe("3600");
    expect(requests[1]?.headers["x-upsert"]).toBe("true");
    expect(requests[1]?.method).toBe("POST");
    expect(requests[1]?.bodyBytes).toEqual(new Uint8Array([1]));
  });

  it("does not send x-upsert when upsert:false", async () => {
    const file = new File([new Uint8Array([9])], "a.txt", { type: "text/plain" });
    const requests = stubResponses([
      Response.json([apiKeyRecord({ id: "secret-1", name: "default", type: "secret", api_key: "sb_secret_test" })]),
      new Response("", { headers: {} }),
    ]);
    const { store } = createTransitFileStoreWithRead(1024, file);
    const result = await executeUpload(
      {
        projectRef,
        bucketId: "documents",
        objectPath: "a.txt",
        file: { fileId: "transit-file-1" },
        upsert: false,
      },
      store,
    );
    expect(result.ok).toBe(true);
    expect(requests[1]?.headers["x-upsert"]).toBeUndefined();
    expect(requests[1]?.method).toBe("POST");
  });

  it("falls back to source mimeType when input.contentType is omitted", async () => {
    const file = new File([new Uint8Array([1, 2])], "image.bin", { type: "image/png" });
    const requests = stubResponses([
      Response.json([apiKeyRecord({ id: "secret-1", name: "default", type: "secret", api_key: "sb_secret_test" })]),
      new Response("", { headers: {} }),
    ]);
    const { store } = createTransitFileStoreWithRead(1024, file);
    const result = await executeUpload(
      { projectRef, bucketId: "documents", objectPath: "image.bin", file: { fileId: "transit-file-1" } },
      store,
    );
    expect(result.ok).toBe(true);
    expect((result as { ok: true; output: { mimeType: string } }).output.mimeType).toBe("image/png");
    expect(requests[1]?.headers["content-type"]).toBe("image/png");
  });

  it("defaults content-type to application/octet-stream when source has no mime", async () => {
    const file = new File([new Uint8Array([1])], "a.bin", { type: "" });
    const requests = stubResponses([
      Response.json([apiKeyRecord({ id: "secret-1", name: "default", type: "secret", api_key: "sb_secret_test" })]),
      new Response("", { headers: {} }),
    ]);
    const { store } = createTransitFileStoreWithRead(1024, file);
    // Empty mime -> createTransitFileStoreWithRead uses file.type which is ""
    // Override store.read to return mimeType ""
    const customStore: typeof store = {
      ...store,
      read: async () => ({ file, sizeBytes: file.size, name: file.name, mimeType: "" }),
    };
    const result = await executeUpload(
      { projectRef, bucketId: "documents", objectPath: "a.bin", file: { fileId: "transit-file-1" } },
      customStore,
    );
    expect(result.ok).toBe(true);
    expect(requests[1]?.headers["content-type"]).toBe("application/octet-stream");
  });

  it("respects file.name override via readTransitFileInput", async () => {
    const file = new File([new Uint8Array([1, 2, 3])], "original.txt", { type: "text/plain" });
    stubResponses([
      Response.json([apiKeyRecord({ id: "secret-1", name: "default", type: "secret", api_key: "sb_secret_test" })]),
      new Response("", { headers: { etag: '"etag-override"' } }),
    ]);
    const { store } = createTransitFileStoreWithRead(1024, file);
    const result = await executeUpload(
      {
        projectRef,
        bucketId: "documents",
        objectPath: "a.txt",
        file: { fileId: "transit-file-1", name: "override.txt" },
      },
      store,
    );
    expect(result.ok).toBe(true);
    expect((result as { ok: true; output: { name: string } }).output.name).toBe("override.txt");
  });

  it("rejects when no elevated key is available (only publishable)", async () => {
    const file = new File([new Uint8Array([1])], "a.txt", { type: "text/plain" });
    stubResponses([
      Response.json([
        apiKeyRecord({ id: "pub-1", name: "default", type: "publishable", api_key: "sb_publishable_test" }),
      ]),
    ]);
    const { store } = createTransitFileStoreWithRead(1024, file);
    const result = await executeUpload(
      { projectRef, bucketId: "documents", objectPath: "a.txt", file: { fileId: "transit-file-1" } },
      store,
    );
    expect(result).toMatchObject({ ok: false, error: { code: "invalid_input" } });
    expect((result as { ok: false; error: { message: string } }).error.message).toContain(
      "Supabase Storage upload requires a revealed secret or legacy service_role project API key",
    );
  });

  it("maps storage 401 via createSupabaseError to authorization_failed", async () => {
    const file = new File([new Uint8Array([1])], "a.txt", { type: "text/plain" });
    stubResponses([
      Response.json([apiKeyRecord({ id: "secret-1", name: "default", type: "secret", api_key: "sb_secret_test" })]),
      new Response(JSON.stringify({ message: "Unauthorized" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      }),
    ]);
    const { store } = createTransitFileStoreWithRead(1024, file);
    const result = await executeUpload(
      { projectRef, bucketId: "documents", objectPath: "a.txt", file: { fileId: "transit-file-1" } },
      store,
    );
    expect(result).toMatchObject({ ok: false, error: { code: "authorization_failed" } });
  });

  it("maps storage 404 via createSupabaseError to invalid_input", async () => {
    const file = new File([new Uint8Array([1])], "a.txt", { type: "text/plain" });
    stubResponses([
      Response.json([apiKeyRecord({ id: "secret-1", name: "default", type: "secret", api_key: "sb_secret_test" })]),
      new Response(JSON.stringify({ message: "Not found" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      }),
    ]);
    const { store } = createTransitFileStoreWithRead(1024, file);
    const result = await executeUpload(
      { projectRef, bucketId: "documents", objectPath: "a.txt", file: { fileId: "transit-file-1" } },
      store,
    );
    expect(result).toMatchObject({ ok: false, error: { code: "invalid_input" } });
  });

  it("rejects invalid file.fileId via readTransitFileInput", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const file = new File([new Uint8Array([1])], "a.txt", { type: "text/plain" });
    const { store } = createTransitFileStoreWithRead(1024, file);
    const result = await executeUpload(
      { projectRef, bucketId: "documents", objectPath: "a.txt", file: { fileId: "" } },
      store,
    );
    expect(result).toMatchObject({ ok: false, error: { code: "invalid_input" } });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects oversized upload before reading file bytes", async () => {
    const file = new File([new Uint8Array([1, 2, 3, 4])], "big.bin", { type: "application/octet-stream" });
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const { store } = createTransitFileStoreWithRead(2, file);
    // Make read return sizeBytes > maxBytes (store.read returns file.size=4, maxBytes=2)
    // Need custom store that returns sizeBytes 4
    const oversizedStore = {
      ...store,
      maxBytes: 2,
      read: async () => ({ file, sizeBytes: 4, name: file.name, mimeType: file.type }),
    };
    const result = await executeUpload(
      { projectRef, bucketId: "documents", objectPath: "big.bin", file: { fileId: "transit-file-1" } },
      oversizedStore,
    );
    expect(result).toMatchObject({ ok: false, error: { code: "invalid_input" } });
    expect(fetch).not.toHaveBeenCalled();
  });
});

function apiKeyRecord(input: {
  id: string;
  name: string;
  type: "legacy" | "publishable" | "secret";
  api_key: string;
}): Record<string, unknown> {
  return {
    ...input,
    prefix: input.api_key.slice(0, 8),
    hash: `hash-${input.id}`,
  };
}

function stubResponses(responses: Response[]): CapturedRequest[] {
  const requests: CapturedRequest[] = [];
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const headers: Record<string, string> = {};
    request.headers.forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });
    let bodyBytes: Uint8Array | null = null;
    if (init?.body instanceof Uint8Array) {
      bodyBytes = init.body;
    } else if (init?.body instanceof ArrayBuffer) {
      bodyBytes = new Uint8Array(init.body);
    } else if (typeof init?.body === "string") {
      bodyBytes = new TextEncoder().encode(init.body);
    } else if (request.method !== "GET" && request.method !== "HEAD") {
      const clone = request.clone();
      const ab = await clone.arrayBuffer().catch(() => null);
      if (ab && ab.byteLength > 0) bodyBytes = new Uint8Array(ab);
    }
    requests.push({
      url: new URL(request.url),
      method: request.method,
      authorization: request.headers.get("authorization"),
      apiKey: request.headers.get("apikey"),
      headers,
      bodyBytes,
    });
    const response = responses.shift();
    if (!response) {
      throw new Error(`Unexpected Supabase request to ${request.url}`);
    }
    return response;
  });
  return requests;
}

function createTransitFileStoreWithRead(
  maxBytes: number,
  file: File,
): {
  store: TransitFileStore;
  create: ReturnType<typeof vi.fn<TransitFileStore["create"]>>;
} {
  const create = vi.fn<TransitFileStore["create"]>(async (f) => ({
    fileId: "transit-file-1",
    downloadUrl: "http://localhost/api/files/transit-file-1",
    sizeBytes: f.size,
    name: f.name,
    mimeType: f.type,
  }));
  return {
    create,
    store: {
      maxBytes,
      create,
      async read() {
        return { file, sizeBytes: file.size, name: file.name, mimeType: file.type };
      },
      async delete() {
        return false;
      },
    },
  };
}

function createTransitFileStore(maxBytes: number): {
  store: TransitFileStore;
  create: ReturnType<typeof vi.fn<TransitFileStore["create"]>>;
} {
  const create = vi.fn<TransitFileStore["create"]>(async (file) => ({
    fileId: "transit-file-1",
    downloadUrl: "http://localhost/api/files/transit-file-1",
    sizeBytes: file.size,
    name: file.name,
    mimeType: file.type,
  }));
  return {
    create,
    store: {
      maxBytes,
      create,
      async read() {
        throw new Error("read is not expected in this test");
      },
      async delete() {
        return false;
      },
    },
  };
}

async function executeUpload(input: Record<string, unknown>, transitFiles?: TransitFileStore) {
  const context: ExecutionContext = {
    getCredential: async (service) => {
      expect(service).toBe("supabase");
      return oauthCredential;
    },
  };
  if (transitFiles) {
    context.transitFiles = transitFiles;
  }
  return executeAction(
    provider.actions.find((action) => action.name === "upload_storage_object")!,
    executors["supabase.upload_storage_object"],
    input,
    context,
  );
}

async function executeDownload(input: Record<string, unknown>, transitFiles?: TransitFileStore) {
  const context: ExecutionContext = {
    getCredential: async (service) => {
      expect(service).toBe("supabase");
      return oauthCredential;
    },
  };
  if (transitFiles) {
    context.transitFiles = transitFiles;
  }
  return executeAction(
    provider.actions.find((action) => action.name === "download_storage_object")!,
    executors["supabase.download_storage_object"],
    input,
    context,
  );
}
