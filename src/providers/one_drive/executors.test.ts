import type { ExecutionContext, ResolvedCredential, TransitFileStore } from "../../core/types.ts";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { executeAction } from "../../core/execution.ts";
import { setDefaultGuardedFetchDnsLookup } from "../../core/guarded-fetch.ts";
import { provider } from "./definition.ts";
import { executors } from "./executors.ts";

interface CapturedRequest {
  url: URL;
  authorization: string | null;
}

const oauthCredential: Extract<ResolvedCredential, { authType: "oauth2" }> = {
  authType: "oauth2",
  accessToken: "onedrive-access-token",
  tokenType: "Bearer",
  profile: { accountId: "onedrive:test", displayName: "OneDrive test", grantedScopes: [] },
  metadata: {},
};

beforeEach(() => {
  setDefaultGuardedFetchDnsLookup(null);
});

afterEach(() => {
  setDefaultGuardedFetchDnsLookup(undefined);
  vi.unstubAllGlobals();
});

describe("OneDrive transit downloads", () => {
  it("follows the guarded content redirect and stores exact file bytes", async () => {
    const content = new Uint8Array([79, 110, 101, 0, 255]);
    const requests = stubResponses([
      Response.json({
        id: "item-1",
        name: "notes.txt",
        size: content.length,
        file: { mimeType: "text/plain" },
      }),
      new Response(null, {
        status: 302,
        headers: { location: "https://public.dm.files.1drv.com/download/item-1" },
      }),
      new Response(Uint8Array.from(content), { headers: { "content-type": "text/plain; charset=utf-8" } }),
    ]);
    const { store, create } = createTransitFileStore(1024);

    const result = await executeOneDriveAction("download_file", { itemId: "item-1" }, store);

    expect(result).toEqual({
      ok: true,
      output: {
        fileId: "item-1",
        name: "notes.txt",
        mimeType: "text/plain",
        sizeBytes: content.length,
        file: {
          fileId: "transit-file-1",
          downloadUrl: "http://localhost/api/files/transit-file-1",
          sizeBytes: content.length,
          name: "notes.txt",
          mimeType: "text/plain",
        },
      },
    });
    expect(requests).toHaveLength(3);
    expect(requests[0]?.url.pathname).toBe("/v1.0/me/drive/items/item-1");
    expect(requests[0]?.url.searchParams.get("$select")).toBe("id,name,size,file,folder");
    expect(requests[1]?.url.pathname).toBe("/v1.0/me/drive/items/item-1/content");
    expect(requests[0]?.authorization).toBe("Bearer onedrive-access-token");
    expect(requests[1]?.authorization).toBe("Bearer onedrive-access-token");
    expect(requests[2]?.authorization).toBeNull();
    expect(create).toHaveBeenCalledOnce();
    expect(new Uint8Array(await create.mock.calls[0]![0].arrayBuffer())).toEqual(content);
  });

  it("stores converted content with the converted extension and MIME type", async () => {
    const content = new Uint8Array([37, 80, 68, 70]);
    const requests = stubResponses([
      Response.json({
        id: "item-2",
        name: "proposal.docx",
        size: 10_000,
        file: { mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
      }),
      new Response(Uint8Array.from(content), { headers: { "content-type": "application/octet-stream" } }),
    ]);
    const { store } = createTransitFileStore(16);

    const result = await executeOneDriveAction("download_item_as_format", { itemId: "item-2", format: "pdf" }, store);

    expect(result).toMatchObject({
      ok: true,
      output: {
        fileId: "item-2",
        name: "proposal.pdf",
        mimeType: "application/pdf",
        sizeBytes: content.length,
        file: { name: "proposal.pdf", mimeType: "application/pdf", sizeBytes: content.length },
      },
    });
    expect(requests[1]?.url.searchParams.get("format")).toBe("pdf");
  });

  it("supports path-based downloads with the same transit result", async () => {
    const requests = stubResponses([
      Response.json({ id: "item-3", name: "report.csv", size: 2, file: { mimeType: "text/csv" } }),
      new Response("ok", { headers: { "content-type": "text/csv" } }),
    ]);
    const { store } = createTransitFileStore(16);

    const result = await executeOneDriveAction(
      "download_file_by_path",
      { itemPath: "/reports/report.csv", fileName: "renamed.csv" },
      store,
    );

    expect(result).toMatchObject({
      ok: true,
      output: { fileId: "item-3", name: "renamed.csv", file: { name: "renamed.csv" } },
    });
    expect(requests[0]?.url.pathname).toBe("/v1.0/me/drive/root:/reports/report.csv:");
    expect(requests[1]?.url.pathname).toBe("/v1.0/me/drive/root:/reports/report.csv:/content");
  });

  it("rejects a reported raw file size above the transit limit before downloading content", async () => {
    const requests = stubResponses([
      Response.json({ id: "item-4", name: "large.bin", size: 3, file: { mimeType: "application/octet-stream" } }),
    ]);
    const { store, create } = createTransitFileStore(2);

    const result = await executeOneDriveAction("download_file", { itemId: "item-4" }, store);

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "invalid_input",
        message: "OneDrive download exceeds 2 bytes",
        details: { status: 413 },
      },
    });
    expect(requests).toHaveLength(1);
    expect(create).not.toHaveBeenCalled();
  });

  it("enforces the transit limit when the response exceeds reported metadata", async () => {
    stubResponses([
      Response.json({ id: "item-5", name: "growing.bin", size: 1, file: { mimeType: "application/octet-stream" } }),
      new Response(Uint8Array.from([1, 2, 3])),
    ]);
    const { store, create } = createTransitFileStore(2);

    const result = await executeOneDriveAction("download_file", { itemId: "item-5" }, store);

    expect(result).toMatchObject({
      ok: false,
      error: { message: "OneDrive download exceeds 2 bytes", details: { status: 413 } },
    });
    expect(create).not.toHaveBeenCalled();
  });

  it.each([
    ["download_file", { itemId: "item-1" }],
    ["download_file_by_path", { itemPath: "/notes.txt" }],
    ["download_item_as_format", { itemId: "item-1", format: "pdf" }],
  ] as const)("returns a clear error when %s has no transit storage", async (actionName, input) => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);

    const result = await executeOneDriveAction(actionName, input);

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "invalid_input",
        message: "one_drive downloads require local transit file storage",
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
    });
    const response = responses.shift();
    if (!response) {
      throw new Error(`Unexpected OneDrive request to ${request.url}`);
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

type OneDriveDownloadAction = "download_file" | "download_file_by_path" | "download_item_as_format";

async function executeOneDriveAction(
  actionName: OneDriveDownloadAction,
  input: Record<string, unknown>,
  transitFiles?: TransitFileStore,
) {
  const context: ExecutionContext = {
    getCredential: async (service) => {
      expect(service).toBe("one_drive");
      return oauthCredential;
    },
  };
  if (transitFiles) {
    context.transitFiles = transitFiles;
  }
  return executeAction(
    provider.actions.find((action) => action.name === actionName)!,
    executors[`one_drive.${actionName}`],
    input,
    context,
  );
}
