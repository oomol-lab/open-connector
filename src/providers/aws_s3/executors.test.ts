import type { ExecutionContext, ExecutionResult, ResolvedCredential, TransitFileStore } from "../../core/types.ts";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAwsSigV4PresignedUrl } from "../../core/aws-sigv4.ts";
import { setDefaultGuardedFetchDnsLookup } from "../../core/guarded-fetch.ts";
import { executors, proxy } from "./executors.ts";

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

// Access key with an RFC 3986 unreserved `~`: form-urlencoding would turn it
// into %7E and diverge from the signed query bytes.
const tildeCredential: typeof credential = {
  ...credential,
  values: { ...credential.values, accessKeyId: "AK~IAIOSFODNN7EXAMPLE" },
  profile: { ...credential.profile, accountId: "AK~IAIOSFODNN7EXAMPLE" },
};

const goldenSigningTime = new Date("2015-08-30T12:36:00.000Z");
const helloSha256 = "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824";

beforeEach(() => {
  setDefaultGuardedFetchDnsLookup(null);
});

afterEach(() => {
  setDefaultGuardedFetchDnsLookup(undefined);
  vi.useRealTimers();
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

  it("rejects bucket and region values that alter the provider origin", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const { store } = createTransitFileStore(1024);

    const invalidBucket = await executeDownload({ bucket: "attacker.example#", objectKey: "report.pdf" }, store);
    const invalidRegion = await executeDownload(
      { bucket: "documents", region: "us-east-1.attacker.example#", objectKey: "report.pdf" },
      store,
    );

    expect(invalidBucket).toMatchObject({
      ok: false,
      error: {
        code: "invalid_input",
        message: "bucket and region must form a valid AWS S3 endpoint",
      },
    });
    expect(invalidRegion).toMatchObject({
      ok: false,
      error: {
        code: "invalid_input",
        message: "bucket and region must form a valid AWS S3 endpoint",
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

// Signature bytes below were frozen from the code-point-ordered SigV4
// canonical form (the byte order AWS requires); they must stay byte-identical
// across refactors of the shared SigV4 helpers.
describe("AWS S3 SigV4 golden vectors", () => {
  beforeEach(() => {
    vi.setSystemTime(goldenSigningTime);
  });

  it("orders signed metadata headers by code point", async () => {
    const requests = stubResponses([new Response("", { headers: { etag: '"etag-2"' } })]);

    const result = await executePut({
      bucket: "documents",
      objectKey: "test.txt",
      contentText: "hello",
      metadata: { "file-name": "a", file_name: "b" },
    });

    expect(result).toEqual({
      ok: true,
      output: {
        bucket: "documents",
        objectKey: "test.txt",
        url: "https://documents.s3.us-east-1.amazonaws.com/test.txt",
        etag: '"etag-2"',
      },
    });
    expect(requests).toHaveLength(1);
    expect(requests[0]?.amzContentSha256).toBe(helloSha256);
    // "-" (0x2D) sorts before "_" (0x5F) by code point; `localeCompare` reverses them.
    expect(requests[0]?.authorization).toBe(
      "AWS4-HMAC-SHA256 Credential=AKIAEXAMPLE/20150830/us-east-1/s3/aws4_request, SignedHeaders=host;x-amz-content-sha256;x-amz-date;x-amz-meta-file-name;x-amz-meta-file_name, Signature=400a710252eabbba1228793b2b0292d9b6e2884b895275a2989725c8ad132ea3",
    );
  });

  it("signs proxy query parameters in code point order", async () => {
    const requests = stubResponses([
      new Response("<ListBucketResult/>", { headers: { "content-type": "application/xml" } }),
    ]);

    const result = await proxy({ endpoint: "/", method: "GET", query: { Prefix: "a", marker: "b" } }, createContext());

    expect(result).toMatchObject({ ok: true, response: { status: 200 } });
    expect(requests).toHaveLength(1);
    expect(requests[0]?.url.host).toBe("documents.s3.us-east-1.amazonaws.com");
    // "P" (0x50) sorts before "m" (0x6D) by code point; `localeCompare` folds case first.
    expect(requests[0]?.url.search).toBe("?Prefix=a&marker=b");
    expect(requests[0]?.amzContentSha256).toBe("UNSIGNED-PAYLOAD");
    expect(requests[0]?.authorization).toBe(
      "AWS4-HMAC-SHA256 Credential=AKIAEXAMPLE/20150830/us-east-1/s3/aws4_request, SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature=d8c2c579b616653f899461276027636f74fc150adac10884c8ac6b2f3f755dba",
    );
  });

  it("emits the presigned URL with the signed canonical query verbatim", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);

    const result = await executeAction(
      "aws_s3.generate_presigned_url",
      { bucket: "documents", objectKey: "test.txt", method: "GET", expiresSeconds: 3600 },
      undefined,
      tildeCredential,
    );

    expect(result).toEqual({
      ok: true,
      output: {
        bucket: "documents",
        objectKey: "test.txt",
        method: "GET",
        expiresSeconds: 3600,
        url: "https://documents.s3.us-east-1.amazonaws.com/test.txt?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=AK~IAIOSFODNN7EXAMPLE%2F20150830%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Date=20150830T123600Z&X-Amz-Expires=3600&X-Amz-SignedHeaders=host&X-Amz-Signature=67b824064fe6cbdde708f883647c05b220f01719b423016b5a575a4ea61cd114",
      },
    });
    const url = readOutputUrl(result);
    expect(url).toContain("X-Amz-Credential=AK~IAIOSFODNN7EXAMPLE%2F");
    expect(url).not.toContain("%7E");
    expect(url).toBe(
      createAwsSigV4PresignedUrl({
        credential: { accessKeyId: "AK~IAIOSFODNN7EXAMPLE", secretAccessKey: credential.values.secretAccessKey! },
        method: "GET",
        url: new URL("https://documents.s3.us-east-1.amazonaws.com/test.txt"),
        region: "us-east-1",
        expiresSeconds: 3600,
        now: goldenSigningTime,
      }),
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("signs header values with collapsed whitespace", async () => {
    const requests = stubResponses([new Response("")]);

    const result = await executePut({
      bucket: "documents",
      objectKey: "test.txt",
      contentText: "hello",
      contentType: "text/plain;\tcharset=utf-8",
    });

    expect(result).toMatchObject({ ok: true });
    expect(requests).toHaveLength(1);
    // Signed as `content-type:text/plain; charset=utf-8`: SigV4 collapses runs of
    // whitespace (tabs included) to a single space.
    expect(requests[0]?.authorization).toBe(
      "AWS4-HMAC-SHA256 Credential=AKIAEXAMPLE/20150830/us-east-1/s3/aws4_request, SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date, Signature=12de408d276912c098a6eb11b0aa06ac5319ca938ac4e7f94e550db60206cdbf",
    );
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

function readOutputUrl(result: ExecutionResult): string {
  const output = result.output as { url?: unknown } | undefined;
  if (!result.ok || typeof output?.url !== "string") {
    throw new Error(`expected a presigned url, got ${JSON.stringify(result)}`);
  }
  return output.url;
}

function createContext(resolvedCredential = credential, transitFiles?: TransitFileStore): ExecutionContext {
  const context: ExecutionContext = {
    getCredential: async (service) => {
      expect(service).toBe("aws_s3");
      return resolvedCredential;
    },
  };
  if (transitFiles) {
    context.transitFiles = transitFiles;
  }
  return context;
}

async function executeDownload(input: Record<string, unknown>, transitFiles?: TransitFileStore) {
  return executeAction("aws_s3.download_object", input, transitFiles);
}

async function executePut(input: Record<string, unknown>) {
  return executeAction("aws_s3.put_object", input);
}

async function executeAction(
  action: "aws_s3.download_object" | "aws_s3.put_object" | "aws_s3.generate_presigned_url",
  input: Record<string, unknown>,
  transitFiles?: TransitFileStore,
  resolvedCredential = credential,
) {
  return executors[action]!(input, createContext(resolvedCredential, transitFiles));
}
