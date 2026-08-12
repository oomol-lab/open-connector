import type { TransitFileStore } from "../../core/types.ts";
import type { BearerProviderContext } from "../provider-runtime.ts";

import { afterEach, describe, expect, it, vi } from "vitest";
import { setDefaultGuardedFetchDnsLookup } from "../../core/guarded-fetch.ts";
import { esaActions } from "./actions.ts";
import { esaActionHandlers } from "./runtime.ts";

interface RouteCase {
  name: keyof typeof esaActionHandlers;
  input: Record<string, unknown>;
  path: string;
  method?: string;
  query?: Record<string, string>;
  body?: unknown;
  response?: unknown;
}

interface CapturedRequest {
  url: URL;
  init: RequestInit | undefined;
}

afterEach(() => {
  setDefaultGuardedFetchDnsLookup(null);
  vi.unstubAllGlobals();
});

const expectedActionNames = [
  "get_teams",
  "get_team_stats",
  "get_team_tags",
  "get_team_members",
  "get_post",
  "search_posts",
  "create_post",
  "update_post",
  "append_post",
  "prepend_post",
  "get_comment",
  "create_comment",
  "update_comment",
  "delete_comment",
  "get_post_backlinks",
  "get_post_comments",
  "get_team_comments",
  "get_categories",
  "get_top_categories",
  "get_all_category_paths",
  "archive_post",
  "ship_post",
  "duplicate_post",
  "rollback_post_revision",
  "get_search_options_help",
  "get_markdown_syntax_help",
  "search_help",
  "get_attachment",
  "list_recent_posts",
  "get_post_summary_prompt",
];

const routeCases: RouteCase[] = [
  {
    name: "get_teams",
    input: { page: 2, perPage: 10, role: "owner" },
    path: "/v1/teams",
    query: { page: "2", per_page: "10", role: "owner" },
    response: { teams: [] },
  },
  {
    name: "get_team_stats",
    input: { teamName: "team.esa.io" },
    path: "/v1/teams/team/stats",
  },
  {
    name: "get_team_tags",
    input: { teamName: "team", page: 2, perPage: 10 },
    path: "/v1/teams/team/tags",
    query: { page: "2", per_page: "10" },
  },
  {
    name: "get_team_members",
    input: { teamName: "team", sort: "joined", order: "asc" },
    path: "/v1/teams/team/members",
    query: { sort: "joined", order: "asc" },
  },
  {
    name: "get_post",
    input: { teamName: "team", postNumber: 42, truncate: false },
    path: "/v1/teams/team/posts/42",
    response: { body_md: "full body" },
  },
  {
    name: "search_posts",
    input: { teamName: "team", query: "category:dev", sort: "updated", order: "desc", page: 2, perPage: 100 },
    path: "/v1/teams/team/posts",
    query: { q: "category:dev", sort: "updated", order: "desc", page: "2", per_page: "100" },
    response: { posts: [] },
  },
  {
    name: "create_post",
    input: { teamName: "team", name: "dev/docs/Title", bodyMd: "body", tags: ["tag"], wip: false, message: "create" },
    path: "/v1/teams/team/posts",
    method: "POST",
    body: {
      post: { name: "Title", body_md: "body", tags: ["tag"], category: "dev/docs", wip: false, message: "create" },
    },
  },
  {
    name: "update_post",
    input: {
      teamName: "team",
      postNumber: 42,
      name: "New title",
      bodyMd: "new body",
      category: "dev/docs",
      tags: ["tag"],
      wip: true,
      message: "update",
      originalRevision: { bodyMd: "old body", number: 3, user: "alice" },
    },
    path: "/v1/teams/team/posts/42",
    method: "PATCH",
    body: {
      post: {
        name: "New title",
        body_md: "new body",
        tags: ["tag"],
        category: "dev/docs",
        wip: true,
        message: "update",
        original_revision: { body_md: "old body", number: 3, user: "alice" },
      },
    },
  },
  {
    name: "append_post",
    input: { teamName: "team", postNumber: 42, content: "append", wip: false, message: "append message" },
    path: "/v1/teams/team/posts/42/append",
    method: "POST",
    body: { post: { content: "append", wip: false, message: "append message" } },
  },
  {
    name: "prepend_post",
    input: { teamName: "team", postNumber: 42, content: "prepend" },
    path: "/v1/teams/team/posts/42/prepend",
    method: "POST",
    body: { post: { content: "prepend" } },
  },
  {
    name: "get_comment",
    input: { teamName: "team", commentId: 7, include: "stargazers" },
    path: "/v1/teams/team/comments/7",
    query: { include: "stargazers" },
  },
  {
    name: "create_comment",
    input: { teamName: "team", postNumber: 42, bodyMd: "comment", user: "alice" },
    path: "/v1/teams/team/posts/42/comments",
    method: "POST",
    body: { comment: { body_md: "comment", user: "alice" } },
  },
  {
    name: "update_comment",
    input: { teamName: "team", commentId: 7, bodyMd: "comment", user: "alice" },
    path: "/v1/teams/team/comments/7",
    method: "PATCH",
    body: { comment: { body_md: "comment", user: "alice" } },
  },
  {
    name: "delete_comment",
    input: { teamName: "team", commentId: 7 },
    path: "/v1/teams/team/comments/7",
    method: "DELETE",
    response: null,
  },
  {
    name: "get_post_backlinks",
    input: { teamName: "team", postNumber: 42, page: 2, perPage: 10 },
    path: "/v1/teams/team/posts/42/backlinks",
    query: { page: "2", per_page: "10" },
    response: { posts: [] },
  },
  {
    name: "get_post_comments",
    input: { teamName: "team", postNumber: 42 },
    path: "/v1/teams/team/posts/42/comments",
    response: { comments: [] },
  },
  {
    name: "get_team_comments",
    input: { teamName: "team", page: 3 },
    path: "/v1/teams/team/comments",
    query: { page: "3" },
    response: { comments: [] },
  },
  {
    name: "get_categories",
    input: { teamName: "team", select: "dev", include: "posts", descendantPosts: true, perPage: 10 },
    path: "/v1/teams/team/categories",
    query: { select: "dev", include: "posts", descendant_posts: "true", per_page: "10" },
    response: { categories: [], parent_categories: [] },
  },
  {
    name: "get_top_categories",
    input: { teamName: "team" },
    path: "/v1/teams/team/categories/top",
    response: { categories: [], parent_categories: [] },
  },
  {
    name: "get_all_category_paths",
    input: { teamName: "team", page: 2, prefix: "dev", suffix: "api", match: "doc", exactMatch: "dev/docs" },
    path: "/v1/teams/team/categories/paths",
    query: { v: "2", page: "2", prefix: "dev", suffix: "api", match: "doc", exact_match: "dev/docs" },
  },
  {
    name: "ship_post",
    input: { teamName: "team", postNumber: 42 },
    path: "/v1/teams/team/posts/42",
    method: "PATCH",
    body: { post: { wip: false, message: "Ship It!" } },
  },
  {
    name: "rollback_post_revision",
    input: { teamName: "team", postNumber: 42, revisionNumber: 3, wip: false, message: "rollback" },
    path: "/v1/teams/team/posts/42/revisions/3/rollback",
    method: "POST",
    body: { post: { wip: false, message: "rollback" } },
  },
  {
    name: "get_search_options_help",
    input: {},
    path: "/v1/teams/docs/posts/104",
    response: { body_md: "help" },
  },
  {
    name: "get_markdown_syntax_help",
    input: {},
    path: "/v1/teams/docs/posts/49",
    response: { body_md: "help" },
  },
  {
    name: "search_help",
    input: { query: "Markdown", page: 2, perPage: 10 },
    path: "/v1/teams/docs/posts",
    query: { q: "Markdown", sort: "best_match", page: "2", per_page: "10" },
    response: { posts: [] },
  },
  {
    name: "get_attachment",
    input: { teamName: "team", url: "/uploads/image.png", forceSignedUrl: true },
    path: "/v1/teams/team/signed_urls",
    query: { urls: "/uploads/image.png", v: "2", expires_in: "300" },
    response: { signed_urls: [["/uploads/image.png", "https://files.esa.io/signed/image.png"]] },
  },
  {
    name: "list_recent_posts",
    input: { teamName: "team", perPage: 20 },
    path: "/v1/teams/team/posts",
    query: { sort: "updated", order: "desc", per_page: "20" },
    response: { posts: [] },
  },
  {
    name: "get_post_summary_prompt",
    input: { teamName: "team", postNumber: 42 },
    path: "/v1/teams/team/posts/42",
    response: {
      name: "Title",
      url: "https://team.esa.io/posts/42",
      created_by: { name: "Alice" },
      created_at: "2026-01-01",
      updated_at: "2026-01-02",
      body_md: "body",
    },
  },
];

describe("esa provider actions", () => {
  it("keeps all esa-mcp tools and action equivalents locally executable", () => {
    expect(esaActions.map((action) => action.name)).toEqual(expectedActionNames);
    expect(Object.keys(esaActionHandlers)).toEqual(expectedActionNames);
  });

  for (const routeCase of routeCases) {
    it(`maps ${routeCase.name} to the documented esa API request`, async () => {
      const { requests } = await execute(routeCase.name, routeCase.input, [routeCase.response ?? {}]);
      expect(requests).toHaveLength(1);
      const [request] = requests;
      expect(request.url.pathname).toBe(routeCase.path);
      expect(Object.fromEntries(request.url.searchParams)).toEqual(routeCase.query ?? {});
      expect(request.init?.method ?? "GET").toBe(routeCase.method ?? "GET");
      expect(new Headers(request.init?.headers).get("authorization")).toBe("Bearer esa-token");
      expect(request.init?.body === undefined ? undefined : JSON.parse(String(request.init.body))).toEqual(
        routeCase.body,
      );
    });
  }

  it("archives by reading the current category before updating the post", async () => {
    const { requests } = await execute("archive_post", { teamName: "team", postNumber: 42 }, [
      { category: "dev/docs" },
      {},
    ]);
    expect(requests.map((request) => request.url.pathname)).toEqual([
      "/v1/teams/team/posts/42",
      "/v1/teams/team/posts/42",
    ]);
    expect(requests[1]?.init?.method).toBe("PATCH");
    expect(JSON.parse(String(requests[1]?.init?.body))).toEqual({
      post: { category: "Archived/dev/docs", message: "Archive post" },
    });
  });
  it.each(["Archived", "Archived/dev/docs"])(
    "does not create a revision when the post is already archived as %s",
    async (category) => {
      const { output, requests } = await execute("archive_post", { teamName: "team", postNumber: 42 }, [{ category }]);

      expect(requests).toHaveLength(1);
      expect(output).toEqual({ message: "Post is already archived", category });
    },
  );

  it("duplicates through the source-post draft endpoint and creates a WIP destination post", async () => {
    const { requests } = await execute(
      "duplicate_post",
      { teamName: "source", postNumber: 42, targetTeamName: "target.esa.io" },
      [{ post: { name: "Source", body_md: "body" } }, {}],
    );
    expect(requests.map((request) => request.url.pathname)).toEqual([
      "/v1/teams/source/posts/new",
      "/v1/teams/target/posts",
    ]);
    expect(Object.fromEntries(requests[0]!.url.searchParams)).toEqual({ parent_post_id: "42" });
    expect(JSON.parse(String(requests[1]?.init?.body))).toEqual({
      post: { name: "Source", body_md: "body", wip: true },
    });
  });

  it("downloads a bounded supported image into transit storage", async () => {
    const downloadRequests = stubAttachmentDownload(
      new Response(new Uint8Array([1, 2, 3]), {
        headers: { "content-type": "image/png", "content-length": "3" },
      }),
    );
    const create = vi.fn(async (file: File) => {
      expect(file.name).toBe("image.png");
      expect(file.type).toBe("image/png");
      return {
        fileId: "file-1",
        downloadUrl: "http://localhost/files/file-1",
        sizeBytes: 3,
        name: file.name,
        mimeType: file.type,
      };
    });
    const apiRequests: CapturedRequest[] = [];
    const output = await esaActionHandlers.get_attachment(
      { teamName: "team", url: "/uploads/image.png" },
      {
        accessToken: "esa-token",
        fetcher: async (input, init) => {
          const url = new URL(input instanceof Request ? input.url : input.toString());
          apiRequests.push({ url, init });
          return Response.json({ signed_urls: [["/uploads/image.png", "https://files.esa.io/signed/image.png"]] });
        },
        transitFiles: createTransitFileStore(10, create),
      },
    );
    expect(apiRequests).toHaveLength(1);
    expect(downloadRequests).toHaveLength(1);
    expect(downloadRequests[0]?.url.toString()).toBe("https://files.esa.io/signed/image.png");
    expect(create).toHaveBeenCalledOnce();
    expect(output).toEqual({
      url: "https://files.esa.io/signed/image.png",
      file: {
        fileId: "file-1",
        downloadUrl: "http://localhost/files/file-1",
        sizeBytes: 3,
        name: "image.png",
        mimeType: "image/png",
      },
    });
  });

  it.each([
    ["https://img.esa.io/uploads/document.pdf", "application/pdf", "3"],
    ["https://img.esa.io/uploads/constructor", "constructor", "3"],
    ["https://custom-bucket.example/uploads/image.png", "image/png", "11"],
  ])("returns only the URL for an unsupported or oversized attachment at %s", async (url, mimeType, contentLength) => {
    const downloadRequests = stubAttachmentDownload(
      new Response(new Uint8Array([1, 2, 3]), {
        headers: { "content-type": mimeType, "content-length": contentLength },
      }),
    );
    const create = vi.fn<TransitFileStore["create"]>();

    const output = await esaActionHandlers.get_attachment(
      { teamName: "team", url },
      {
        accessToken: "esa-token",
        fetcher: async () => {
          throw new Error("esa API fetch was not expected");
        },
        transitFiles: createTransitFileStore(10, create),
      },
    );

    expect(output).toEqual({ url });
    expect(downloadRequests).toHaveLength(1);
    expect(create).not.toHaveBeenCalled();
  });

  it("bounds an attachment response when content-length is missing", async () => {
    stubAttachmentDownload(
      new Response(new Uint8Array([1, 2, 3]), {
        headers: { "content-type": "image/png" },
      }),
    );
    const create = vi.fn<TransitFileStore["create"]>();

    await expect(
      esaActionHandlers.get_attachment(
        { teamName: "team", url: "https://img.esa.io/uploads/image.png" },
        {
          accessToken: "esa-token",
          fetcher: async () => {
            throw new Error("esa API fetch was not expected");
          },
          transitFiles: createTransitFileStore(2, create),
        },
      ),
    ).rejects.toMatchObject({ status: 413 });
    expect(create).not.toHaveBeenCalled();
  });

  it("blocks an attachment redirect to a private target", async () => {
    const downloadRequests = stubAttachmentDownload(
      new Response(null, {
        status: 302,
        headers: { location: "http://127.0.0.1/private.png" },
      }),
    );

    await expect(
      esaActionHandlers.get_attachment(
        { teamName: "team", url: "https://img.esa.io/uploads/image.png" },
        {
          accessToken: "esa-token",
          fetcher: async () => {
            throw new Error("esa API fetch was not expected");
          },
          transitFiles: createTransitFileStore(10, vi.fn<TransitFileStore["create"]>()),
        },
      ),
    ).rejects.toThrow("redirect location must not target private or reserved IP addresses");
    expect(downloadRequests).toHaveLength(1);
  });

  it.each(["files.esa.io", "dl.esa.io"])(
    "signs a full secure attachment URL from %s using only its pathname",
    async (hostname) => {
      const path = "/uploads/example/image.png";
      const signedUrl = "https://cdn.example.com/signed/image.png";
      const { output, requests } = await execute(
        "get_attachment",
        {
          teamName: "team",
          url: `https://${hostname}${path}?stale=token#fragment`,
          forceSignedUrl: true,
        },
        [{ signed_urls: [[path, signedUrl]] }],
      );

      expect(requests).toHaveLength(1);
      expect(requests[0]?.url.pathname).toBe("/v1/teams/team/signed_urls");
      expect(Object.fromEntries(requests[0]!.url.searchParams)).toEqual({
        urls: path,
        v: "2",
        expires_in: "300",
      });
      expect(output).toEqual({ url: signedUrl });
    },
  );

  it("skips the transit download when forceSignedUrl is true", async () => {
    const downloadRequests = stubAttachmentDownload(
      new Response(new Uint8Array([1, 2, 3]), {
        headers: { "content-type": "image/png", "content-length": "3" },
      }),
    );
    const create = vi.fn<TransitFileStore["create"]>();
    const signedUrl = "https://cdn.example.com/signed/image.png";

    const output = await esaActionHandlers.get_attachment(
      { teamName: "team", url: "/uploads/image.png", forceSignedUrl: true },
      {
        accessToken: "esa-token",
        fetcher: async () => Response.json({ signed_urls: [["/uploads/image.png", signedUrl]] }),
        transitFiles: createTransitFileStore(10, create),
      },
    );

    expect(output).toEqual({ url: signedUrl });
    expect(downloadRequests).toHaveLength(0);
    expect(create).not.toHaveBeenCalled();
  });

  it.each([
    ["/not-an-upload/image.png", "url path must start with /uploads/"],
    ["//example.com/image.png", "url path must start with /uploads/"],
    ["http://img.esa.io/uploads/image.png", "url must use HTTPS"],
    ["https://127.0.0.1/image.png", "url must not target private or reserved IP addresses"],
    ["https://metadata.google.internal/image.png", "url must not target cloud metadata hosts"],
  ])("rejects unsafe or unsupported attachment URL %s", async (url, message) => {
    await expect(
      esaActionHandlers.get_attachment(
        { teamName: "team", url, forceSignedUrl: true },
        {
          accessToken: "esa-token",
          fetcher: async () => {
            throw new Error("fetch was not expected");
          },
        },
      ),
    ).rejects.toThrow(message);
  });

  it("treats a non-esa hostname inherited from Object.prototype as a public URL, not a secure esa host", async () => {
    const url = "https://constructor/uploads/image.png";
    const output = await esaActionHandlers.get_attachment(
      { teamName: "team", url, forceSignedUrl: true },
      {
        accessToken: "esa-token",
        fetcher: async () => {
          throw new Error("esa signing API was not expected");
        },
      },
    );

    expect(output).toEqual({ url });
  });

  it("truncates at a grapheme boundary while retaining full-body statistics", async () => {
    const familyEmoji = "👨‍👩‍👧‍👦";
    const body = `${"a".repeat(9_999)}${familyEmoji}tail`;
    const { output } = await execute("get_post", { teamName: "team", postNumber: 42 }, [{ body_md: body }]);
    expect(output).toMatchObject({
      body_md: `${"a".repeat(9_999)}\n\n... (truncated)`,
      body_md_stats: { characters: 10_004, lines: 1 },
    });
  });
});

function stubAttachmentDownload(response: Response): CapturedRequest[] {
  const requests: CapturedRequest[] = [];
  setDefaultGuardedFetchDnsLookup(null);
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push({ url: new URL(input instanceof Request ? input.url : input.toString()), init });
    return response;
  });
  return requests;
}

function createTransitFileStore(maxBytes: number, create: TransitFileStore["create"]): TransitFileStore {
  return {
    maxBytes,
    create,
    async read() {
      throw new Error("read is not expected in this test");
    },
    async delete() {
      return false;
    },
  };
}

async function execute(
  name: keyof typeof esaActionHandlers,
  input: Record<string, unknown>,
  responses: unknown[],
): Promise<{ output: unknown; requests: CapturedRequest[] }> {
  const requests: CapturedRequest[] = [];
  const context: BearerProviderContext = {
    accessToken: "esa-token",
    fetcher: async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : input.toString());
      requests.push({ url, init });
      const response = responses.shift();
      if (response === undefined) {
        throw new Error(`Unexpected request to ${url}`);
      }
      return Response.json(response);
    },
  };
  const output = await esaActionHandlers[name](input, context);
  return { output, requests };
}
