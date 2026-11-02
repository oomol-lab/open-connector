import type { ExecutionContext, ResolvedCredential, TransitFileStore } from "../../core/types.ts";

import { afterEach, describe, expect, it, vi } from "vitest";
import { executeAction } from "../../core/execution.ts";
import { setDefaultGuardedFetchDnsLookup } from "../../core/guarded-fetch.ts";
import { provider } from "./definition.ts";
import { executors, proxy } from "./executors.ts";

interface CapturedRequest {
  url: URL;
  authorization: string | null;
  apiArg: Record<string, unknown>;
  rawApiArg: string | null;
  body: unknown;
}

const oauthCredential: Extract<ResolvedCredential, { authType: "oauth2" }> = {
  authType: "oauth2",
  accessToken: "dropbox-access-token",
  tokenType: "Bearer",
  profile: { accountId: "dropbox:test", displayName: "Dropbox test", grantedScopes: [] },
  metadata: {},
};

afterEach(() => {
  setDefaultGuardedFetchDnsLookup(null);
  vi.unstubAllGlobals();
});

const dnsContext: ExecutionContext = {
  getCredential: async () => oauthCredential,
};

describe("Dropbox host DNS validation", () => {
  it("rejects an action host that resolves to cloud metadata before any fetch", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    setDefaultGuardedFetchDnsLookup(async () => [{ address: "169.254.169.254", family: 4 }]);

    const result = await executors["dropbox.get_current_account"]!({}, dnsContext);

    expect(result).toMatchObject({
      ok: false,
      error: { message: expect.stringContaining("must not resolve to private or reserved IP addresses") },
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects a proxy base URL that resolves to cloud metadata before any fetch", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    setDefaultGuardedFetchDnsLookup(async () => [{ address: "169.254.169.254", family: 4 }]);

    const result = await proxy({ endpoint: "/files/download", method: "POST" }, dnsContext);

    expect(result).toMatchObject({
      ok: false,
      error: { message: expect.stringContaining("must not resolve to private or reserved IP addresses") },
    });
    expect(fetch).not.toHaveBeenCalled();
  });
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
        name: "source.bin",
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

describe("Dropbox-API-Arg header encoding", () => {
  it("escapes a non-ASCII path so the header stays inside ByteString", async () => {
    const content = new Uint8Array([1, 2, 3]);
    const requests = stubResponses([
      dropboxDownloadResponse(content, {
        ".tag": "file",
        id: "id:cjk-1",
        // ASCII on purpose: this fixture rides the RESPONSE header, which is
        // under the same ByteString limit. The request header is what is
        // under test here.
        name: "kkndme.pdf",
        size: content.length,
      }),
    ]);
    const { store } = createTransitFileStore(1024);

    // DEL (0x7F) is ASCII but not a valid header byte, and Dropbox's docs ask
    // for it to be escaped alongside non-ASCII; an astral character exercises
    // the surrogate-pair path.
    const path = "/kkndme \u5929\u6daf \ud83d\ude00\u007f.pdf";
    const result = await executeDropboxAction("download_file", { path }, store);

    expect(result).toMatchObject({ ok: true });
    // Assert the RAW header, not the parsed object: JSON.parse decodes \uXXXX,
    // so the parsed form is identical either way and cannot fail on a regression.
    expect(requests[0]?.rawApiArg).toBe(String.raw`{"path":"/kkndme \u5929\u6daf \ud83d\ude00\u007f.pdf"}`);
    expect(requests[0]?.rawApiArg).toMatch(/^[\u0020-\u007e]*$/);
    expect(requests[0]?.apiArg).toEqual({ path });
  });
});

describe("Dropbox membership", () => {
  it.each(["file", "folder"] as const)(
    "preserves %s user, group and invitee grants across cursor pages",
    async (kind) => {
      const users = [
        {
          access_type: { ".tag": "owner" },
          user: { account_id: "dbid:owner", email: "owner@example.com", display_name: "Owner", same_team: true },
          is_inherited: false,
          permissions: [],
        },
      ];
      const groups = [
        {
          access_type: { ".tag": "editor" },
          group: { group_id: "g:team", group_name: "Team", same_team: true },
          is_inherited: false,
          permissions: [],
        },
      ];
      const invitees = [
        {
          access_type: { ".tag": "viewer" },
          invitee: { ".tag": "email", email: "pending@example.com" },
          is_inherited: false,
          permissions: [],
        },
      ];
      const requests = stubResponses([
        Response.json({ users, groups, invitees, cursor: "opaque-next-page" }),
        Response.json({ users: [], groups: [], invitees: [] }),
      ]);

      expect(
        await executeDropboxAction(
          kind === "file" ? "list_file_members" : "list_folder_members",
          kind === "file"
            ? { file: "id:file-1", includeInherited: false, limit: 1 }
            : { sharedFolderId: "1234", path: "/shared/nested", limit: 1 },
        ),
      ).toEqual({ ok: true, output: { users, groups, invitees, cursor: "opaque-next-page" } });
      expect(
        await executeDropboxAction(kind === "file" ? "list_file_members_continue" : "list_folder_members_continue", {
          cursor: "opaque-next-page",
        }),
      ).toEqual({
        ok: true,
        output: { users: [], groups: [], invitees: [], cursor: null },
      });
      expect(requests.map((request) => [request.url.pathname, request.authorization, request.body])).toEqual([
        [
          `/2/sharing/list_${kind}_members`,
          "Bearer dropbox-access-token",
          kind === "file"
            ? { file: "id:file-1", include_inherited: false, limit: 1 }
            : { shared_folder_id: "1234", path: "/shared/nested", limit: 1 },
        ],
        [`/2/sharing/list_${kind}_members/continue`, "Bearer dropbox-access-token", { cursor: "opaque-next-page" }],
      ]);
      for (const name of [`list_${kind}_members`, `list_${kind}_members_continue`]) {
        expect(provider.actions.find((action) => action.name === name)?.requiredScopes).toEqual(["sharing.read"]);
      }
    },
  );

  it.each([
    ["list_file_members", { file: "id:file-1" }, 403, "access_error/no_permission", "authorization_failed"],
    ["list_file_members_continue", { cursor: "expired" }, 409, "invalid_cursor", "invalid_input"],
    ["list_folder_members", { sharedFolderId: "not-shared" }, 409, "invalid_id", "invalid_input"],
    ["list_folder_members_continue", { cursor: "expired" }, 409, "invalid_cursor", "invalid_input"],
  ] as const)("keeps %s upstream refusal distinct from an empty ACL", async (name, input, status, summary, code) => {
    const requests = stubResponses([Response.json({ error_summary: summary }, { status })]);
    expect(await executeDropboxAction(name, input)).toMatchObject({
      ok: false,
      error: { code, message: summary, details: { status, details: { upstreamStatus: status } } },
    });
    expect(requests).toHaveLength(1);
  });

  it.each(["list_file_members", "list_folder_members"] as const)(
    "rejects malformed %s arrays instead of reporting complete empty access",
    async (action) => {
      stubResponses([Response.json({ users: [], invitees: [] })]);
      expect(
        await executeDropboxAction(
          action,
          action === "list_file_members" ? { file: "id:file-1" } : { sharedFolderId: "1234" },
        ),
      ).toMatchObject({
        ok: false,
        error: { code: "provider_error", message: "dropbox groups must be an array" },
      });
    },
  );

  it("preserves explicit-sharing changes on initial and continued listing pages", async () => {
    const entry = { ".tag": "file", id: "id:file-1", name: "notes.txt", has_explicit_shared_members: true };
    const requests = stubResponses([
      Response.json({ entries: [entry], cursor: "next", has_more: true }),
      Response.json({ entries: [{ ...entry, has_explicit_shared_members: false }], cursor: "done", has_more: false }),
      Response.json({ ".tag": "folder", id: "id:folder-1", name: "private" }),
    ]);
    expect(
      await executeDropboxAction("list_folder", { path: "", includeHasExplicitSharedMembers: true }),
    ).toMatchObject({
      ok: true,
      output: { entries: [{ hasExplicitSharedMembers: true }] },
    });
    expect(await executeDropboxAction("list_folder_continue", { cursor: "next" })).toMatchObject({
      ok: true,
      output: { entries: [{ hasExplicitSharedMembers: false }] },
    });
    expect(await executeDropboxAction("get_metadata", { path: "id:folder-1" })).toMatchObject({
      ok: true,
      output: { metadata: { hasExplicitSharedMembers: null } },
    });
    expect(requests[0]?.body).toEqual({ path: "", include_has_explicit_shared_members: true });
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
      rawApiArg: request.headers.get("dropbox-api-arg"),
      body: request.body === null ? null : await request.json(),
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
  actionName:
    | "download_file"
    | "get_shared_link_file"
    | "list_file_members"
    | "list_file_members_continue"
    | "list_folder_members"
    | "list_folder_members_continue"
    | "list_folder"
    | "list_folder_continue"
    | "get_metadata",
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
