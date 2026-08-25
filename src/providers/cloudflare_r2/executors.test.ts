import type { ExecutionContext, ResolvedCredential, TransitFileStore } from "../../core/types.ts";

import { afterEach, describe, expect, it, vi } from "vitest";
import { executors } from "./executors.ts";

interface CapturedRequest {
  url: URL;
  authorization: string | null;
  jurisdiction: string | null;
}

const oauthCredential: Extract<ResolvedCredential, { authType: "oauth2" }> = {
  authType: "oauth2",
  accessToken: "cloudflare-access-token",
  tokenType: "Bearer",
  profile: { accountId: "account-1", displayName: "Cloudflare test", grantedScopes: [] },
  metadata: { accountId: "account-1" },
};

const customCredential: Extract<ResolvedCredential, { authType: "custom_credential" }> = {
  authType: "custom_credential",
  values: {
    apiKey: "cf-api-token-secret",
    accountId: "account-1",
  },
  profile: { accountId: "account-1", displayName: "Cloudflare R2 test", grantedScopes: [] },
  metadata: { accountId: "account-1", tokenId: "token-id-1" },
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Cloudflare R2 download_object", () => {
  it("downloads an object byte-for-byte into transit storage", async () => {
    const content = new Uint8Array([82, 50, 0, 255]);
    const requests = stubResponses([
      new Response(content, {
        headers: {
          "content-type": "application/pdf",
          etag: '"etag-1"',
        },
      }),
    ]);
    const { store, create } = createTransitFileStore(1024);

    const result = await executeDownload(
      { bucketName: "documents", objectKey: "reports/annual report #1.pdf", jurisdiction: "eu" },
      store,
    );

    expect(result).toEqual({
      ok: true,
      output: {
        fileId: "reports/annual report #1.pdf",
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
    expect(requests).toHaveLength(1);
    expect(requests[0]?.url.pathname).toBe(
      "/client/v4/accounts/account-1/r2/buckets/documents/objects/reports/annual%20report%20%231.pdf",
    );
    expect(requests[0]?.authorization).toBe("Bearer cloudflare-access-token");
    expect(requests[0]?.jurisdiction).toBe("eu");
    expect(create).toHaveBeenCalledOnce();
    const storedFile = create.mock.calls[0]![0];
    expect(new Uint8Array(await storedFile.arrayBuffer())).toEqual(content);
  });

  it("preserves boundary whitespace and strictly encodes reserved key characters", async () => {
    const objectKey = " reports/file!'()*.txt ";
    const requests = stubResponses([new Response("ok")]);
    const { store } = createTransitFileStore(1024);

    const result = await executeDownload({ bucketName: "documents", objectKey, fileName: "report.txt" }, store);

    expect(result).toMatchObject({
      ok: true,
      output: {
        fileId: objectKey,
        name: "report.txt",
        file: { name: "report.txt" },
      },
    });
    expect(requests[0]?.url.pathname).toBe(
      "/client/v4/accounts/account-1/r2/buckets/documents/objects/%20reports/file%21%27%28%29%2A.txt%20",
    );
  });

  it("rejects dot segments instead of normalizing the object key", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const { store } = createTransitFileStore(1024);

    const result = await executeDownload({ bucketName: "documents", objectKey: "a/../secret" }, store);

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "invalid_input",
        message: "objectKey must not contain . or .. path segments",
      },
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("honors the transit size limit without storing a partial object", async () => {
    const requests = stubResponses([new Response(new Uint8Array([1, 2, 3]))]);
    const { store, create } = createTransitFileStore(2);

    const result = await executeDownload({ bucketName: "documents", objectKey: "large.bin" }, store);

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "invalid_input",
        message: "Cloudflare R2 download exceeds 2 bytes",
        details: { status: 413 },
      },
    });
    expect(requests).toHaveLength(1);
    expect(create).not.toHaveBeenCalled();
  });

  it("returns a clear error when transit file storage is unavailable", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);

    const result = await executeDownload({ bucketName: "documents", objectKey: "report.pdf" });

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "invalid_input",
        message: "cloudflare_r2 download_object requires local transit file storage",
      },
    });
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("Cloudflare R2 generate_presigned_url", () => {
  it("signs locally from a custom API token without sending a network request", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);

    const result = await executePresign({
      bucketName: "documents",
      objectKey: "reports/annual report #1.txt",
      method: "HEAD",
      expiresSeconds: 120,
    });

    expect(result).toMatchObject({
      ok: true,
      output: {
        bucketName: "documents",
        objectKey: "reports/annual report #1.txt",
        method: "HEAD",
        expiresSeconds: 120,
        requiredHeaders: {},
      },
    });
    expect(result.ok).toBe(true);
    const output = readPresignedOutput(result);
    const url = new URL(String(output.url));
    expect(url.hostname).toBe("account-1.r2.cloudflarestorage.com");
    expect(url.pathname).toBe("/documents/reports/annual%20report%20%231.txt");
    expect(url.searchParams.get("X-Amz-Algorithm")).toBe("AWS4-HMAC-SHA256");
    expect(url.searchParams.get("X-Amz-Credential")).toMatch(/^token-id-1\/\d{8}\/auto\/s3\/aws4_request$/);
    expect(url.searchParams.get("X-Amz-Expires")).toBe("120");
    expect(url.searchParams.get("X-Amz-SignedHeaders")).toBe("host");
    expect(url.searchParams.get("X-Amz-Signature")).toMatch(/^[0-9a-f]{64}$/);
    expect(typeof output.expiresAt).toBe("string");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("defaults method to GET and expiresSeconds to 3600", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);

    const result = await executePresign({
      bucketName: "documents",
      objectKey: "notes.txt",
    });

    expect(result).toMatchObject({
      ok: true,
      output: {
        method: "GET",
        expiresSeconds: 3600,
      },
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("includes signed Content-Type headers for PUT URLs", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);

    const result = await executePresign({
      bucketName: "documents",
      objectKey: "notes.txt",
      method: "PUT",
      contentType: "text/plain",
      jurisdiction: "eu",
    });

    expect(result).toMatchObject({
      ok: true,
      output: {
        method: "PUT",
        requiredHeaders: { "content-type": "text/plain" },
      },
    });
    expect(result.ok).toBe(true);
    const url = new URL(String(readPresignedOutput(result).url));
    expect(url.hostname).toBe("account-1.eu.r2.cloudflarestorage.com");
    expect(url.searchParams.get("X-Amz-SignedHeaders")).toBe("content-type;host");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("discovers the token ID when custom-credential metadata omitted it", async () => {
    const requests = stubJsonResponses([
      {
        success: true,
        result: { id: "verified-token-id", status: "active" },
      },
    ]);

    const result = await executePresign(
      { bucketName: "documents", objectKey: "notes.txt", method: "GET" },
      {
        ...customCredential,
        metadata: { accountId: "account-1" },
      },
    );

    expect(result.ok).toBe(true);
    const url = new URL(String(readPresignedOutput(result).url));
    expect(url.searchParams.get("X-Amz-Credential")).toMatch(/^verified-token-id\//);
    expect(requests).toHaveLength(1);
    expect(requests[0]?.url.pathname).toBe("/client/v4/user/tokens/verify");
  });

  it("falls back to account token verification after a user-token verify failure", async () => {
    const requests = stubResponses([
      new Response(JSON.stringify({ success: false, errors: [{ message: "not a user token" }] }), { status: 400 }),
      new Response(JSON.stringify({ success: true, result: { id: "account-token-id", status: "active" } })),
    ]);

    const result = await executePresign(
      { bucketName: "documents", objectKey: "notes.txt", method: "GET" },
      {
        ...customCredential,
        metadata: { accountId: "account-1" },
      },
    );

    expect(result.ok).toBe(true);
    const url = new URL(String(readPresignedOutput(result).url));
    expect(url.searchParams.get("X-Amz-Credential")).toMatch(/^account-token-id\//);
    expect(requests.map((request) => request.url.pathname)).toEqual([
      "/client/v4/user/tokens/verify",
      "/client/v4/accounts/account-1/tokens/verify",
    ]);
  });

  it("rejects OAuth credentials without calling Cloudflare", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);

    const result = await executePresign({ bucketName: "documents", objectKey: "notes.txt" }, oauthCredential);

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "invalid_input",
        message:
          "cloudflare_r2.generate_presigned_url requires a custom API token credential. OAuth connections cannot mint R2 S3 signatures.",
        details: {
          status: 400,
          details: {
            action: "cloudflare_r2.generate_presigned_url",
            authType: "oauth2",
            requiredAuthType: "custom_credential",
          },
        },
      },
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects expiresSeconds outside the allowed range without sending a network request", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);

    const result = await executePresign({
      bucketName: "documents",
      objectKey: "notes.txt",
      expiresSeconds: 604801,
    });

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "invalid_input",
        message: "expiresSeconds must be an integer between 1 and 604800",
      },
    });
    expect(fetch).not.toHaveBeenCalled();
  });
});

function stubResponses(responses: Response[]): CapturedRequest[] {
  const requests: CapturedRequest[] = [];
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init);
    requests.push({
      url: new URL(request.url),
      authorization: request.headers.get("authorization"),
      jurisdiction: request.headers.get("cf-r2-jurisdiction"),
    });
    const response = responses.shift();
    if (!response) {
      throw new Error(`Unexpected Cloudflare R2 request to ${request.url}`);
    }
    return response;
  });
  return requests;
}

function stubJsonResponses(payloads: unknown[]): CapturedRequest[] {
  return stubResponses(payloads.map((payload) => new Response(JSON.stringify(payload))));
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
      expect(service).toBe("cloudflare_r2");
      return oauthCredential;
    },
  };
  if (transitFiles) {
    context.transitFiles = transitFiles;
  }
  return executors["cloudflare_r2.download_object"]!(input, context);
}

async function executePresign(input: Record<string, unknown>, credential: ResolvedCredential = customCredential) {
  const context: ExecutionContext = {
    getCredential: async (service) => {
      expect(service).toBe("cloudflare_r2");
      return credential;
    },
  };
  return executors["cloudflare_r2.generate_presigned_url"]!(input, context);
}

function readPresignedOutput(result: { ok: boolean; output?: unknown }): Record<string, unknown> {
  expect(result.output).toEqual(expect.any(Object));
  return result.output as Record<string, unknown>;
}
