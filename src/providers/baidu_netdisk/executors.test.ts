import type { ExecutionContext, ResolvedCredential, TransitFileStore } from "../../core/types.ts";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setDefaultGuardedFetchDnsLookup } from "../../core/guarded-fetch.ts";
import { executors } from "./executors.ts";

interface CapturedRequest {
  url: URL;
  userAgent: string | null;
}

const oauthCredential: Extract<ResolvedCredential, { authType: "oauth2" }> = {
  authType: "oauth2",
  accessToken: "baidu-access-token",
  tokenType: "Bearer",
  profile: { accountId: "baidu:test", displayName: "Baidu test", grantedScopes: [] },
  metadata: {},
};

beforeEach(() => {
  setDefaultGuardedFetchDnsLookup(null);
});

afterEach(() => {
  setDefaultGuardedFetchDnsLookup(undefined);
  vi.unstubAllGlobals();
});

describe("Baidu Netdisk download_file", () => {
  it("downloads the requested fs_id byte-for-byte into transit storage", async () => {
    const content = new Uint8Array([0, 1, 2, 254, 255]);
    const requests = stubResponses([
      new Response(
        '{"errno":0,"list":[{"fs_id":9007199254740993,"filename":"archive.bin","size":5,"isdir":0,"dlink":"https://d.pcs.baidu.com/file/test?fid=1"}]}',
        { headers: { "content-type": "application/json" } },
      ),
      new Response(content, { headers: { "content-type": "application/octet-stream" } }),
    ]);
    const { store, create } = createTransitFileStore(1024);

    const result = await executeDownload("9007199254740993", store);

    expect(result).toEqual({
      ok: true,
      output: {
        fileId: "9007199254740993",
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
    expect(requests[0]?.url.pathname).toBe("/rest/2.0/xpan/multimedia");
    expect(requests[0]?.url.searchParams.get("method")).toBe("filemetas");
    expect(requests[0]?.url.searchParams.get("dlink")).toBe("1");
    expect(requests[0]?.url.searchParams.get("fsids")).toBe("[9007199254740993]");
    expect(requests[0]?.url.searchParams.get("access_token")).toBe("baidu-access-token");
    expect(requests[1]?.url.hostname).toBe("d.pcs.baidu.com");
    expect(requests[1]?.url.searchParams.get("access_token")).toBe("baidu-access-token");
    expect(requests[1]?.userAgent).toBe("pan.baidu.com");
    expect(create).toHaveBeenCalledOnce();
    const storedFile = create.mock.calls[0]![0];
    expect(new Uint8Array(await storedFile.arrayBuffer())).toEqual(content);
  });

  it("rejects a file whose reported size exceeds the transit limit before downloading", async () => {
    const requests = stubResponses([
      Response.json({
        errno: 0,
        list: [
          {
            fs_id: 123,
            filename: "large.bin",
            size: 3,
            isdir: 0,
            dlink: "https://d.pcs.baidu.com/file/large",
          },
        ],
      }),
    ]);
    const { store, create } = createTransitFileStore(2);

    const result = await executeDownload("123", store);

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "invalid_input",
        message: "Baidu Netdisk file exceeds local transit limit of 2 bytes",
        details: { status: 413 },
      },
    });
    expect(requests).toHaveLength(1);
    expect(create).not.toHaveBeenCalled();
  });

  it("fails without truncating when the response exceeds the transit limit", async () => {
    const requests = stubResponses([
      Response.json({
        errno: 0,
        list: [
          {
            fs_id: 123,
            filename: "growing.bin",
            size: 1,
            isdir: 0,
            dlink: "https://d.pcs.baidu.com/file/growing",
          },
        ],
      }),
      new Response(new Uint8Array([1, 2, 3])),
    ]);
    const { store, create } = createTransitFileStore(2);

    const result = await executeDownload("123", store);

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "invalid_input",
        message: "Baidu Netdisk download exceeds 2 bytes",
        details: { status: 413 },
      },
    });
    expect(requests).toHaveLength(2);
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects folders and untrusted download URLs", async () => {
    const folderRequests = stubResponses([
      Response.json({
        errno: 0,
        list: [
          {
            fs_id: 123,
            filename: "folder",
            size: 0,
            isdir: 1,
            dlink: "https://d.pcs.baidu.com/file/folder",
          },
        ],
      }),
    ]);
    const { store, create } = createTransitFileStore(1024);

    const folderResult = await executeDownload("123", store);

    expect(folderResult).toMatchObject({
      ok: false,
      error: { message: "baidu_netdisk download_file requires a file fsId" },
    });
    expect(folderRequests).toHaveLength(1);
    expect(create).not.toHaveBeenCalled();

    const untrustedRequests = stubResponses([
      Response.json({
        errno: 0,
        list: [
          {
            fs_id: 123,
            filename: "secret.bin",
            size: 1,
            isdir: 0,
            dlink: "https://attacker.example/file/secret",
          },
        ],
      }),
    ]);

    const untrustedResult = await executeDownload("123", store);

    expect(untrustedResult).toMatchObject({
      ok: false,
      error: { message: "baidu_netdisk returned an untrusted download URL" },
    });
    expect(untrustedRequests).toHaveLength(1);
  });

  it("returns a clear error when transit file storage is unavailable", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);

    const result = await executeDownload("123");

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "invalid_input",
        message: "baidu_netdisk download_file requires local transit file storage",
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
      userAgent: request.headers.get("user-agent"),
    });
    const response = responses.shift();
    if (!response) {
      throw new Error(`Unexpected Baidu Netdisk request to ${request.url}`);
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

async function executeDownload(fsId: string, transitFiles?: TransitFileStore) {
  const context: ExecutionContext = {
    getCredential: async (service) => {
      expect(service).toBe("baidu_netdisk");
      return oauthCredential;
    },
  };
  if (transitFiles) {
    context.transitFiles = transitFiles;
  }
  return executors["baidu_netdisk.download_file"]!({ fsId }, context);
}
