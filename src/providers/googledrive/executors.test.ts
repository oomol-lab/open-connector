import type { ExecutionContext, ResolvedCredential, TransitFileStore } from "../../core/types.ts";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { executeAction } from "../../core/execution.ts";
import { setDefaultGuardedFetchDnsLookup } from "../../core/guarded-fetch.ts";
import { provider } from "./definition.ts";
import { credentialValidators, executors } from "./executors.ts";

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

describe("Google Drive files.get", () => {
  it("returns metadata when alt is omitted", async () => {
    const requests = stubGoogleResponses([
      Response.json({ id: "drive-file-1", name: "notes.txt", mimeType: "text/plain", size: "6" }),
    ]);

    const result = await executeGet({ fileId: "drive-file-1" });

    expect(result).toEqual({
      ok: true,
      output: {
        id: "drive-file-1",
        name: "notes.txt",
        mimeType: "text/plain",
        webViewLink: null,
        createdTime: null,
        modifiedTime: null,
        sizeBytes: 6,
        driveId: null,
      },
    });
    expect(requests).toHaveLength(1);
    expect(requests[0]?.url.pathname).toBe("/drive/v3/files/drive-file-1");
    expect(requests[0]?.url.searchParams.get("alt")).toBeNull();
  });

  it("downloads a blob file with shared-drive and abuse acknowledgement parameters", async () => {
    const content = new Uint8Array([72, 101, 108, 108, 111, 10]);
    const requests = stubGoogleResponses([
      Response.json({ id: "drive-file-1", name: "notes.txt", mimeType: "text/plain", size: String(content.length) }),
      new Response(content, { headers: { "content-type": "application/octet-stream" } }),
    ]);
    const { store, create } = createTransitFileStore(1024);

    const result = await executeGet(
      { fileId: "requested-file-id", alt: "media", includeSharedDrives: true, acknowledgeAbuse: true },
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

    const result = await executeGet({ fileId: "drive-file-2", alt: "media" }, store);

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

  it("does not start the download when the reported size exceeds the transit limit", async () => {
    const requests = stubGoogleResponses([
      Response.json({ id: "drive-file-3", name: "large.bin", mimeType: "application/octet-stream", size: "3" }),
    ]);
    const { store, create } = createTransitFileStore(2);

    const result = await executeGet({ fileId: "drive-file-3", alt: "media" }, store);

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "invalid_input",
        message: "Google Drive file exceeds local transit limit of 2 bytes",
        details: { status: 413 },
      },
    });
    expect(requests).toHaveLength(1);
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

    const result = await executeGet({ fileId: "workspace-file-1", alt: "media" }, store);

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "invalid_input",
        message:
          "Google Workspace-native files cannot be downloaded with files.get alt=media. Use files.export when supported.",
      },
    });
    expect(requests).toHaveLength(1);
    expect(create).not.toHaveBeenCalled();
  });

  it("returns a clear error when transit file storage is unavailable", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);

    const result = await executeGet({ fileId: "drive-file-1", alt: "media" });

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "invalid_input",
        message: "files.get with alt=media requires local transit file storage.",
      },
    });
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("Google Drive files.list sharing capability", () => {
  /// The projection is the whole mechanism: `fields` is an allow-list, so a
  /// member dropped here is a field Drive never sends and no amount of
  /// downstream mapping can recover. Asserted on the request rather than only
  /// on the row, because a row test passes on a fixture that was never asked
  /// for.
  it("asks Drive for ownedByMe and the canShare capability", async () => {
    const requests = stubGoogleResponses([Response.json({ files: [], nextPageToken: null })]);

    await executeList({});

    const fields = requests[0]?.url.searchParams.get("fields") ?? "";
    expect(fields).toContain("ownedByMe");
    expect(fields).toContain("capabilities(canShare)");
  });

  it("passes both through when Drive answers them", async () => {
    stubGoogleResponses([
      Response.json({
        files: [
          {
            id: "folder-1",
            name: "Owned folder",
            mimeType: "application/vnd.google-apps.folder",
            ownedByMe: true,
            capabilities: { canShare: true },
          },
        ],
      }),
    ]);

    const result = await executeList({});

    expect(result.ok).toBe(true);
    const file = (result.output as { files: Record<string, unknown>[] }).files[0]!;
    expect(file.ownedByMe).toBe(true);
    expect(file.capabilities).toEqual({ canShare: true });
  });

  /// `false` is a real answer and must survive: it is the whole point of the
  /// field, and a mapper that treated falsy as absent would erase exactly the
  /// rows a caller wants to know about.
  it("keeps a negative answer rather than dropping it", async () => {
    stubGoogleResponses([
      Response.json({
        files: [
          {
            id: "folder-2",
            name: "Shared with me",
            mimeType: "application/vnd.google-apps.folder",
            ownedByMe: false,
            capabilities: { canShare: false },
          },
        ],
      }),
    ]);

    const result = await executeList({});

    const file = (result.output as { files: Record<string, unknown>[] }).files[0]!;
    expect(file.ownedByMe).toBe(false);
    expect(file.capabilities).toEqual({ canShare: false });
  });

  /// "Drive did not say" is not "the caller may not share". A default would
  /// make those two the same, and they lead a consumer to opposite actions.
  it("omits both when Drive did not answer them", async () => {
    stubGoogleResponses([
      Response.json({
        files: [{ id: "folder-3", name: "Unknown", mimeType: "application/vnd.google-apps.folder" }],
      }),
    ]);

    const result = await executeList({});

    const file = (result.output as { files: Record<string, unknown>[] }).files[0]!;
    expect(file).not.toHaveProperty("ownedByMe");
    expect(file).not.toHaveProperty("capabilities");
  });
});

describe("Google Drive OAuth credential validation", () => {
  it("reads UserInfo and preserves the email address as the account id", async () => {
    const requests: CapturedRequest[] = [];

    const result = await credentialValidators.oauth2!(oauthCredential, {
      fetcher: async (input, init) => {
        requests.push({
          url: new URL(String(input)),
          authorization: new Headers(init?.headers).get("authorization"),
        });
        return Response.json({ sub: "google-sub", email: "someone@example.com", name: "Someone" });
      },
    });

    expect(result).toMatchObject({
      profile: { accountId: "someone@example.com", displayName: "Someone" },
    });
    expect(requests).toHaveLength(1);
    expect(requests[0]?.url.href).toBe("https://openidconnect.googleapis.com/v1/userinfo");
    expect(requests[0]?.authorization).toBe("Bearer drive-access-token");
  });

  it("uses the email address as the display name when UserInfo has no name", async () => {
    const result = await credentialValidators.oauth2!(oauthCredential, {
      fetcher: async () => Response.json({ sub: "google-sub", email: "someone@example.com" }),
    });

    expect(result).toMatchObject({
      profile: { accountId: "someone@example.com", displayName: "someone@example.com" },
    });
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

async function executeGet(input: Record<string, unknown>, transitFiles?: TransitFileStore) {
  const context: ExecutionContext = {
    getCredential: async (service) => {
      expect(service).toBe("googledrive");
      return oauthCredential;
    },
  };
  if (transitFiles) {
    context.transitFiles = transitFiles;
  }
  return executeAction(
    provider.actions.find((action) => action.name === "files.get")!,
    executors["googledrive.files.get"],
    input,
    context,
  );
}

async function executeList(input: Record<string, unknown>) {
  const context: ExecutionContext = {
    getCredential: async (service) => {
      expect(service).toBe("googledrive");
      return oauthCredential;
    },
  };
  return executeAction(
    provider.actions.find((action) => action.name === "files.list")!,
    executors["googledrive.files.list"],
    input,
    context,
  );
}
