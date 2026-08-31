import type { ExecutionContext, ResolvedCredential, TransitFileStore } from "../../core/types.ts";

import AliOss from "ali-oss";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { executeAction as executeValidatedAction } from "../../core/execution.ts";
import { setDefaultGuardedFetchDnsLookup } from "../../core/guarded-fetch.ts";
import { provider } from "./definition.ts";
import { executors } from "./executors.ts";

interface CapturedRequest {
  url: URL;
  authorization: string | null;
  headers: Record<string, string>;
}

interface AliyunOssSigner {
  authorization(
    method: string,
    resource: string,
    subres: Record<string, string>,
    headers: Record<string, string>,
  ): string;
}

const credential: Extract<ResolvedCredential, { authType: "custom_credential" }> = {
  authType: "custom_credential",
  values: {
    accessKeyId: "LTAIEXAMPLE",
    accessKeySecret: "secretAccessKeyExample",
    endpoint: "oss-cn-hangzhou.aliyuncs.com",
    bucket: "documents",
  },
  profile: { accountId: "LTAIEXAMPLE", displayName: "Alibaba Cloud OSS test", grantedScopes: [] },
  metadata: { endpoint: "https://oss-cn-hangzhou.aliyuncs.com", bucket: "documents" },
};

beforeEach(() => {
  setDefaultGuardedFetchDnsLookup(null);
});

afterEach(() => {
  setDefaultGuardedFetchDnsLookup(undefined);
  vi.unstubAllGlobals();
});

describe("Alibaba Cloud OSS download_object", () => {
  it("downloads an object byte-for-byte into transit storage", async () => {
    const content = new Uint8Array([79, 83, 83, 0, 255]);
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
    expect(requests[0]?.url.hostname).toBe("documents.oss-cn-hangzhou.aliyuncs.com");
    expect(requests[0]?.url.pathname).toBe("/reports/annual%20report%20%231.pdf");
    expect(requests[0]?.authorization).toMatch(/^OSS LTAIEXAMPLE:/);
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

  it("signs the raw object key while sending the encoded request path", async () => {
    const objectKey = "reports/annual report #1.pdf";
    const requests = stubResponses([new Response("ok")]);
    const { store } = createTransitFileStore(1024);

    await executeDownload({ bucket: "documents", objectKey }, store);

    const request = requests[0]!;
    expect(request.url.pathname).toBe("/reports/annual%20report%20%231.pdf");

    const signedHeaders = { ...request.headers };
    delete signedHeaders.authorization;
    const client = new AliOss({
      accessKeyId: credential.values.accessKeyId,
      accessKeySecret: credential.values.accessKeySecret,
      endpoint: "oss-cn-hangzhou.aliyuncs.com",
      bucket: "documents",
      secure: true,
    }) as unknown as AliyunOssSigner;
    expect(request.authorization).toBe(client.authorization("GET", `/documents/${objectKey}`, {}, signedHeaders));
    expect(request.authorization).not.toBe(
      client.authorization("GET", `/documents${request.url.pathname}`, {}, signedHeaders),
    );
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

  it("rejects bucket values that alter the provider origin", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const { store } = createTransitFileStore(1024);

    const result = await executeDownload({ bucket: "attacker.example#", objectKey: "report.pdf" }, store);

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "invalid_input",
        message: "bucket must not alter the Alibaba Cloud OSS endpoint",
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
        message: "Alibaba Cloud OSS download exceeds 2 bytes",
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
        message: "aliyun_oss download_object requires local transit file storage",
      },
    });
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("Alibaba Cloud OSS put_object validation", () => {
  it("rejects when multiple content sources are provided simultaneously", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const action = provider.actions.find((a) => a.name === "put_object")!;
    expect(action).toBeDefined();
    const context: ExecutionContext = {
      getCredential: async (service) => {
        expect(service).toBe("aliyun_oss");
        return credential;
      },
    };
    const result = await executeValidatedAction(
      action,
      executors["aliyun_oss.put_object"],
      {
        bucket: "documents",
        objectKey: "reports/conflict.bin",
        sourceUrl: "https://example.com/file.bin",
        contentText: "hello",
      },
      context,
    );
    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "invalid_input",
      },
    });
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("Alibaba Cloud OSS put_object sourceUrl", () => {
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
      headers: Object.fromEntries(request.headers.entries()),
    });
    const response = responses.shift();
    if (!response) {
      throw new Error(`Unexpected Alibaba Cloud OSS request to ${request.url}`);
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
  return executeAction("aliyun_oss.download_object", input, transitFiles);
}

async function executePut(input: Record<string, unknown>) {
  return executeAction("aliyun_oss.put_object", input);
}

async function executeAction(
  action: "aliyun_oss.download_object" | "aliyun_oss.put_object",
  input: Record<string, unknown>,
  transitFiles?: TransitFileStore,
) {
  const context: ExecutionContext = {
    getCredential: async (service) => {
      expect(service).toBe("aliyun_oss");
      return credential;
    },
  };
  if (transitFiles) {
    context.transitFiles = transitFiles;
  }
  return executors[action]!(input, context);
}
