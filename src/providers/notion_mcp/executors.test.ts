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
  "notion-get-tool-access": JSON.stringify({
    current_tool_access: [
      { tool: "notion-search", status: "restricted", restricted_parameters: ["filters.edited_by_user_ids"] },
      { tool: "notion-fetch", status: "full", restricted_parameters: [] },
    ],
  }),
};

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

  it("flattens a page's discussions through notion-get-comments with include_all_blocks on by default", async () => {
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
      await executors["notion_mcp.list_comments"]!({ page_id: "p-2", include_all_blocks: false }, executionContext());
      expect(host.calls).toEqual([
        { name: "notion-get-comments", args: { page_id: "p-1", include_all_blocks: true } },
        { name: "notion-get-comments", args: { page_id: "p-2", include_all_blocks: false } },
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
            { tool: "notion-search", status: "restricted", restricted_parameters: ["filters.edited_by_user_ids"] },
            { tool: "notion-fetch", status: "full", restricted_parameters: [] },
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
        output: { results: [], notices: [], raw: "Sorry, nothing matched." },
      });
      expect(await executors["notion_mcp.get_self"]!({}, executionContext())).toEqual({
        ok: true,
        output: { raw: '{"unexpected":true}' },
      });
    } finally {
      await host.close();
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

  it.each([
    [401, "authorization_failed"],
    [403, "authorization_failed"],
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
  it("requires every mapped tool, then keys the account by the self user id", async () => {
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

  it("reports a rejected token as invalid credentials at sign-in", async () => {
    const host = createSyntheticHost([], async (request) =>
      request.method === "POST" ? new Response("nope", { status: 401 }) : undefined,
    );
    try {
      await expect(credentialValidators.oauth2!(oauthCredential(), { fetcher: host.fetcher })).rejects.toMatchObject({
        status: 400,
        message: "Notion MCP credential is invalid or expired.",
      });
    } finally {
      await host.close();
    }
  });
});
