import type { ExecutionContext, ResolvedCredential, TransitFileStore } from "../../core/types.ts";

import { afterEach, describe, expect, it, vi } from "vitest";
import { executors } from "./executors.ts";

interface CapturedRequest {
  url: string;
  method: string;
  authorization: string | null;
  contentType: string | null;
  bodyText: string;
}

const credential: Extract<ResolvedCredential, { authType: "api_key" }> = {
  authType: "api_key",
  apiKey: "napi_test",
  values: { apiKey: "napi_test" },
  profile: { accountId: "user-1", displayName: "Neon test", grantedScopes: [] },
  metadata: {},
};

const branch = { projectId: "proj-1", branchId: "br-1" };
const apiBranchPath = "https://console.neon.tech/api/v2/projects/proj-1/branches/br-1";
const s3Url = "https://br-1.storage.c-7.us-east-2.aws.neon.tech/media";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Neon Object Storage actions", () => {
  it.each([" report.csv ", " "])("preserves the exact object key %j across object operations", async (objectKey) => {
    const presigned = {
      url: `${s3Url}/object?sig=1`,
      method: "PUT",
      headers: {},
      expires_at: "2026-11-02T08:00:00Z",
    };
    const requests = stubResponses([
      new Response(null, { status: 204 }),
      Response.json(presigned),
      Response.json(presigned),
      new Response(null),
      Response.json({ ...presigned, method: "GET" }),
      new Response("contents"),
    ]);
    const input = { ...branch, bucketName: "media", objectKey };
    const { store } = createTransitFileStore();
    const results = [
      await execute("delete_object", input),
      await execute("generate_presigned_url", input),
      await execute("put_object", { ...input, contentText: "contents" }),
      await execute("download_object", input, store),
    ];

    for (const result of results) {
      expect(result).toMatchObject({ ok: true, output: { objectKey } });
    }
    const objectUrl = `${apiBranchPath}/buckets/media/objects/${encodeURIComponent(objectKey)}`;
    expect(requests.map(({ url }) => url)).toEqual([
      objectUrl,
      `${objectUrl}/presign`,
      `${objectUrl}/presign`,
      presigned.url,
      `${objectUrl}/presign`,
      presigned.url,
    ]);
  });

  it("preserves whitespace in listing and deletion prefixes", async () => {
    const prefix = " reports/";
    const requests = stubResponses([
      Response.json({ objects: [], folders: [], prefix, is_truncated: false }),
      Response.json({ deleted: 2 }),
    ]);
    const input = { ...branch, bucketName: "media", prefix };

    expect(await execute("list_objects", input)).toMatchObject({ ok: true, output: { prefix } });
    expect(await execute("delete_objects_by_prefix", input)).toMatchObject({
      ok: true,
      output: { prefix, deletedCount: 2 },
    });
    expect(requests.map(({ url }) => new URL(url).searchParams.get("prefix"))).toEqual([prefix, prefix]);
  });

  it.each(["projectId", "branchId", "bucketName", "objectKey"])(
    "rejects dot segments in %s before sending a request",
    async (field) => {
      const requests = stubResponses([]);
      for (const value of [".", ".."]) {
        const result = await execute("delete_object", {
          ...branch,
          bucketName: "media",
          objectKey: "report.csv",
          [field]: value,
        });
        expect(result).toMatchObject({ ok: false, error: { code: "invalid_input" } });
        expect(requests).toHaveLength(0);
      }
    },
  );

  it.each([".hidden", "a/../b", "%2e%2e"])("keeps non-traversing object key %j as one segment", async (objectKey) => {
    const requests = stubResponses([new Response(null, { status: 204 })]);

    expect(await execute("delete_object", { ...branch, bucketName: "media", objectKey })).toMatchObject({ ok: true });
    expect(requests[0]?.url).toBe(`${apiBranchPath}/buckets/media/objects/${encodeURIComponent(objectKey)}`);
  });

  it("sends object keys as one encoded path segment", async () => {
    const requests = stubResponses([new Response(null, { status: 204 })]);

    const result = await execute("delete_object", { ...branch, bucketName: "media", objectKey: "a/b c+d.txt" });

    expect(result).toEqual({ ok: true, output: { deleted: true, bucketName: "media", objectKey: "a/b c+d.txt" } });
    expect(requests[0]).toMatchObject({
      method: "DELETE",
      url: `${apiBranchPath}/buckets/media/objects/a%2Fb%20c%2Bd.txt`,
      authorization: "Bearer napi_test",
    });
  });

  it("uploads through a presigned PUT with the signed headers", async () => {
    const requests = stubResponses([
      Response.json({
        url: `${s3Url}/notes/hello.txt?X-Amz-Signature=abc`,
        method: "PUT",
        headers: { "Content-Type": "text/plain; charset=utf-8" },
        expires_at: "2026-11-02T08:00:00Z",
      }),
      new Response(null, { headers: { etag: '"etag-1"' } }),
    ]);

    const result = await execute("put_object", {
      ...branch,
      bucketName: "media",
      objectKey: "notes/hello.txt",
      contentText: "héllo",
    });

    expect(result).toEqual({
      ok: true,
      output: {
        bucketName: "media",
        objectKey: "notes/hello.txt",
        contentType: "text/plain; charset=utf-8",
        sizeBytes: 6,
        etag: "etag-1",
      },
    });
    expect(requests[0]).toMatchObject({
      method: "POST",
      url: `${apiBranchPath}/buckets/media/objects/notes%2Fhello.txt/presign`,
    });
    expect(JSON.parse(requests[0]!.bodyText)).toEqual({
      operation: "upload",
      content_type: "text/plain; charset=utf-8",
    });
    expect(requests[1]).toMatchObject({
      method: "PUT",
      url: `${s3Url}/notes/hello.txt?X-Amz-Signature=abc`,
      authorization: null,
      contentType: "text/plain; charset=utf-8",
      bodyText: "héllo",
    });
  });

  it("rejects a private sourceUrl before any request", async () => {
    const requests = stubResponses([]);

    const result = await execute("put_object", {
      ...branch,
      bucketName: "media",
      objectKey: "x.txt",
      sourceUrl: "http://169.254.169.254/latest/meta-data",
    });

    expect(result).toMatchObject({ ok: false, error: { code: "invalid_input" } });
    expect(requests).toHaveLength(0);
  });

  it("downloads through a presigned GET and keeps the stored content type", async () => {
    stubResponses([
      Response.json({
        url: `${s3Url}/img/pixel.png?sig=1`,
        method: "GET",
        headers: {},
        expires_at: "2026-11-02T08:00:00Z",
      }),
      new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/png" } }),
    ]);
    const { store, create } = createTransitFileStore();

    const result = await execute(
      "download_object",
      { ...branch, bucketName: "media", objectKey: "img/pixel.png" },
      store,
    );

    expect(result).toMatchObject({
      ok: true,
      output: {
        bucketName: "media",
        objectKey: "img/pixel.png",
        name: "pixel.png",
        mimeType: "image/png",
        sizeBytes: 3,
      },
    });
    expect(new Uint8Array(await create.mock.calls[0]![0].arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("maps a missing object on the data plane to invalid input", async () => {
    stubResponses([
      Response.json({
        url: `${s3Url}/missing.txt?sig=1`,
        method: "GET",
        headers: {},
        expires_at: "2026-11-02T08:00:00Z",
      }),
      new Response("<Error><Code>NoSuchKey</Code></Error>", { status: 404 }),
    ]);
    const { store } = createTransitFileStore();

    const result = await execute(
      "download_object",
      { ...branch, bucketName: "media", objectKey: "missing.txt" },
      store,
    );

    expect(result).toMatchObject({
      ok: false,
      error: { code: "invalid_input", message: "Neon object not found: missing.txt" },
    });
  });

  it("returns presigned headers verbatim and an empty cursor as null", async () => {
    stubResponses([
      Response.json({
        url: `${s3Url}/a.csv?sig=1`,
        method: "PUT",
        headers: { "Content-Type": "text/csv" },
        expires_at: "2026-11-02T08:00:00Z",
      }),
      Response.json({ folders: ["docs/"], objects: [], prefix: "", next_cursor: "", is_truncated: false }),
    ]);

    const presigned = await execute("generate_presigned_url", {
      ...branch,
      bucketName: "media",
      objectKey: "a.csv",
      operation: "upload",
      contentType: "text/csv",
    });
    const listed = await execute("list_objects", { ...branch, bucketName: "media", delimiter: "/" });

    expect(presigned).toMatchObject({
      ok: true,
      output: { method: "PUT", requiredHeaders: { "Content-Type": "text/csv" } },
    });
    expect(listed).toEqual({
      ok: true,
      output: { objects: [], folders: ["docs/"], prefix: "", nextCursor: null, isTruncated: false },
    });
  });
});

async function execute(action: string, input: Record<string, unknown>, transitFiles?: TransitFileStore) {
  const context: ExecutionContext = {
    getCredential: async (service) => {
      expect(service).toBe("neon_object_storage");
      return credential;
    },
  };
  if (transitFiles) {
    context.transitFiles = transitFiles;
  }
  return executors[`neon_object_storage.${action}`]!(input, context);
}

function stubResponses(responses: Response[]): CapturedRequest[] {
  const requests: CapturedRequest[] = [];
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init);
    requests.push({
      url: request.url,
      method: request.method,
      authorization: request.headers.get("authorization"),
      contentType: request.headers.get("content-type"),
      bodyText: await request.text(),
    });
    const response = responses.shift();
    if (!response) {
      throw new Error(`Unexpected Neon request to ${request.url}`);
    }
    return response;
  });
  return requests;
}

function createTransitFileStore(): {
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
      maxBytes: 1024,
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
