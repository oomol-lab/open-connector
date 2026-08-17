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
