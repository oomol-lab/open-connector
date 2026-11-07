import type { MetabaseContext } from "./runtime.ts";

import { describe, expect, it } from "vitest";
import { getProviderActionHandler } from "../provider-executors.ts";
import { metabaseMcpHandlers } from "./mcp-runtime.ts";
import { normalizeMetabaseUrls } from "./runtime.ts";

interface RpcRequest {
  id?: string | number;
  method: string;
  params?: Record<string, unknown>;
}

function fixture() {
  const calls: RpcRequest[] = [];
  const headers: Headers[] = [];
  const methods: string[] = [];
  const urls: string[] = [];
  const fetcher: typeof fetch = async (url, init) => {
    methods.push(init?.method ?? "GET");
    headers.push(new Headers(init?.headers));
    urls.push(String(url));
    if (init?.method === "DELETE") return new Response(null, { status: 204 });
    if (init?.method === "GET") return new Response(null, { status: 405 });
    const request = JSON.parse(String(init?.body)) as RpcRequest;
    calls.push(request);
    if (request.id === undefined) return new Response(null, { status: 202 });
    let result: Record<string, unknown>;
    switch (request.method) {
      case "initialize":
        result = {
          protocolVersion: "2025-03-26",
          capabilities: { tools: {}, resources: {} },
          serverInfo: { name: "Metabase", version: "0.64.0" },
        };
        break;
      case "tools/list":
        result = { tools: [{ name: "execute_sql", inputSchema: { type: "object" } }] };
        break;
      case "tools/call":
        result = { content: [{ type: "text", text: '{"rows":[[1]]}' }] };
        break;
      default:
        throw new Error(`Unexpected method ${request.method}`);
    }
    return Response.json({ jsonrpc: "2.0", id: request.id, result }, { headers: { "mcp-session-id": "test-session" } });
  };
  const context: MetabaseContext = {
    apiKey: "test-key",
    apiBaseUrl: normalizeMetabaseUrls("https://metabase.example.com/bi/api/").apiBaseUrl,
    fetcher,
  };
  return { context, calls, headers, methods, urls };
}

async function invoke(name: string, input: Record<string, unknown>, context: MetabaseContext): Promise<unknown> {
  const handler = getProviderActionHandler(metabaseMcpHandlers, name)!;
  return handler(input, context);
}

describe("Metabase native MCP", () => {
  it("uses the normalized subpath endpoint and API key for every MCP request without DELETE", async () => {
    const { context, calls, methods, headers, urls } = fixture();
    await invoke("call_tool", { toolName: "execute_sql", arguments: { database_id: 1, sql: "select 1" } }, context);
    await invoke("list_tools", {}, context);
    expect(calls.filter((call) => call.method === "initialize")).toHaveLength(2);
    expect(methods).not.toContain("DELETE");
    expect(urls.every((url) => url === "https://metabase.example.com/bi/api/metabase-mcp")).toBe(true);
    expect(headers.every((header) => header.get("x-api-key") === "test-key" && !header.has("authorization"))).toBe(
      true,
    );
  });
});
