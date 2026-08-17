import type { ExecutionContext, ResolvedCredential, TransitFileStore } from "../../core/types.ts";

import { afterEach, describe, expect, it, vi } from "vitest";
import { executeAction } from "../../core/execution.ts";
import { provider } from "./definition.ts";
import { executors } from "./executors.ts";

interface CapturedRequest {
  url: URL;
  authorization: string | null;
  apiArg: Record<string, unknown>;
}

const oauthCredential: Extract<ResolvedCredential, { authType: "oauth2" }> = {
  authType: "oauth2",
  accessToken: "dropbox-access-token",
  tokenType: "Bearer",
  profile: { accountId: "dropbox:test", displayName: "Dropbox test", grantedScopes: [] },
  metadata: {},
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Dropbox transit downloads", () => {
  it("downloads a file byte-for-byte into transit storage", async () => {
    const content = new Uint8Array([68, 114, 111, 112, 0, 255]);
    const requests = stubResponses([
      dropboxDownloadResponse(content, {
        ".tag": "file",
        id: "id:document-1",
        name: "document.pdf",
        size: content.length,
      }),
    ]);
    const { store, create } = createTransitFileStore(1024);

    const result = await executeDropboxAction("download_file", { path: "/document.pdf" }, store);

    expect(result).toEqual({
      ok: true,
      output: {
        fileId: "id:document-1",
        name: "document.pdf",
        mimeType: "application/pdf",
        sizeBytes: content.length,
        file: {
          fileId: "transit-file-1",
          downloadUrl: "http://localhost/api/files/transit-file-1",
          sizeBytes: content.length,
          name: "document.pdf",
          mimeType: "application/pdf",
        },
      },
    });
    expect(requests[0]?.url.pathname).toBe("/2/files/download");
    expect(requests[0]?.authorization).toBe("Bearer dropbox-access-token");
    expect(requests[0]?.apiArg).toEqual({ path: "/document.pdf" });
    expect(create).toHaveBeenCalledOnce();
    expect(new Uint8Array(await create.mock.calls[0]![0].arrayBuffer())).toEqual(content);
  });

  it("downloads a shared-link file with a transit filename override", async () => {
    const content = new Uint8Array([1, 2, 3]);
    const requests = stubResponses([
      dropboxDownloadResponse(content, {
        ".tag": "file",
        id: "id:shared-1",
        name: "source.bin",
        size: content.length,
      }),
    ]);
    const { store } = createTransitFileStore(1024);

    const result = await executeDropboxAction(
      "get_shared_link_file",
      {
        url: "https://www.dropbox.com/scl/fi/example/source.bin",
        path: "/nested/source.bin",
        fileName: "renamed.bin",
      },
      store,
    );

    expect(result).toMatchObject({
      ok: true,
      output: {
        fileId: "id:shared-1",
        name: "renamed.bin",
        sizeBytes: content.length,
        file: { name: "renamed.bin", sizeBytes: content.length },
      },
    });
    expect(requests[0]?.url.pathname).toBe("/2/sharing/get_shared_link_file");
    expect(requests[0]?.apiArg).toEqual({
      url: "https://www.dropbox.com/scl/fi/example/source.bin",
      path: "/nested/source.bin",
    });
  });

  it("rejects a reported file size above the transit limit before storing", async () => {
    const requests = stubResponses([
      dropboxDownloadResponse(new Uint8Array([1]), {
        ".tag": "file",
        id: "id:large-1",
        name: "large.bin",
        size: 3,
      }),
    ]);
    const { store, create } = createTransitFileStore(2);

    const result = await executeDropboxAction("download_file", { path: "/large.bin" }, store);

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "invalid_input",
        message: "Dropbox download exceeds 2 bytes",
        details: { status: 413 },
      },
    });
    expect(requests).toHaveLength(1);
    expect(create).not.toHaveBeenCalled();
  });

  it("enforces the transit limit when the response exceeds reported metadata", async () => {
    stubResponses([
      dropboxDownloadResponse(new Uint8Array([1, 2, 3]), {
        ".tag": "file",
        id: "id:growing-1",
        name: "growing.bin",
        size: 1,
      }),
    ]);
    const { store, create } = createTransitFileStore(2);

    const result = await executeDropboxAction("download_file", { path: "/growing.bin" }, store);

    expect(result).toMatchObject({
      ok: false,
      error: { message: "Dropbox download exceeds 2 bytes", details: { status: 413 } },
    });
    expect(create).not.toHaveBeenCalled();
  });

  it.each([
    ["download_file", { path: "/document.pdf" }],
    ["get_shared_link_file", { url: "https://www.dropbox.com/s/example/document.pdf" }],
  ] as const)("returns a clear error when %s has no transit storage", async (actionName, input) => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);

    const result = await executeDropboxAction(actionName, input);

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "invalid_input",
        message: `dropbox ${actionName} requires local transit file storage`,
      },
    });
    expect(fetch).not.toHaveBeenCalled();
  });
});

function dropboxDownloadResponse(content: Uint8Array, metadata: Record<string, unknown>): Response {
  return new Response(Uint8Array.from(content), {
    headers: {
      "content-type": "application/pdf",
      "dropbox-api-result": JSON.stringify(metadata),
    },
  });
}

function stubResponses(responses: Response[]): CapturedRequest[] {
  const requests: CapturedRequest[] = [];
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init);
    requests.push({
      url: new URL(request.url),
      authorization: request.headers.get("authorization"),
      apiArg: JSON.parse(request.headers.get("dropbox-api-arg") ?? "{}") as Record<string, unknown>,
    });
    const response = responses.shift();
    if (!response) {
      throw new Error(`Unexpected Dropbox request to ${request.url}`);
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

async function executeDropboxAction(
  actionName: "download_file" | "get_shared_link_file",
  input: Record<string, unknown>,
  transitFiles?: TransitFileStore,
) {
  const context: ExecutionContext = {
    getCredential: async (service) => {
      expect(service).toBe("dropbox");
      return oauthCredential;
    },
  };
  if (transitFiles) {
    context.transitFiles = transitFiles;
  }
  return executeAction(
    provider.actions.find((action) => action.name === actionName)!,
    executors[`dropbox.${actionName}`],
    input,
    context,
  );
}
