import type { ExecutionContext, ResolvedCredential, TransitFileStore } from "../../core/types.ts";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setDefaultGuardedFetchDnsLookup } from "../../core/guarded-fetch.ts";
import { executors } from "./executors.ts";

interface CapturedRequest {
  url: URL;
  authorization: string | null;
  amzContentSha256: string | null;
}

const credential: Extract<ResolvedCredential, { authType: "custom_credential" }> = {
  authType: "custom_credential",
  values: {
    accessKeyId: "AKIAEXAMPLE",
    secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
    region: "us-east-1",
    bucket: "documents",
  },
  profile: { accountId: "AKIAEXAMPLE", displayName: "AWS S3 test", grantedScopes: [] },
  metadata: { region: "us-east-1", bucket: "documents" },
};

beforeEach(() => {
  setDefaultGuardedFetchDnsLookup(null);
});

afterEach(() => {
  setDefaultGuardedFetchDnsLookup(undefined);
  vi.unstubAllGlobals();
});

describe("AWS S3 download_object", () => {
  it("downloads an object byte-for-byte into transit storage", async () => {
    const content = new Uint8Array([83, 51, 0, 255]);
    const requests = stubResponses([
      new Response(content, {
        headers: {
          "content-type": "application/pdf",
          etag: '"etag-1"',
        },
      }),
    ]);
    const { store, create } = createTransitFileStore(1024);

    const result = await executeDownload({ bucket: "documents", objectKey: "reports/annual report #1.pdf" }, store);

    expect(result).toEqual({
      ok: true,
      output: {
        objectKey: "reports/annual report #1.pdf",
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
    expect(requests[0]?.url.hostname).toBe("documents.s3.us-east-1.amazonaws.com");
    expect(requests[0]?.url.pathname).toBe("/reports/annual%20report%20%231.pdf");
    expect(requests[0]?.authorization).toMatch(/^AWS4-HMAC-SHA256 Credential=AKIAEXAMPLE\//);
    expect(requests[0]?.amzContentSha256).toBe("UNSIGNED-PAYLOAD");
    expect(create).toHaveBeenCalledOnce();
    expect(new Uint8Array(await create.mock.calls[0]![0].arrayBuffer())).toEqual(content);
  });

  it("preserves boundary whitespace and strictly encodes reserved key characters", async () => {
    const objectKey = " reports/file!'()*.txt ";
    const requests = stubResponses([new Response("ok")]);
    const { store } = createTransitFileStore(1024);

    const result = await executeDownload({ bucket: "documents", objectKey, fileName: "report.txt" }, store);

    expect(result).toMatchObject({
      ok: true,
      output: {
        objectKey,
        name: "report.txt",
        file: { name: "report.txt" },
      },
    });
    expect(requests[0]?.url.pathname).toBe("/%20reports/file%21%27%28%29%2A.txt%20");
  });

  it("rejects dot segments instead of normalizing the object key", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const { store } = createTransitFileStore(1024);

    const result = await executeDownload({ bucket: "documents", objectKey: "a/../secret" }, store);

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

    const result = await executeDownload({ bucket: "documents", objectKey: "large.bin" }, store);

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "invalid_input",
        message: "AWS S3 download exceeds 2 bytes",
        details: { status: 413 },
      },
    });
    expect(requests).toHaveLength(1);
    expect(create).not.toHaveBeenCalled();
  });

  it("returns a clear error when transit file storage is unavailable", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);

    const result = await executeDownload({ bucket: "documents", objectKey: "report.pdf" });

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "invalid_input",
        message: "aws_s3 download_object requires local transit file storage",
      },
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns 504 when the download request times out", async () => {
    const timeoutController = new AbortController();
    timeoutController.abort();
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout").mockReturnValue(timeoutController.signal);
    vi.stubGlobal("fetch", async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.signal?.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }
      throw new Error("expected download fetch to use an aborted timeout signal");
    });
    const { store } = createTransitFileStore(1024);

    try {
      const result = await executeDownload({ bucket: "documents", objectKey: "slow.bin" }, store);

      expect(result).toMatchObject({
        ok: false,
        error: {
          code: "provider_error",
          message: "aws_s3 download timed out",
          details: { status: 504 },
        },
      });
    } finally {
      timeoutSpy.mockRestore();
    }
  });
});

describe("AWS S3 put_object sourceUrl", () => {
  it("rejects a cloud-metadata sourceUrl before any outbound fetch", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);

    const result = await executePut({
      bucket: "documents",
      objectKey: "reports/source.bin",
      sourceUrl: "https://169.254.169.254/latest/meta-data/",
    });

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "invalid_input",
        message: "sourceUrl must not target private or reserved IP addresses",
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
      amzContentSha256: request.headers.get("x-amz-content-sha256"),
    });
    const response = responses.shift();
    if (!response) {
      throw new Error(`Unexpected AWS S3 request to ${request.url}`);
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
  return executeAction("aws_s3.download_object", input, transitFiles);
}

async function executePut(input: Record<string, unknown>) {
  return executeAction("aws_s3.put_object", input);
}

async function executeAction(
  action: "aws_s3.download_object" | "aws_s3.put_object",
  input: Record<string, unknown>,
  transitFiles?: TransitFileStore,
) {
  const context: ExecutionContext = {
    getCredential: async (service) => {
      expect(service).toBe("aws_s3");
      return credential;
    },
  };
  if (transitFiles) {
    context.transitFiles = transitFiles;
  }
  return executors[action]!(input, context);
}
