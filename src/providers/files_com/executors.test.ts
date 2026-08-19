import type { ExecutionContext, ResolvedCredential, TransitFileStore } from "../../core/types.ts";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setDefaultGuardedFetchDnsLookup } from "../../core/guarded-fetch.ts";
import { executors } from "./executors.ts";

interface CapturedRequest {
  url: URL;
  apiKey: string | null;
}

const credential: Extract<ResolvedCredential, { authType: "api_key" }> = {
  authType: "api_key",
  apiKey: "files-api-key",
  values: { apiKey: "files-api-key", subdomain: "mysite" },
  profile: { accountId: "mysite", displayName: "mysite.files.com", grantedScopes: [] },
  metadata: { subdomain: "mysite" },
};

beforeEach(() => {
  setDefaultGuardedFetchDnsLookup(null);
});

afterEach(() => {
  setDefaultGuardedFetchDnsLookup(undefined);
  vi.unstubAllGlobals();
});

describe("Files.com download_file", () => {
  it("downloads the requested path byte-for-byte into transit storage", async () => {
    const content = new Uint8Array([70, 105, 108, 0, 255]);
    const requests = stubResponses([
      Response.json({
        path: "reports/archive.bin",
        display_name: "archive.bin",
        type: "file",
        size: content.length,
        mime_type: "application/octet-stream",
        download_uri: "https://mysite.files.com/data/archive.bin?token=abc",
      }),
      new Response(content, { headers: { "content-type": "application/octet-stream" } }),
    ]);
    const { store, create } = createTransitFileStore(1024);

    const result = await executeDownload({ path: "reports/archive.bin" }, store);

    expect(result).toEqual({
      ok: true,
      output: {
        fileId: "reports/archive.bin",
        name: "archive.bin",
        mimeType: "application/octet-stream",
        sizeBytes: content.length,
        file: {
          fileId: "transit-file-1",
          downloadUrl: "http://localhost/api/files/transit-file-1",
          sizeBytes: content.length,
          name: "archive.bin",
          mimeType: "application/octet-stream",
        },
      },
    });
    expect(requests).toHaveLength(2);
    expect(requests[0]?.url.hostname).toBe("mysite.files.com");
    expect(requests[0]?.url.pathname).toBe("/api/rest/v1/files/reports/archive.bin.json");
    expect(requests[0]?.apiKey).toBe("files-api-key");
    expect(requests[1]?.url.hostname).toBe("mysite.files.com");
    expect(requests[1]?.url.pathname).toBe("/data/archive.bin");
    expect(requests[1]?.apiKey).toBeNull();
    expect(create).toHaveBeenCalledOnce();
    expect(new Uint8Array(await create.mock.calls[0]![0].arrayBuffer())).toEqual(content);
  });

  it("keeps the remote name when a transit filename override is supplied", async () => {
    const requests = stubResponses([
      Response.json({
        path: "reports/archive.bin",
        display_name: "archive.bin",
        type: "file",
        size: 2,
        download_uri: "https://mysite.files.com/data/archive.bin",
      }),
      new Response(new Uint8Array([1, 2]), { headers: { "content-type": "application/pdf" } }),
    ]);
    const { store } = createTransitFileStore(1024);

    const result = await executeDownload({ path: "reports/archive.bin", fileName: "local.pdf" }, store);

    expect(result).toMatchObject({
      ok: true,
      output: {
        fileId: "reports/archive.bin",
        name: "archive.bin",
        mimeType: "application/pdf",
        file: { name: "local.pdf" },
      },
    });
    expect(requests).toHaveLength(2);
  });

  it("rejects a file whose reported size exceeds the transit limit before downloading", async () => {
    const requests = stubResponses([
      Response.json({
        path: "large.bin",
        display_name: "large.bin",
        type: "file",
        size: 3,
        download_uri: "https://mysite.files.com/data/large.bin",
      }),
    ]);
    const { store, create } = createTransitFileStore(2);

    const result = await executeDownload({ path: "large.bin" }, store);

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "invalid_input",
        message: "Files.com file exceeds local transit limit of 2 bytes",
        details: { status: 413 },
      },
    });
    expect(requests).toHaveLength(1);
    expect(create).not.toHaveBeenCalled();
  });

  it("fails without truncating when the response exceeds the transit limit", async () => {
    const requests = stubResponses([
      Response.json({
        path: "growing.bin",
        display_name: "growing.bin",
        type: "file",
        size: 1,
        download_uri: "https://mysite.files.com/data/growing.bin",
      }),
      new Response(new Uint8Array([1, 2, 3])),
    ]);
    const { store, create } = createTransitFileStore(2);

    const result = await executeDownload({ path: "growing.bin" }, store);

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "invalid_input",
        message: "Files.com download exceeds 2 bytes",
        details: { status: 413 },
      },
    });
    expect(requests).toHaveLength(2);
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects folders and untrusted download URLs", async () => {
    const folderRequests = stubResponses([
      Response.json({
        path: "reports",
        display_name: "reports",
        type: "directory",
        size: 0,
        download_uri: "https://mysite.files.com/data/reports",
      }),
    ]);
    const { store, create } = createTransitFileStore(1024);

    const folderResult = await executeDownload({ path: "reports" }, store);

    expect(folderResult).toMatchObject({
      ok: false,
      error: { message: "files_com download_file requires a file path" },
    });
    expect(folderRequests).toHaveLength(1);
    expect(create).not.toHaveBeenCalled();

    const untrustedRequests = stubResponses([
      Response.json({
        path: "secret.bin",
        display_name: "secret.bin",
        type: "file",
        size: 1,
        download_uri: "https://attacker.example/file/secret",
      }),
    ]);

    const untrustedResult = await executeDownload({ path: "secret.bin" }, store);

    expect(untrustedResult).toMatchObject({
      ok: false,
      error: { message: "files_com returned an untrusted download URL" },
    });
    expect(untrustedRequests).toHaveLength(1);
  });

  it("rejects private, metadata, and non-https download URLs", async () => {
    const { store, create } = createTransitFileStore(1024);

    for (const downloadUri of [
      "https://169.254.169.254/latest/meta-data/",
      "https://10.0.0.5/secret.bin",
      "https://metadata/secret.bin",
      "http://mysite.files.com/data/secret.bin",
    ]) {
      stubResponses([
        Response.json({
          path: "secret.bin",
          display_name: "secret.bin",
          type: "file",
          size: 1,
          download_uri: downloadUri,
        }),
      ]);

      const result = await executeDownload({ path: "secret.bin" }, store);
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("expected failure");
      expect(result.error.message).toMatch(/private or reserved|cloud metadata hosts|untrusted download URL/);
      expect(create).not.toHaveBeenCalled();
    }
  });

  it("downloads Files.com native S3 storage URLs and rejects other S3 buckets", async () => {
    const content = new Uint8Array([1, 2, 3]);
    const allowedRequests = stubResponses([
      Response.json({
        path: "reports/archive.bin",
        display_name: "archive.bin",
        type: "file",
        size: content.length,
        download_uri: "https://s3.amazonaws.com/objects.brickftp.com/archive.bin?X-Amz-Signature=abc",
      }),
      new Response(content),
    ]);
    const { store, create } = createTransitFileStore(1024);

    const allowed = await executeDownload({ path: "reports/archive.bin" }, store);

    expect(allowed).toMatchObject({ ok: true, output: { fileId: "reports/archive.bin" } });
    expect(allowedRequests[1]?.url.hostname).toBe("s3.amazonaws.com");
    expect(create).toHaveBeenCalledOnce();

    const rejectedRequests = stubResponses([
      Response.json({
        path: "secret.bin",
        display_name: "secret.bin",
        type: "file",
        size: 1,
        download_uri: "https://s3.amazonaws.com/other-bucket/secret.bin",
      }),
    ]);
    create.mockClear();

    const rejected = await executeDownload({ path: "secret.bin" }, store);

    expect(rejected).toMatchObject({
      ok: false,
      error: { message: "files_com returned an untrusted download URL" },
    });
    expect(rejectedRequests).toHaveLength(1);
    expect(create).not.toHaveBeenCalled();
  });

  it("returns a clear error when transit file storage is unavailable", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);

    const result = await executeDownload({ path: "report.pdf" });

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "invalid_input",
        message: "files_com download_file requires local transit file storage",
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
      apiKey: request.headers.get("x-filesapi-key"),
    });
    const response = responses.shift();
    if (!response) {
      throw new Error(`Unexpected Files.com request to ${request.url}`);
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
      expect(service).toBe("files_com");
      return credential;
    },
  };
  if (transitFiles) {
    context.transitFiles = transitFiles;
  }
  return executors["files_com.download_file"]!(input, context);
}
