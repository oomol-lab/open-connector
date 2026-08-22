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
  authorization: string | null;
  apiKey: string | null;
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
    requests.push({
      url: new URL(request.url),
      authorization: request.headers.get("authorization"),
      apiKey: request.headers.get("apikey"),
    });
    const response = responses.shift();
    if (!response) {
      throw new Error(`Unexpected Supabase request to ${request.url}`);
    }
    return response;
  });
  return requests;
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
