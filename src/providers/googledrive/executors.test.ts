import type { ExecutionContext, ResolvedCredential, TransitFileStore } from "../../core/types.ts";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setDefaultGuardedFetchDnsLookup } from "../../core/guarded-fetch.ts";
import { provider } from "./definition.ts";
import { executors } from "./executors.ts";
import { googleDriveMetadataReadonlyScope, googleDriveReadonlyScope } from "./scopes.ts";

interface CapturedRequest {
  url: URL;
  authorization: string | null;
}

const oauthCredential: Extract<ResolvedCredential, { authType: "oauth2" }> = {
  authType: "oauth2",
  accessToken: "drive-access-token",
  tokenType: "Bearer",
  profile: { accountId: "drive:test", displayName: "Drive test", grantedScopes: [] },
  metadata: {},
};

beforeEach(() => {
  setDefaultGuardedFetchDnsLookup(null);
});

afterEach(() => {
  setDefaultGuardedFetchDnsLookup(undefined);
  vi.unstubAllGlobals();
});

describe("Google Drive files.download", () => {
  it("is registered in the catalog and executor map with read-only scopes", () => {
    const action = provider.actions.find((candidate) => candidate.name === "files.download");

    expect(action).toMatchObject({
      id: "googledrive.files.download",
      requiredScopes: [googleDriveReadonlyScope, googleDriveMetadataReadonlyScope],
    });
    expect(executors["googledrive.files.download"]).toBeTypeOf("function");
  });

  it("downloads a blob file with shared-drive and abuse acknowledgement parameters", async () => {
    const content = new Uint8Array([72, 101, 108, 108, 111, 10]);
    const requests = stubGoogleResponses([
      Response.json({ id: "drive-file-1", name: "notes.txt", mimeType: "text/plain", size: String(content.length) }),
      new Response(content, { headers: { "content-type": "application/octet-stream" } }),
    ]);
    const { store, create } = createTransitFileStore(1024);

    const result = await executeDownload(
      { fileId: "requested-file-id", includeSharedDrives: true, acknowledgeAbuse: true },
      store,
    );

    expect(result).toEqual({
      ok: true,
      output: {
        fileId: "drive-file-1",
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
    expect(requests).toHaveLength(2);
    expect(requests[0]?.url.pathname).toBe("/drive/v3/files/requested-file-id");
    expect(requests[0]?.url.searchParams.get("supportsAllDrives")).toBe("true");
    expect(requests[0]?.url.searchParams.get("alt")).toBeNull();
    expect(requests[1]?.url.pathname).toBe("/drive/v3/files/drive-file-1");
    expect(Object.fromEntries(requests[1]!.url.searchParams)).toEqual({
      alt: "media",
      supportsAllDrives: "true",
      acknowledgeAbuse: "true",
    });
    expect(requests.every((request) => request.authorization === "Bearer drive-access-token")).toBe(true);
    expect(create).toHaveBeenCalledOnce();
    const storedFile = create.mock.calls[0]![0];
    expect(storedFile.name).toBe("notes.txt");
    expect(storedFile.type).toBe("text/plain");
    expect(new Uint8Array(await storedFile.arrayBuffer())).toEqual(content);
  });

  it("fails without truncating when the response exceeds the transit limit", async () => {
    const requests = stubGoogleResponses([
      Response.json({ id: "drive-file-2", name: "large.bin", mimeType: "application/octet-stream" }),
      new Response(new Uint8Array([1, 2, 3])),
    ]);
    const { store, create } = createTransitFileStore(2);

    const result = await executeDownload({ fileId: "drive-file-2" }, store);

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "invalid_input",
        message: "Google Drive download exceeds 2 bytes",
        details: { status: 413 },
      },
    });
    expect(requests).toHaveLength(2);
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects Google Workspace files and directs callers to files.export", async () => {
    const requests = stubGoogleResponses([
      Response.json({
        id: "workspace-file-1",
        name: "Project plan",
        mimeType: "application/vnd.google-apps.document",
      }),
    ]);
    const { store, create } = createTransitFileStore(1024);

    const result = await executeDownload({ fileId: "workspace-file-1" }, store);

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "invalid_input",
        message: "Google Workspace files must be downloaded with files.export.",
      },
    });
    expect(requests).toHaveLength(1);
    expect(create).not.toHaveBeenCalled();
  });

  it("returns a clear error when transit file storage is unavailable", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);

    const result = await executeDownload({ fileId: "drive-file-1" });

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "invalid_input",
        message: "files.download requires local transit file storage.",
      },
    });
    expect(fetch).not.toHaveBeenCalled();
  });
});

function stubGoogleResponses(responses: Response[]): CapturedRequest[] {
  const requests: CapturedRequest[] = [];
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init);
    requests.push({
      url: new URL(request.url),
      authorization: request.headers.get("authorization"),
    });
    const response = responses.shift();
    if (!response) {
      throw new Error(`Unexpected Google Drive request to ${request.url}`);
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
      expect(service).toBe("googledrive");
      return oauthCredential;
    },
  };
  if (transitFiles) {
    context.transitFiles = transitFiles;
  }
  return executors["googledrive.files.download"]!(input, context);
}
