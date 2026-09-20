import type { ExecutionContext, ResolvedCredential, TransitFileStore } from "../../core/types.ts";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { executeAction } from "../../core/execution.ts";
import { setDefaultGuardedFetchDnsLookup } from "../../core/guarded-fetch.ts";
import { provider } from "./definition.ts";
import { executors } from "./executors.ts";

interface CapturedRequest {
  url: URL;
  authorization: string | null;
  signal: AbortSignal | null;
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

// `looseObject` lets undeclared keys through at runtime but does not publish them,
// so the catalog schema is asserted directly: it is what SDK consumers generate types from.
describe("list_item_permissions declares the fields it was measured to return", () => {
  const action = provider.actions.find((candidate) => candidate.name === "list_item_permissions")!;
  const permission = (action.outputSchema as Record<string, any>).properties.items.items;

  it("names the identity fields a caller can actually key on", () => {
    for (const set of ["grantedTo", "grantedToV2"]) {
      const arm = permission.properties[set].properties;
      for (const who of Object.keys(arm)) {
        expect(Object.keys(arm[who].properties)).toEqual(
          expect.arrayContaining(["id", "displayName", "email", "loginName"]),
        );
      }
    }
  });

  it("names the reference fields inheritedFrom was measured to carry", () => {
    const reference = permission.properties.inheritedFrom.properties;
    expect(Object.keys(reference)).toEqual(
      expect.arrayContaining(["driveId", "id", "path", "shareId", "sharepointIds"]),
    );
  });

  it("declares none of them required, because each was absent somewhere", () => {
    const identity = permission.properties.grantedToV2.properties.siteUser;
    expect(identity.required ?? []).toEqual([]);
    expect(permission.properties.inheritedFrom.required ?? []).toEqual([]);
  });
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
    const controller = new AbortController();

    const result = await executeOneDriveAction("download_file", { itemId: "item-1" }, store, controller.signal);

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
    expect(requests[0]?.signal).toBe(controller.signal);
    expect(requests[1]?.signal).toBe(controller.signal);
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
      output: { fileId: "item-3", name: "report.csv", file: { name: "renamed.csv" } },
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

describe("OneDrive path traversal guard", () => {
  it.each([
    ["get_item", { itemPath: "/../../me/messages" }, "itemPath"],
    ["get_item", { itemPath: "/reports/./q1.csv" }, "itemPath"],
    ["get_item", { itemPath: "/reports\\..\\secret" }, "itemPath"],
    ["get_item", { itemId: ".." }, "itemId"],
    ["get_item", { driveId: "..", itemPath: "/notes.txt" }, "driveId"],
    ["list_folder_children", { folderPath: "/../../me/messages" }, "folderPath"],
    ["create_folder", { name: "new", parentPath: "/../../me" }, "parentPath"],
    ["list_item_permissions", { itemPath: "/../../me/messages" }, "itemPath"],
    ["download_file_by_path", { itemPath: "../../me/messages" }, "itemPath"],
    ["upload_file", { folder: "/a/../../me", name: "a.txt", text: "hi" }, "folder"],
    ["upload_file", { folder: "..", name: "a.txt", text: "hi" }, "itemId"],
  ] as const)("rejects %s input %j before any request", async (actionName, input, fieldName) => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const { store } = createTransitFileStore(16);

    const result = await executeOneDriveAction(actionName, input, store);

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "invalid_input",
        message: `${fieldName} must not contain ".", "..", or backslash path segments`,
        details: { status: 400 },
      },
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("still accepts dotted names that are not dot segments", async () => {
    const requests = stubResponses([Response.json({ id: "item-9", name: "..env" })]);

    const result = await executeOneDriveAction("get_item", { itemPath: "/.config/..env" });

    expect(result).toMatchObject({ ok: true });
    expect(requests[0]?.url.pathname).toBe("/v1.0/me/drive/root:/.config/..env:");
  });
});

describe("OneDrive item permissions", () => {
  it("reads the permissions of an item by id, and reports the end of the list", async () => {
    const requests = stubResponses([
      Response.json({
        value: [{ id: "perm-1", roles: ["read"], grantedToV2: { user: { id: "u1", displayName: "Ada" } } }],
      }),
    ]);

    const result = await executeOneDriveAction("list_item_permissions", { itemId: "item-1" });

    expect(requests[0]!.url.pathname).toBe("/v1.0/me/drive/items/item-1/permissions");
    expect(result).toEqual({
      ok: true,
      output: {
        items: [{ id: "perm-1", roles: ["read"], grantedToV2: { user: { id: "u1", displayName: "Ada" } } }],
        nextLink: null,
      },
    });
  });

  it("returns a documented-shape permission unchanged, inheritedFrom included", async () => {
    // The documented shape. Output schemas are not enforced at runtime, so this pins
    // the verbatim return path rather than the schema declaration.
    stubResponses([
      Response.json({
        value: [
          {
            id: "perm-2",
            roles: ["owner"],
            grantedTo: { user: { id: "u2", displayName: "Grace" } },
            inheritedFrom: { driveId: "d1", id: "parent-1", path: "/drive/root:" },
          },
        ],
      }),
    ]);

    const result = await executeOneDriveAction("list_item_permissions", { itemId: "item-2" });

    expect(result).toMatchObject({
      ok: true,
      output: {
        items: [
          {
            grantedTo: { user: { id: "u2", displayName: "Grace" } },
            inheritedFrom: { id: "parent-1" },
          },
        ],
      },
    });
  });

  it("returns a real personal-drive owner permission verbatim, siteUser and all", async () => {
    // Shape measured on a personal OneDrive (identifiers redacted): `grantedToV2`
    // carries `siteUser` rather than `user`, and `id` is a SharePoint site-local
    // index, so `email` is the only identifier that matches the person elsewhere.
    stubResponses([
      Response.json({
        value: [
          {
            id: "aTowIy5mfG1lbWJlcnNoaXB8c29tZW9uZUBleGFtcGxlLmNvbQ",
            roles: ["owner"],
            shareId: "aTowIy5mfG1lbWJlcnNoaXB8c29tZW9uZUBleGFtcGxlLmNvbQ",
            grantedToV2: {
              siteUser: {
                displayName: "Example Owner",
                email: "someone@example.com",
                id: "4",
                loginName: "i:0#.f|membership|someone@example.com",
              },
            },
            grantedTo: {
              user: { displayName: "Example Owner", email: "someone@example.com", id: "4" },
            },
            link: { webUrl: "https://1drv.ms/f/c/EXAMPLECID/AsExampleShareToken" },
          },
        ],
      }),
    ]);

    const result = await executeOneDriveAction("list_item_permissions", { itemId: "item-owner" });

    expect(result).toEqual({
      ok: true,
      output: {
        items: [
          {
            id: "aTowIy5mfG1lbWJlcnNoaXB8c29tZW9uZUBleGFtcGxlLmNvbQ",
            roles: ["owner"],
            shareId: "aTowIy5mfG1lbWJlcnNoaXB8c29tZW9uZUBleGFtcGxlLmNvbQ",
            grantedToV2: {
              siteUser: {
                displayName: "Example Owner",
                email: "someone@example.com",
                id: "4",
                loginName: "i:0#.f|membership|someone@example.com",
              },
            },
            grantedTo: {
              user: { displayName: "Example Owner", email: "someone@example.com", id: "4" },
            },
            link: { webUrl: "https://1drv.ms/f/c/EXAMPLECID/AsExampleShareToken" },
          },
        ],
        nextLink: null,
      },
    });
  });

  it("keeps a specific-people link's identities, which carry no id at all", async () => {
    // Shape measured on a personal OneDrive (identifiers redacted): the grantee of an
    // unredeemed specific-people link has no `id`, and `displayName` is the address.
    stubResponses([
      Response.json({
        value: [
          {
            id: "00000000-0000-4000-8000-000000000001",
            roles: ["read"],
            hasPassword: false,
            grantedToIdentitiesV2: [
              {
                user: {
                  "@odata.type": "#microsoft.graph.sharePointIdentity",
                  displayName: "someone@example.com",
                  email: "someone@example.com",
                },
              },
            ],
            grantedToIdentities: [{ user: { displayName: "someone@example.com", email: "someone@example.com" } }],
            link: { scope: "users", type: "view", preventsDownload: false },
          },
        ],
      }),
    ]);

    const result = await executeOneDriveAction("list_item_permissions", { itemId: "item-3" });

    expect(result).toEqual({
      ok: true,
      output: {
        items: [
          {
            id: "00000000-0000-4000-8000-000000000001",
            roles: ["read"],
            hasPassword: false,
            grantedToIdentitiesV2: [
              {
                user: {
                  "@odata.type": "#microsoft.graph.sharePointIdentity",
                  displayName: "someone@example.com",
                  email: "someone@example.com",
                },
              },
            ],
            grantedToIdentities: [{ user: { displayName: "someone@example.com", email: "someone@example.com" } }],
            link: { scope: "users", type: "view", preventsDownload: false },
          },
        ],
        nextLink: null,
      },
    });
  });

  it("keeps an inherited grant's inheritedFrom, which is the only thing that says where it came from", async () => {
    // Shape measured on a child of a shared folder (identifiers redacted):
    // `inheritedFrom` is the only field that marks the grant as an ancestor's.
    stubResponses([
      Response.json({
        value: [
          {
            id: "00000000-0000-4000-8000-000000000002",
            roles: ["read"],
            hasPassword: false,
            grantedToIdentitiesV2: [{ user: { displayName: "someone@example.com", email: "someone@example.com" } }],
            grantedToIdentities: [{ user: { displayName: "someone@example.com", email: "someone@example.com" } }],
            inheritedFrom: {
              driveId: "EXAMPLECID",
              driveType: "personal",
              id: "EXAMPLECID!s4c54abc634f4204d8071f30f00000000",
              name: "Downloads",
              path: "/drives/EXAMPLECID/root:/Docs/Downloads",
              shareId: "u!aHR0cHM6Ly9leGFtcGxl",
              sharepointIds: {
                listItemId: "4081",
                listItemUniqueId: "4c54abc6-34f4-204d-8071-f30f00000000",
              },
            },
            link: { scope: "users", type: "view", preventsDownload: false },
          },
        ],
      }),
    ]);

    const result = await executeOneDriveAction("list_item_permissions", { itemId: "child-1" });
    const [item] = (result as { output: { items: Record<string, unknown>[] } }).output.items;

    expect(item!.inheritedFrom).toEqual({
      driveId: "EXAMPLECID",
      driveType: "personal",
      id: "EXAMPLECID!s4c54abc634f4204d8071f30f00000000",
      name: "Downloads",
      path: "/drives/EXAMPLECID/root:/Docs/Downloads",
      shareId: "u!aHR0cHM6Ly9leGFtcGxl",
      sharepointIds: {
        listItemId: "4081",
        listItemUniqueId: "4c54abc6-34f4-204d-8071-f30f00000000",
      },
    });
  });

  it("keeps an anonymous link's EMPTY identity arrays, which are present and not absent", async () => {
    // Shape measured on a personal OneDrive: the identity arrays arrive empty rather
    // than missing, and there is no `grantedTo` at all.
    stubResponses([
      Response.json({
        value: [
          {
            id: "00000000-0000-4000-8000-000000000003",
            roles: ["read"],
            hasPassword: false,
            grantedToIdentitiesV2: [],
            grantedToIdentities: [],
            link: { scope: "anonymous", type: "view", preventsDownload: false },
          },
        ],
      }),
    ]);

    const result = await executeOneDriveAction("list_item_permissions", { itemId: "item-anon" });

    expect(result).toMatchObject({
      ok: true,
      output: {
        items: [
          {
            grantedToIdentitiesV2: [],
            grantedToIdentities: [],
            link: { scope: "anonymous" },
          },
        ],
      },
    });
    const [item] = (result as { output: { items: Record<string, unknown>[] } }).output.items;
    expect(item, "an anonymous link names nobody").not.toHaveProperty("grantedTo");
    expect(item).not.toHaveProperty("grantedToV2");
  });

  it("addresses an item by path, and a named drive", async () => {
    const byPath = stubResponses([Response.json({ value: [] })]);
    await executeOneDriveAction("list_item_permissions", { itemPath: "/Reports/Q3" });
    expect(byPath[0]!.url.pathname).toBe("/v1.0/me/drive/root:/Reports/Q3:/permissions");

    const byDrive = stubResponses([Response.json({ value: [] })]);
    await executeOneDriveAction("list_item_permissions", {
      driveId: "drive-9",
      itemId: "item-4",
      select: ["id", "roles"],
    });
    expect(byDrive[0]!.url.pathname).toBe("/v1.0/drives/drive-9/items/item-4/permissions");
    expect(byDrive[0]!.url.searchParams.get("$select")).toBe("id,roles");
  });

  it("follows a permission nextLink and refuses one that points elsewhere", async () => {
    const followed = stubResponses([Response.json({ value: [{ id: "perm-4", roles: ["read"] }] })]);
    const ok = await executeOneDriveAction("list_item_permissions", {
      itemId: "item-5",
      nextLink: "https://graph.microsoft.com/v1.0/me/drive/items/item-5/permissions?$skiptoken=abc",
    });
    expect(ok).toMatchObject({ ok: true });
    expect(followed[0]!.url.searchParams.get("$skiptoken")).toBe("abc");

    // The second link is a drive path, so it passes `readDrivePathSuffix` and is
    // refused only by the permissions endpoint check itself.
    for (const elsewhere of [
      "https://graph.microsoft.com/v1.0/me/messages",
      "https://graph.microsoft.com/v1.0/me/drive/items/item-5/children",
    ]) {
      const fetch = vi.fn();
      vi.stubGlobal("fetch", fetch);
      const refused = await executeOneDriveAction("list_item_permissions", {
        itemId: "item-5",
        nextLink: elsewhere,
      });
      expect(refused, elsewhere).toMatchObject({
        ok: false,
        error: { message: "nextLink must target OneDrive permission pagination endpoints" },
      });
      expect(fetch, elsewhere).not.toHaveBeenCalled();
    }
  });

  it("requires an item to ask about", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);

    const result = await executeOneDriveAction("list_item_permissions", {});

    expect(result).toMatchObject({ ok: false, error: { message: "itemId or itemPath is required" } });
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
      signal: init?.signal ?? (input instanceof Request ? input.signal : null),
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

async function executeOneDriveAction(
  actionName: string,
  input: Record<string, unknown>,
  transitFiles?: TransitFileStore,
  signal?: AbortSignal,
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
  if (signal) {
    context.signal = signal;
  }
  return executeAction(
    provider.actions.find((action) => action.name === actionName)!,
    executors[`one_drive.${actionName}`],
    input,
    context,
  );
}
