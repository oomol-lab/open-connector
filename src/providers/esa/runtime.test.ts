import type { BearerProviderContext } from "../provider-runtime.ts";

import { describe, expect, it } from "vitest";
import { esaActions } from "./actions.ts";
import { esaActionHandlers } from "./runtime.ts";

type RouteCase = {
  name: keyof typeof esaActionHandlers;
  input: Record<string, unknown>;
  path: string;
  method?: string;
  query?: Record<string, string>;
  body?: unknown;
  response?: unknown;
};

type CapturedRequest = { url: URL; init: RequestInit | undefined };

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
  it("does not create a revision when the post is already archived", async () => {
    const { output, requests } = await execute("archive_post", { teamName: "team", postNumber: 42 }, [
      { category: "Archived/dev/docs" },
    ]);

    expect(requests).toHaveLength(1);
    expect(output).toEqual({
      message: "Post is already archived",
      category: "Archived/dev/docs",
    });
  });
  it("does not create a revision when the post is in the top-level Archived category", async () => {
    const { output, requests } = await execute("archive_post", { teamName: "team", postNumber: 42 }, [
      { category: "Archived" },
    ]);
    expect(requests).toHaveLength(1);
    expect(output).toEqual({
      message: "Post is already archived",
      category: "Archived",
    });
  });

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
    const requests: CapturedRequest[] = [];
    const output = await esaActionHandlers.get_attachment(
      { teamName: "team", url: "/uploads/image.png" },
      {
        accessToken: "esa-token",
        fetcher: async (input, init) => {
          const url = new URL(input instanceof Request ? input.url : input.toString());
          requests.push({ url, init });
          if (url.pathname.endsWith("/signed_urls")) {
            return Response.json({ signed_urls: [["/uploads/image.png", "https://files.esa.io/signed/image.png"]] });
          }
          return new Response(new Uint8Array([1, 2, 3]), {
            headers: { "content-type": "image/png", "content-length": "3" },
          });
        },
        transitFiles: {
          maxBytes: 10,
          async create(file) {
            expect(file.name).toBe("image.png");
            expect(file.type).toBe("image/png");
            return {
              fileId: "file-1",
              downloadUrl: "http://localhost/files/file-1",
              sizeBytes: 3,
              name: file.name,
              mimeType: file.type,
            };
          },
          async read() {
            throw new Error("read is not expected in this test");
          },
          async delete() {
            return false;
          },
        },
      },
    );
    expect(requests).toHaveLength(2);
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

  it("truncates long post bodies while retaining full-body statistics", async () => {
    const body = "a".repeat(10_001);
    const { output } = await execute("get_post", { teamName: "team", postNumber: 42 }, [{ body_md: body }]);
    expect(output).toMatchObject({
      body_md: `${"a".repeat(10_000)}\n\n... (truncated)`,
      body_md_stats: { characters: 10_001, lines: 1 },
    });
  });
  it("truncates long post bodies at grapheme boundaries", async () => {
    const body = `${"a".repeat(9_999)}👨‍👩‍👧‍👦b`;
    const { output } = await execute("get_post", { teamName: "team", postNumber: 42 }, [{ body_md: body }]);
    expect(output).toMatchObject({
      body_md: `${"a".repeat(9_999)}👨‍👩‍👧‍👦\n\n... (truncated)`,
      body_md_stats: { characters: 10_001, lines: 1 },
    });
  });

  it("rejects inherited object property names as attachment hosts", async () => {
    await expect(
      execute(
        "get_attachment",
        { teamName: "team", url: "https://constructor/uploads/a.png", forceSignedUrl: true },
        [],
      ),
    ).rejects.toMatchObject({
      status: 400,
      message: "url must use img.esa.io, files.esa.io, dl.esa.io, or an /uploads/... path",
    });
  });
});

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
