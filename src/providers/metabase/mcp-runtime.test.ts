import type { MetabaseContext } from "./runtime.ts";
import type { Schema } from "@cfworker/json-schema";

import { Validator } from "@cfworker/json-schema";
import { describe, expect, it } from "vitest";
import { validateActionInput } from "../../core/validation.ts";
import { getProviderActionHandler } from "../provider-executors.ts";
import { provider } from "./definition.ts";
import { executors } from "./executors.ts";
import { metabaseMcpHandlers } from "./mcp-runtime.ts";
import { normalizeMetabaseUrls } from "./runtime.ts";

interface RpcRequest {
  id?: string | number;
  method: string;
  params?: Record<string, unknown>;
}

const query = {
  "lib/type": "mbql/query",
  stages: [{ "lib/type": "mbql.stage/mbql", "source-table": 50, aggregation: [["count", {}]] }],
};
const execution = {
  cols: [{ name: "count", display_name: "Count", base_type: "type/Integer" }],
  rows: [[1]],
  returned: 1,
  truncated: false,
  query_handle: "handle-1",
};
const toolBodies: Record<string, Record<string, unknown>> = {
  execute_query: execution,
  execute_sql: execution,
  run_saved_question: execution,
  question_write: { id: 1, name: "Test" },
};

function fixture(toolResult?: Record<string, unknown>) {
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
        result = request.params?.cursor
          ? { tools: [{ name: "future_tool", inputSchema: { type: "object" } }] }
          : {
              tools: Object.keys(toolBodies).map((name) => ({
                name,
                description: `${name} description`,
                inputSchema: { type: "object", additionalProperties: true },
                annotations: { readOnlyHint: name !== "question_write" },
              })),
              nextCursor: "next",
            };
        break;
      case "resources/list":
        result = request.params?.cursor
          ? { resources: [{ uri: "ui://metabase/visualize-query.html", name: "Visualize Query" }] }
          : {
              resources: [{ uri: "catalog://metabase/fields", name: "Fields Catalog", mimeType: "application/json" }],
              nextCursor: "next",
            };
        break;
      case "resources/read":
        result = { contents: [{ uri: request.params?.uri, text: "{}", mimeType: "application/json" }] };
        break;
      case "tools/call": {
        const name = String(request.params?.name);
        const body = toolBodies[name];
        result =
          toolResult ??
          (body
            ? { content: [{ type: "text", text: JSON.stringify(body) }], structuredContent: body }
            : { content: [{ type: "text", text: `Unknown tool: "${name}"` }], isError: true });
        break;
      }
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
  const action = provider.actions.find((action) => action.name === name)!;
  expect(validateActionInput(action, input)).toMatchObject({ valid: true });
  const handler = getProviderActionHandler(metabaseMcpHandlers, name)!;
  const output = await handler(input, context);
  // Undefined fields are omitted on the runtime wire.
  expect(new Validator(action.outputSchema as Schema).validate(JSON.parse(JSON.stringify(output)))).toMatchObject({
    valid: true,
  });
  return output;
}

describe("Metabase native MCP", () => {
  it("passes tool names and arguments through unchanged", async () => {
    const { context, calls } = fixture();
    const args = { query, query_handle: null, cursor: null, row_limit: 10 };
    await expect(invoke("call_tool", { toolName: "execute_query", arguments: args }, context)).resolves.toEqual({
      result: execution,
    });
    expect(calls).toContainEqual(
      expect.objectContaining({
        method: "tools/call",
        params: expect.objectContaining({ name: "execute_query", arguments: args }),
      }),
    );
  });

  it("sends empty arguments when none are supplied", async () => {
    const { context, calls } = fixture();
    await invoke("call_tool", { toolName: "run_saved_question" }, context);
    expect(calls.find((call) => call.method === "tools/call")?.params).toMatchObject({
      name: "run_saved_question",
      arguments: {},
    });
  });

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

  it("indexes every tool page compactly without schemas", async () => {
    const { context, calls } = fixture();
    const output = (await invoke("list_tools", {}, context)) as { tools: Record<string, unknown>[] };
    expect(output.tools).toContainEqual({
      name: "execute_query",
      summary: "execute_query description",
      annotations: { readOnlyHint: true },
    });
    expect(output.tools.map((tool) => tool.name)).toContain("future_tool");
    expect(output.tools.some((tool) => "inputSchema" in tool || "description" in tool)).toBe(false);
    expect(calls.filter((call) => call.params?.cursor === "next")).toHaveLength(1);
    expect(executors["metabase.future_tool"]).toBeUndefined();
  });

  it("returns full descriptions and schemas only for requested tools", async () => {
    const { context } = fixture();
    await expect(invoke("list_tools", { toolNames: ["future_tool"] }, context)).resolves.toEqual({
      tools: [{ name: "future_tool", inputSchema: { type: "object" } }],
    });
    await expect(metabaseMcpHandlers.list_tools!({ toolNames: ["missing_tool"] }, context)).rejects.toMatchObject({
      status: 400,
      message: expect.stringContaining("missing_tool"),
    });
  });

  it("lists resources and reads non-Apps resources only", async () => {
    const { context, calls } = fixture();
    await expect(invoke("list_mcp_resources", {}, context)).resolves.toMatchObject({
      resources: [{ uri: "catalog://metabase/fields" }, { uri: "ui://metabase/visualize-query.html" }],
    });
    await expect(invoke("read_mcp_resource", { uri: "catalog://metabase/fields" }, context)).resolves.toMatchObject({
      contents: [{ text: "{}", mimeType: "application/json" }],
    });
    const before = calls.length;
    for (const uri of ["ui://metabase/visualize-query.html", "not a uri"]) {
      await expect(metabaseMcpHandlers.read_mcp_resource!({ uri }, context)).rejects.toMatchObject({ status: 400 });
    }
    expect(calls).toHaveLength(before);
  });

  it.each([
    [{ content: [{ type: "text", text: '{"rows":[]}' }] }, { rows: [] }, undefined],
    [
      { content: [{ type: "text", text: '{"returned":1}\nReturned 1 of at least 25.' }] },
      { returned: 1 },
      "Returned 1 of at least 25.",
    ],
    [{ content: [{ type: "text", text: "plain text" }] }, "plain text", undefined],
    [{ content: [] }, null, undefined],
  ])("falls back from structuredContent to text content", async (toolResult, result, notes) => {
    const { context } = fixture(toolResult);
    await expect(invoke("call_tool", { toolName: "execute_sql" }, context)).resolves.toEqual({ result, notes });
  });
});
