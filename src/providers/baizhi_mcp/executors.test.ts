import type { IConnectionStore, StoredConnection } from "../../connection-service.ts";
import type { ExecutionContext, ResolvedCredential } from "../../core/types.ts";
import type { ToolAnnotations } from "@modelcontextprotocol/server";

import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { afterEach, expect, it, vi } from "vitest";
import * as z from "zod/v4";
import { createCatalogStore } from "../../catalog-store.ts";
import { ConnectionService } from "../../connection-service.ts";
import { setDefaultGuardedFetchDnsLookup } from "../../core/guarded-fetch.ts";
import { ProviderLoader } from "../provider-loader.ts";
import { executorModules } from "../registry.generated.ts";
import { provider } from "./definition.ts";

const endpoint = "https://agent-toolkit.app.baizhi.cloud/mcp";
const syntheticKey = "synthetic-baizhi-test-key";

interface SyntheticTool {
  name: string;
  annotations?: ToolAnnotations;
  structured?: boolean;
}

function createSyntheticHost(tools: SyntheticTool[], intercept?: (request: Request) => Promise<Response | undefined>) {
  const calls: string[] = [];
  const requests: Request[] = [];
  const handler = createMcpHandler(
    () => {
      const server = new McpServer({ name: "synthetic-baizhi", version: "1.0.0" });
      for (const tool of tools) {
        server.registerTool(
          tool.name,
          {
            description: `Synthetic ${tool.name}`,
            annotations: tool.annotations,
            inputSchema: z.object({ query: z.string().optional() }),
          },
          async ({ query }) => {
            calls.push(tool.name);
            return {
              content: [{ type: "text", text: `Synthetic result for ${query ?? "no query"}` }],
              structuredContent: tool.structured === false ? undefined : { source: "synthetic", tool: tool.name },
            };
          },
        );
      }
      return server;
    },
    { legacy: "stateless", responseMode: "json" },
  );
  const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    requests.push(request);
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
      if (service !== "baizhi_mcp") return undefined;
      return {
        authType: "api_key",
        apiKey: syntheticKey,
        values: { apiKey: syntheticKey },
        profile: { accountId: "synthetic", displayName: "Synthetic test", grantedScopes: [] },
        metadata: {},
      };
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  setDefaultGuardedFetchDnsLookup(undefined);
});

it("registers a bounded provider and dispatches a live-schema tool with a Header-only key", async () => {
  const host = createSyntheticHost([
    { name: "websearch_search", annotations: { readOnlyHint: true } },
    { name: "web_scrape" },
    { name: "web_extract", annotations: { readOnlyHint: true } },
    { name: "delete_all", annotations: { destructiveHint: true } },
  ]);
  try {
    setDefaultGuardedFetchDnsLookup(async () => [{ address: "1.1.1.1", family: 4 }]);
    const loader = new ProviderLoader(executorModules);
    const list = await loader.loadActionExecutor("baizhi_mcp", "baizhi_mcp.list_tools");
    const call = await loader.loadActionExecutor("baizhi_mcp", "baizhi_mcp.call_tool");
    expect(list).toBeDefined();
    expect(call).toBeDefined();
    expect(await loader.loadProxyExecutor("baizhi_mcp")).toBeUndefined();

    const connections = new ConnectionService({
      catalog: createCatalogStore([provider], {
        executableActionIds: new Set(["baizhi_mcp.list_tools", "baizhi_mcp.call_tool"]),
      }),
      providerLoader: loader,
      store: new MemoryConnectionStore(),
    });
    const connected = await connections.connectWithApiKey("baizhi_mcp", { values: { apiKey: syntheticKey } });
    expect(connected).toMatchObject({ service: "baizhi_mcp", configured: true });
    const context: ExecutionContext = { getCredential: connections.forConnection().getCredential };

    const discovered = await list!({}, context);
    expect(discovered).toMatchObject({
      ok: true,
      output: { tools: [{ name: "websearch_search" }, { name: "web_scrape" }, { name: "web_extract" }] },
    });
    const invoked = await call!({ toolName: "websearch_search", arguments: { query: "research" } }, context);
    expect(invoked).toEqual({ ok: true, output: { result: { source: "synthetic", tool: "websearch_search" } } });
    expect(await call!({ toolName: "web_scrape", arguments: { query: "page" } }, context)).toMatchObject({
      ok: true,
      output: { result: { tool: "web_scrape" } },
    });
    expect(await call!({ toolName: "web_extract", arguments: { query: "fields" } }, context)).toMatchObject({
      ok: true,
      output: { result: { tool: "web_extract" } },
    });
    expect(host.calls).toEqual(["websearch_search", "web_scrape", "web_extract"]);
    expect(host.requests.length).toBeGreaterThan(0);
    for (const request of host.requests) {
      expect(request.url).toBe(endpoint);
      expect(request.headers.get("authorization")).toBe(`Bearer ${syntheticKey}`);
      expect(request.url).not.toContain(syntheticKey);
    }
  } finally {
    await host.close();
  }
});

class MemoryConnectionStore implements IConnectionStore {
  private stored?: StoredConnection;

  async get(service: string, connectionName: string): Promise<StoredConnection | undefined> {
    return this.stored?.service === service && this.stored.connectionName === connectionName ? this.stored : undefined;
  }

  async set(service: string, connectionName: string, credential: ResolvedCredential) {
    this.stored = { id: "synthetic-connection", revision: "1", service, connectionName, credential };
    return this.stored;
  }

  async updateCredential(input: StoredConnection): Promise<boolean> {
    this.stored = input;
    return true;
  }

  async delete(): Promise<void> {
    this.stored = undefined;
  }

  async list(): Promise<StoredConnection[]> {
    return this.stored ? [this.stored] : [];
  }
}

it("rejects unsupported names before network and contradictory live annotations before tools/call", async () => {
  const host = createSyntheticHost([
    { name: "websearch_search", annotations: { readOnlyHint: false } },
    { name: "web_scrape", annotations: { destructiveHint: true } },
    { name: "web_extract", annotations: { readOnlyHint: true } },
  ]);
  try {
    const loader = new ProviderLoader(executorModules);
    const list = await loader.loadActionExecutor("baizhi_mcp", "baizhi_mcp.list_tools");
    const call = await loader.loadActionExecutor("baizhi_mcp", "baizhi_mcp.call_tool");
    const blocked = await call!({ toolName: "delete_all" }, executionContext());
    expect(blocked).toMatchObject({ ok: false, error: { code: "invalid_input" } });
    expect(host.fetcher).not.toHaveBeenCalled();

    const discovered = await list!({}, executionContext());
    expect(discovered).toMatchObject({ ok: true, output: { tools: [{ name: "web_extract" }] } });
    const unsafe = await call!({ toolName: "websearch_search", arguments: {} }, executionContext());
    expect(unsafe).toMatchObject({ ok: false, error: { code: "invalid_input" } });
    expect(host.calls).toEqual([]);
  } finally {
    await host.close();
  }
});

it("rechecks discovery on the call connection and keeps non-structured MCP content", async () => {
  const tools: SyntheticTool[] = [{ name: "web_scrape", structured: false }];
  const host = createSyntheticHost(tools);
  try {
    const loader = new ProviderLoader(executorModules);
    const list = await loader.loadActionExecutor("baizhi_mcp", "baizhi_mcp.list_tools");
    const call = await loader.loadActionExecutor("baizhi_mcp", "baizhi_mcp.call_tool");
    expect(await list!({}, executionContext())).toMatchObject({
      ok: true,
      output: { tools: [{ name: "web_scrape" }] },
    });
    tools.splice(0);
    expect(await call!({ toolName: "web_scrape" }, executionContext())).toMatchObject({
      ok: false,
      error: { code: "invalid_input" },
    });
    expect(host.calls).toEqual([]);

    tools.push({ name: "web_scrape", structured: false });
    const result = await call!({ toolName: "web_scrape" }, executionContext());
    expect(result).toMatchObject({
      ok: true,
      output: { result: { content: [{ type: "text", text: "Synthetic result for no query" }] } },
    });
  } finally {
    await host.close();
  }
});

it("fails closed on a repeated pagination cursor or duplicate permitted tool name", async () => {
  let mode: "cursor" | "duplicate" = "cursor";
  const host = createSyntheticHost([], async (request) => {
    if (request.method !== "POST") return undefined;
    const payload = (await request.json()) as { id?: number; method?: string };
    if (payload.method !== "tools/list") return undefined;
    const tools = [
      { name: "websearch_search", inputSchema: { type: "object", properties: {} } },
      ...(mode === "duplicate" ? [{ name: "websearch_search", inputSchema: { type: "object", properties: {} } }] : []),
    ];
    return Response.json({
      jsonrpc: "2.0",
      id: payload.id,
      result: { tools, nextCursor: mode === "cursor" ? "same" : undefined },
    });
  });
  try {
    const loader = new ProviderLoader(executorModules);
    const list = await loader.loadActionExecutor("baizhi_mcp", "baizhi_mcp.list_tools");
    const call = await loader.loadActionExecutor("baizhi_mcp", "baizhi_mcp.call_tool");
    expect(await list!({}, executionContext())).toMatchObject({ ok: false, error: { code: "provider_error" } });
    mode = "duplicate";
    expect(await list!({}, executionContext())).toMatchObject({ ok: false, error: { code: "provider_error" } });
    expect(await call!({ toolName: "websearch_search" }, executionContext())).toMatchObject({
      ok: false,
      error: { code: "provider_error" },
    });
    expect(host.calls).toEqual([]);
  } finally {
    await host.close();
  }
});

it.each([
  [401, "authorization_failed"],
  [403, "authorization_failed"],
  [429, "rate_limited"],
])("maps a synthetic HTTP %i and never returns the API key in the error", async (status, code) => {
  const host = createSyntheticHost([], async (request) =>
    request.method === "POST" ? new Response(`Synthetic failure ${syntheticKey}`, { status }) : undefined,
  );
  try {
    const loader = new ProviderLoader(executorModules);
    const list = await loader.loadActionExecutor("baizhi_mcp", "baizhi_mcp.list_tools");
    const result = await list!({}, executionContext());
    expect(result).toMatchObject({ ok: false, error: { code } });
    expect(JSON.stringify(result)).not.toContain(syntheticKey);
  } finally {
    await host.close();
  }
});

it("does not follow a cross-origin redirect carrying the Authorization Header", async () => {
  const host = createSyntheticHost([], async (request) =>
    request.method === "POST"
      ? new Response(null, { status: 307, headers: { location: "https://redirect.example/mcp" } })
      : undefined,
  );
  try {
    const loader = new ProviderLoader(executorModules);
    const list = await loader.loadActionExecutor("baizhi_mcp", "baizhi_mcp.list_tools");
    expect(await list!({}, executionContext())).toMatchObject({ ok: false });
    expect(host.requests).toHaveLength(1);
    expect(host.requests[0]!.url).toBe(endpoint);
    expect(host.requests[0]!.redirect).toBe("manual");
    expect(host.requests[0]!.headers.get("authorization")).toBe(`Bearer ${syntheticKey}`);
  } finally {
    await host.close();
  }
});

it("rejects an oversized MCP response", async () => {
  const host = createSyntheticHost([], async (request) =>
    request.method === "POST"
      ? new Response("oversized", { headers: { "content-length": String(9 * 1024 * 1024) } })
      : undefined,
  );
  try {
    const loader = new ProviderLoader(executorModules);
    const list = await loader.loadActionExecutor("baizhi_mcp", "baizhi_mcp.list_tools");
    expect(await list!({}, executionContext())).toMatchObject({
      ok: false,
      error: { code: "provider_error", message: "Baizhi MCP response exceeds 8388608 bytes" },
    });
  } finally {
    await host.close();
  }
});

it("propagates a cancelled host request without calling a web tool", async () => {
  const host = createSyntheticHost([{ name: "websearch_search" }]);
  try {
    const loader = new ProviderLoader(executorModules);
    const call = await loader.loadActionExecutor("baizhi_mcp", "baizhi_mcp.call_tool");
    const controller = new AbortController();
    controller.abort();
    const result = await call!({ toolName: "websearch_search" }, { ...executionContext(), signal: controller.signal });
    expect(result).toMatchObject({ ok: false });
    expect(host.calls).toEqual([]);
  } finally {
    await host.close();
  }
});
