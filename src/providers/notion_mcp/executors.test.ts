import type { ExecutionContext } from "../../core/types.ts";

import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as z from "zod/v4";
import { notionMcpEndpoint } from "./endpoints.ts";
import { credentialValidators, executors } from "./executors.ts";

const syntheticToken = "synthetic-notion-oauth-token";

/** Tool answers in the shapes Notion's beta server returned in September 2026, with synthetic identifiers. */
const recordedAnswers: Record<string, string> = {
  "notion-get-users": JSON.stringify({
    results: [{ type: "person", id: "u-me-0001", name: "Ada Lovelace", email: "ada@example.com" }],
    has_more: false,
  }),
  "notion-search": JSON.stringify({
    type: "workspace_search",
    results: [
      {
        id: "p-1",
        title: "Roadmap",
        url: "https://www.notion.so/p-1",
        type: "page",
        timestamp: "2026-09-25T10:00:00.000Z",
        path: "Wiki / Roadmap",
      },
      { id: "p-2", title: "Untyped" },
    ],
    notices: [{ message: "filters.edited_by_user_ids requires a Business plan and was ignored" }],
  }),
  "notion-fetch": [
    "Here is the result of the fetch:",
    '<page url="https://www.notion.so/p-1" title="Roadmap"><properties>Status: Draft</properties>',
    '<content truncated="true"># Roadmap\n\nQ4 &amp; beyond</content></page>',
  ].join("\n"),
  "notion-get-comments": JSON.stringify({
    discussions: [
      {
        id: "d-1",
        comments: [
          {
            id: "c-1",
            plain_text: "Looks good",
            created_time: "2026-09-25T11:00:00.000Z",
            created_by: { id: "u-me-0001", name: "Ada Lovelace" },
          },
        ],
      },
    ],
  }),
  // The map keyed by tool base name that Notion's supported-tools guide documents.
  "notion-get-tool-access": JSON.stringify({
    current_tool_access: {
      search: {
        status: "available",
        restricted_parameters: { "filters.edited_by_user_ids": "Requires a Business or Enterprise plan." },
      },
      fetch: { status: "available" },
    },
  }),
  // The write answers are synthetic: the server's shapes for them were not recorded, so the readers accept a
  // listed record, a single record and a prose answer alike, and the raw text always travels beside them.
  "notion-create-pages": JSON.stringify({
    pages: [{ id: "p-9", url: "https://www.notion.so/Notes-0123456789abcdef0123456789abcdef", title: "Notes" }],
  }),
  "notion-update-page": "Updated the page at https://www.notion.so/Roadmap-fedcba9876543210fedcba9876543210.",
  "notion-create-comment": JSON.stringify({ id: "c-9", discussion_id: "d-9", plain_text: "Looks good." }),
};
const writeTools = ["notion-create-pages", "notion-update-page", "notion-create-comment"];

interface SyntheticCall {
  name: string;
  args: Record<string, unknown>;
}

function createSyntheticHost(
  toolNames: string[],
  intercept?: (request: Request) => Promise<Response | undefined>,
  answers: Record<string, string> = recordedAnswers,
) {
  const calls: SyntheticCall[] = [];
  const requests: Request[] = [];
  const handler = createMcpHandler(
    () => {
      const server = new McpServer({ name: "synthetic-notion", version: "1.0.0" });
      for (const name of toolNames) {
        server.registerTool(
          name,
          { description: `Synthetic ${name}`, inputSchema: z.looseObject({}) },
          async (args) => {
            calls.push({ name, args });
            return { content: [{ type: "text", text: answers[name] ?? "" }] };
          },
        );
      }
      return server;
    },
    { legacy: "stateless", responseMode: "json" },
  );
  const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    requests.push(request.clone());
    const intercepted = await intercept?.(request.clone());
    if (intercepted) return intercepted;
    return handler.fetch(request);
  });
  vi.stubGlobal("fetch", fetcher);
  return { calls, requests, fetcher, close: () => handler.close() };
}

function executionContext(): ExecutionContext {
  return {
    async getCredential(service) {
      if (service !== "notion_mcp") return undefined;
      return {
        authType: "oauth2",
        accessToken: syntheticToken,
        tokenType: "Bearer",
        profile: { accountId: "u-me-0001", displayName: "Ada Lovelace", grantedScopes: [] },
        metadata: {},
      };
    },
  };
}

function oauthCredential() {
  return {
    authType: "oauth2" as const,
    accessToken: syntheticToken,
    tokenType: "Bearer",
    profile: { accountId: "oauth2", displayName: "OAuth Credential", grantedScopes: [] },
    metadata: { scope: "default" },
  };
}

const allTools = Object.keys(recordedAnswers);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("notion_mcp executors", () => {
  it("sends the recorded search arguments and returns typed results, notices and the raw text", async () => {
    const host = createSyntheticHost(allTools);
    try {
      const result = await executors["notion_mcp.search"]!(
        {
          query: "",
          sort: "last_edited",
          page_size: 50,
          max_highlight_length: 0,
          last_edited_date_range: { start_date: "2026-09-20", end_date: "2026-09-26" },
          created_by_user_ids: ["u-me-0001"],
          filters: { title_only: true, created_by_user_ids: ["overridden"] },
        },
        executionContext(),
      );
      expect(result).toEqual({
        ok: true,
        output: {
          type: "workspace_search",
          results: [
            {
              id: "p-1",
              title: "Roadmap",
              url: "https://www.notion.so/p-1",
              type: "page",
              timestamp: "2026-09-25T10:00:00.000Z",
              path: "Wiki / Roadmap",
            },
            { id: "p-2", title: "Untyped" },
          ],
          notices: ["filters.edited_by_user_ids requires a Business plan and was ignored"],
          raw: recordedAnswers["notion-search"],
        },
      });
      expect(host.calls).toEqual([
        {
          name: "notion-search",
          args: {
            query: "",
            sort: "last_edited",
            page_size: 50,
            max_highlight_length: 0,
            filters: {
              title_only: true,
              last_edited_date_range: { start_date: "2026-09-20", end_date: "2026-09-26" },
              created_by_user_ids: ["u-me-0001"],
            },
          },
        },
      ]);
      for (const request of host.requests) {
        expect(request.url).toBe(notionMcpEndpoint);
        expect(request.headers.get("authorization")).toBe(`Bearer ${syntheticToken}`);
        expect(request.url).not.toContain(syntheticToken);
      }
    } finally {
      await host.close();
    }
  });

  it("omits filters from a bare search and sends an empty query", async () => {
    const host = createSyntheticHost(allTools);
    try {
      await executors["notion_mcp.search"]!({}, executionContext());
      expect(host.calls).toEqual([{ name: "notion-search", args: { query: "" } }]);
    } finally {
      await host.close();
    }
  });

  it("reads a page envelope through notion-fetch, echoing the id and keeping the truncated mark", async () => {
    const host = createSyntheticHost(allTools);
    try {
      expect(await executors["notion_mcp.fetch_page"]!({ id: "p-1" }, executionContext())).toEqual({
        ok: true,
        output: {
          id: "p-1",
          title: "Roadmap",
          url: "https://www.notion.so/p-1",
          properties: "Status: Draft",
          content: "# Roadmap\n\nQ4 & beyond",
          truncated: true,
          raw: recordedAnswers["notion-fetch"],
        },
      });
      expect(host.calls).toEqual([{ name: "notion-fetch", args: { id: "p-1" } }]);
    } finally {
      await host.close();
    }
  });

  it("flattens a page's discussions through notion-get-comments with block-level and resolved threads on by default", async () => {
    const host = createSyntheticHost(allTools);
    try {
      expect(await executors["notion_mcp.list_comments"]!({ page_id: "p-1" }, executionContext())).toEqual({
        ok: true,
        output: {
          comments: [
            {
              id: "c-1",
              discussion_id: "d-1",
              plain_text: "Looks good",
              created_time: "2026-09-25T11:00:00.000Z",
              created_by: { id: "u-me-0001", name: "Ada Lovelace" },
            },
          ],
          raw: recordedAnswers["notion-get-comments"],
        },
      });
      await executors["notion_mcp.list_comments"]!(
        { page_id: "p-2", include_all_blocks: false, include_resolved: false },
        executionContext(),
      );
      expect(host.calls).toEqual([
        { name: "notion-get-comments", args: { page_id: "p-1", include_all_blocks: true, include_resolved: true } },
        { name: "notion-get-comments", args: { page_id: "p-2", include_all_blocks: false, include_resolved: false } },
      ]);
    } finally {
      await host.close();
    }
  });

  it("reports the plan's restricted parameters and identifies the user", async () => {
    const host = createSyntheticHost(allTools);
    try {
      expect(await executors["notion_mcp.tool_access"]!({}, executionContext())).toEqual({
        ok: true,
        output: {
          tools: [
            {
              tool: "search",
              status: "available",
              restricted_parameters: [
                { parameter: "filters.edited_by_user_ids", reason: "Requires a Business or Enterprise plan." },
              ],
            },
            { tool: "fetch", status: "available", restricted_parameters: [] },
          ],
          raw: recordedAnswers["notion-get-tool-access"],
        },
      });
      expect(await executors["notion_mcp.get_self"]!({}, executionContext())).toEqual({
        ok: true,
        output: {
          user: { type: "person", id: "u-me-0001", name: "Ada Lovelace", email: "ada@example.com" },
          raw: recordedAnswers["notion-get-users"],
        },
      });
      expect(host.calls).toEqual([
        { name: "notion-get-tool-access", args: {} },
        { name: "notion-get-users", args: { user_id: "self" } },
      ]);
    } finally {
      await host.close();
    }
  });

  it("keeps the raw text and yields empty typed fields when a tool's shape is unrecognized", async () => {
    const host = createSyntheticHost(allTools, undefined, {
      "notion-search": "Sorry, nothing matched.",
      "notion-get-users": '{"unexpected":true}',
    });
    try {
      expect(await executors["notion_mcp.search"]!({ query: "x" }, executionContext())).toEqual({
        ok: true,
        output: { type: undefined, results: [], notices: [], raw: "Sorry, nothing matched." },
      });
      expect(await executors["notion_mcp.get_self"]!({}, executionContext())).toEqual({
        ok: true,
        output: { raw: '{"unexpected":true}' },
      });
    } finally {
      await host.close();
    }
  });

  it("create_pages forwards the pages with their parent and lifts the pages the server named", async () => {
    const host = createSyntheticHost(allTools);
    try {
      const result = await executors["notion_mcp.create_pages"]!(
        {
          pages: [{ properties: { title: "Notes" }, content: "# Notes\n\nFirst line." }],
          parent: { page_id: "p-1" },
          allow_async: false,
        },
        executionContext(),
      );
      expect(result).toEqual({
        ok: true,
        output: {
          pages: [{ id: "p-9", url: "https://www.notion.so/Notes-0123456789abcdef0123456789abcdef", title: "Notes" }],
          raw: recordedAnswers["notion-create-pages"],
        },
      });
      expect(host.calls).toEqual([
        {
          name: "notion-create-pages",
          args: {
            pages: [{ properties: { title: "Notes" }, content: "# Notes\n\nFirst line." }],
            parent: { page_id: "p-1" },
            allow_async: false,
          },
        },
      ]);
      expect(await executors["notion_mcp.create_pages"]!({ pages: [] }, executionContext())).toMatchObject({
        ok: false,
        error: { message: "pages is required." },
      });
    } finally {
      await host.close();
    }
  });

  it("create_pages reads the page links out of a prose answer and the task id out of a deferred one", async () => {
    const host = createSyntheticHost(allTools, undefined, {
      ...recordedAnswers,
      "notion-create-pages":
        "Created 2 pages: https://www.notion.so/A-0123456789abcdef0123456789abcdef and https://www.notion.so/B-11112222333344445555666677778888?pvs=4",
    });
    try {
      expect(
        await executors["notion_mcp.create_pages"]!({ pages: [{ content: "x" }] }, executionContext()),
      ).toMatchObject({
        ok: true,
        output: {
          pages: [
            { id: "0123456789abcdef0123456789abcdef", url: "https://www.notion.so/A-0123456789abcdef0123456789abcdef" },
            {
              id: "11112222333344445555666677778888",
              url: "https://www.notion.so/B-11112222333344445555666677778888?pvs=4",
            },
          ],
        },
      });
    } finally {
      await host.close();
    }
    const deferred = createSyntheticHost(allTools, undefined, {
      ...recordedAnswers,
      "notion-create-pages": JSON.stringify({ object: "async_task", id: "task-1", status: "queued" }),
    });
    try {
      expect(await executors["notion_mcp.create_pages"]!({ pages: [{ content: "x" }] }, executionContext())).toEqual({
        ok: true,
        output: {
          pages: [],
          async_task_id: "task-1",
          raw: JSON.stringify({ object: "async_task", id: "task-1", status: "queued" }),
        },
      });
    } finally {
      await deferred.close();
    }
  });

  it("update_page preserves async task IDs, warning objects and raw MCP responses", async () => {
    const warnings = [{ code: "no_match", message: "No matching text", details: { index: 1 } }];
    const raw = JSON.stringify({ object: "async_task", id: "task-2", status: "queued", warnings });
    const host = createSyntheticHost(allTools, undefined, { ...recordedAnswers, "notion-update-page": raw });
    try {
      expect(
        await executors["notion_mcp.update_page"]!({ page_id: "p-1", command: "update_content" }, executionContext()),
      ).toEqual({
        ok: true,
        output: { page_id: "p-1", async_task_id: "task-2", warnings, raw },
      });
    } finally {
      await host.close();
    }
  });

  it("update_page forwards the command and echoes the page id with the link the answer names", async () => {
    const host = createSyntheticHost(allTools);
    try {
      const result = await executors["notion_mcp.update_page"]!(
        {
          page_id: "p-1",
          command: "update_content",
          content_updates: [{ old_str: "Q4 & beyond", new_str: "Q4, Q1 and beyond" }],
        },
        executionContext(),
      );
      expect(result).toEqual({
        ok: true,
        output: {
          page_id: "p-1",
          url: "https://www.notion.so/Roadmap-fedcba9876543210fedcba9876543210",
          raw: recordedAnswers["notion-update-page"],
        },
      });
      expect(host.calls).toEqual([
        {
          name: "notion-update-page",
          args: {
            page_id: "p-1",
            command: "update_content",
            content_updates: [{ old_str: "Q4 & beyond", new_str: "Q4, Q1 and beyond" }],
          },
        },
      ]);
      expect(await executors["notion_mcp.update_page"]!({ page_id: "p-1" }, executionContext())).toMatchObject({
        ok: false,
        error: { message: "command is required." },
      });
    } finally {
      await host.close();
    }
  });

  it("create_comment forwards the markdown and lifts the comment the server named", async () => {
    const host = createSyntheticHost(allTools);
    try {
      const result = await executors["notion_mcp.create_comment"]!(
        { page_id: "p-1", markdown: "Looks good.", reply_to_comment_id: "c-1" },
        executionContext(),
      );
      expect(result).toEqual({
        ok: true,
        output: { comment: { id: "c-9", discussion_id: "d-9" }, raw: recordedAnswers["notion-create-comment"] },
      });
      expect(host.calls).toEqual([
        {
          name: "notion-create-comment",
          args: { page_id: "p-1", markdown: "Looks good.", reply_to_comment_id: "c-1" },
        },
      ]);
      expect(await executors["notion_mcp.create_comment"]!({ page_id: "p-1" }, executionContext())).toMatchObject({
        ok: false,
        error: { message: "markdown is required." },
      });
    } finally {
      await host.close();
    }
    const prose = createSyntheticHost(allTools, undefined, {
      ...recordedAnswers,
      "notion-create-comment": "Comment added.",
    });
    try {
      expect(
        await executors["notion_mcp.create_comment"]!({ page_id: "p-1", markdown: "Hi" }, executionContext()),
      ).toEqual({ ok: true, output: { raw: "Comment added." } });
    } finally {
      await prose.close();
    }
  });

  it("reports a tool error as a provider error", async () => {
    const host = createSyntheticHost([], async (request) => {
      if (request.method !== "POST") return undefined;
      const payload = (await request.json()) as { id?: number; method?: string };
      if (payload.method !== "tools/call") return undefined;
      return Response.json({
        jsonrpc: "2.0",
        id: payload.id,
        result: { isError: true, content: [{ type: "text", text: "Page not found" }] },
      });
    });
    try {
      expect(await executors["notion_mcp.fetch_page"]!({ id: "missing" }, executionContext())).toMatchObject({
        ok: false,
        error: { code: "provider_error", message: "Notion MCP tool notion-fetch failed." },
      });
    } finally {
      await host.close();
    }
  });

  it("reports a rate limit Notion returns as a tool error as rate limited", async () => {
    const host = createSyntheticHost([], async (request) => {
      if (request.method !== "POST") return undefined;
      const payload = (await request.json()) as { id?: number; method?: string };
      if (payload.method !== "tools/call") return undefined;
      return Response.json({
        jsonrpc: "2.0",
        id: payload.id,
        result: {
          isError: true,
          content: [{ type: "text", text: "Rate limited" }],
          structuredContent: {
            error: {
              code: "rate_limited",
              retry_after_seconds: 12,
              rate_limit_reason: "public_api_endpoint_rate_limit",
            },
          },
        },
      });
    });
    try {
      expect(await executors["notion_mcp.search"]!({ query: "x" }, executionContext())).toMatchObject({
        ok: false,
        error: {
          code: "rate_limited",
          message: "Notion MCP tool notion-search was rate limited; retry after 12 seconds.",
        },
      });
    } finally {
      await host.close();
    }
  });

  it.each([
    [401, "provider_error"],
    [403, "provider_error"],
    [429, "rate_limited"],
  ])("maps a synthetic HTTP %i and never returns the token in the error", async (status, code) => {
    const host = createSyntheticHost([], async (request) =>
      request.method === "POST" ? new Response(`Synthetic failure ${syntheticToken}`, { status }) : undefined,
    );
    try {
      const result = await executors["notion_mcp.get_self"]!({}, executionContext());
      expect(result).toMatchObject({ ok: false, error: { code } });
      expect(JSON.stringify(result)).not.toContain(syntheticToken);
    } finally {
      await host.close();
    }
  });
});

describe("notion_mcp credential validator", () => {
  it("validates a connection whose server lists the reads and none of the writes", async () => {
    const host = createSyntheticHost(allTools.filter((name) => !writeTools.includes(name)));
    try {
      const result = await credentialValidators.oauth2!(oauthCredential(), { fetcher: host.fetcher });
      expect(result).toMatchObject({
        profile: { accountId: "u-me-0001" },
        metadata: { discoveredToolCount: allTools.length - writeTools.length },
      });
    } finally {
      await host.close();
    }
  });

  it("requires every read tool, then keys the account by the self user id", async () => {
    const host = createSyntheticHost(allTools);
    try {
      const result = await credentialValidators.oauth2!(oauthCredential(), { fetcher: host.fetcher });
      expect(result).toEqual({
        profile: { accountId: "u-me-0001", displayName: "Ada Lovelace" },
        grantedScopes: ["default"],
        metadata: { mcpEndpoint: notionMcpEndpoint, discoveredToolCount: allTools.length },
      });
      expect(host.calls).toEqual([{ name: "notion-get-users", args: { user_id: "self" } }]);
      const methods = await Promise.all(
        host.requests
          .filter((request) => request.method === "POST")
          .map(async (request) => ((await request.json()) as { method?: string }).method),
      );
      expect(methods).toEqual(["initialize", "notifications/initialized", "tools/list", "tools/call"]);
    } finally {
      await host.close();
    }
  });

  it("refuses the sign-in naming the tools the server no longer exposes", async () => {
    const host = createSyntheticHost(
      allTools.filter((name) => name !== "notion-get-comments" && name !== "notion-fetch"),
    );
    try {
      await expect(credentialValidators.oauth2!(oauthCredential(), { fetcher: host.fetcher })).rejects.toMatchObject({
        status: 502,
        message: "Notion MCP did not expose the tools this connector needs: notion-fetch, notion-get-comments.",
      });
      expect(host.calls).toEqual([]);
    } finally {
      await host.close();
    }
  });

  it("refuses a sign-in whose self call names no user", async () => {
    const host = createSyntheticHost(allTools, undefined, { ...recordedAnswers, "notion-get-users": '{"results":[]}' });
    try {
      await expect(credentialValidators.oauth2!(oauthCredential(), { fetcher: host.fetcher })).rejects.toMatchObject({
        status: 502,
        message: "Notion MCP did not identify the connected user.",
      });
    } finally {
      await host.close();
    }
  });

  it("preserves an ambiguous authorization failure at sign-in", async () => {
    const host = createSyntheticHost([], async (request) =>
      request.method === "POST" ? new Response("nope", { status: 401 }) : undefined,
    );
    try {
      await expect(credentialValidators.oauth2!(oauthCredential(), { fetcher: host.fetcher })).rejects.toMatchObject({
        status: 401,
        code: "provider_error",
        message: expect.stringMatching(/Notion MCP (authorization request failed|request failed with HTTP 401)/),
      });
    } finally {
      await host.close();
    }
  });
});
