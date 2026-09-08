import type { MetabaseContext } from "./runtime.ts";
import type { Schema } from "@cfworker/json-schema";

import { Validator } from "@cfworker/json-schema";
import { SdkError, SdkErrorCode } from "@modelcontextprotocol/client";
import { describe, expect, it } from "vitest";
import { validateActionInput } from "../../core/validation.ts";
import { getProviderActionHandler } from "../provider-runtime.ts";
import { provider } from "./definition.ts";
import { executors } from "./executors.ts";
import { metabaseMcpHandlers, runMetabaseMcp } from "./mcp-runtime.ts";
import { normalizeMetabaseUrls } from "./runtime.ts";

interface RpcRequest {
  id?: string | number;
  method: string;
  params?: Record<string, unknown>;
}

const handle = "12345678-1234-4234-8234-123456789abc";
const query = {
  "lib/type": "mbql/query",
  stages: [{ "lib/type": "mbql.stage/mbql", "source-table": ["Sample Database", "PUBLIC", "ORDERS"] }],
};
const execution = {
  status: "completed",
  data: { cols: [{ name: "count", display_name: "Count", base_type: "type/Integer" }], rows: [[1]] },
  row_count: 1,
  running_time: 20,
};
const entity = { id: 1, name: "Test", collection_id: null, collection_path: "Our analytics", description: null };
const createdCard = { ...entity, display: "table", url: "/question/1" };
const updatedCard = { ...entity, display: "table", archived: false };
const toolBodies: Record<string, Record<string, unknown>> = {
  search: { data: [{ id: 1, type: "table", name: "ORDERS", database_id: 1 }], total_count: 1 },
  read_resource: {
    resources: [
      { uri: "metabase://databases", content: [{ id: 1 }] },
      { uri: "metabase://question/99", error: "Not found" },
    ],
    output: "<resources/>",
  },
  construct_query: { query_handle: handle },
  construct_native_query: { query_handle: handle },
  query: { ...execution, continuation_token: "next-page" },
  execute_query: execution,
  execute_sql: execution,
  execute_question: execution,
  create_question: createdCard,
  create_metric: createdCard,
  update_question: updatedCard,
  update_metric: updatedCard,
  create_dashboard: { ...entity, url: "/dashboard/1", dashcard_ids: [2] },
  update_dashboard: { ...entity, archived: false, dashcard_ids: [2] },
  create_collection: { id: 1, name: "Test", parent_id: null, location: "/", description: null },
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
          serverInfo: { name: "Metabase", version: "0.63.16" },
        };
        break;
      case "tools/list":
        result = request.params?.cursor
          ? { tools: [{ name: "future_tool", inputSchema: { type: "object" } }] }
          : {
              tools: Object.keys(toolBodies).map((name) => ({
                name,
                inputSchema: { type: "object", additionalProperties: true },
              })),
              nextCursor: "next",
            };
        break;
      case "resources/list":
        result = request.params?.cursor
          ? { resources: [{ uri: "metabase://docs/second.md", name: "Second reference" }] }
          : {
              resources: [
                { uri: "metabase://docs/construct-query.md", name: "Query reference", mimeType: "text/markdown" },
              ],
              nextCursor: "next",
            };
        break;
      case "resources/read":
        result = { contents: [{ uri: request.params?.uri, text: "Query reference", mimeType: "text/markdown" }] };
        break;
      case "tools/call": {
        const body = toolBodies[String(request.params?.name)];
        result = toolResult ?? { content: [{ type: "text", text: JSON.stringify(body) }], structuredContent: body };
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

interface MappingCase {
  name: string;
  input: Record<string, unknown>;
  nativeName?: string;
  args: Record<string, unknown>;
}
const mappingCases: MappingCase[] = [
  {
    name: "search_content",
    nativeName: "search",
    input: { termQueries: ["orders"], semanticQueries: ["revenue"] },
    args: { term_queries: ["orders"], semantic_queries: ["revenue"] },
  },
  {
    name: "read_resource",
    input: { uris: ["metabase://databases", "metabase://question/99"] },
    args: { uris: ["metabase://databases", "metabase://question/99"] },
  },
  { name: "construct_query", input: { query, prompt: "Count orders" }, args: { query, prompt: "Count orders" } },
  {
    name: "construct_native_query",
    input: { databaseId: 1, sql: "select 1" },
    args: { database_id: 1, sql: "select 1" },
  },
  { name: "query", input: { queryHandle: handle }, args: { query_handle: handle } },
  { name: "execute_query", input: { queryHandle: handle }, args: { query_handle: handle } },
  { name: "execute_sql", input: { databaseId: 1, sql: "select 1" }, args: { database_id: 1, sql: "select 1" } },
  { name: "execute_question", input: { id: 1 }, args: { id: 1 } },
  ...["create_question", "create_metric"].map((name) => ({
    name,
    input: {
      name: "Test",
      queryHandle: handle,
      collectionId: 2,
      visualizationSettings: { "graph.dimensions": ["count"] },
    },
    args: { name: "Test", query: handle, collection_id: 2, visualization_settings: { "graph.dimensions": ["count"] } },
  })),
  ...["update_question", "update_metric"].map((name) => ({
    name,
    input: { id: 1, queryHandle: handle, archived: false, description: "", display: "bar" },
    args: { id: 1, query: handle, archived: false, description: "", display: "bar" },
  })),
  {
    name: "create_dashboard",
    input: { name: "Test", collectionId: 2, questionIds: [1] },
    args: { name: "Test", collection_id: 2, question_ids: [1] },
  },
  {
    name: "update_dashboard",
    input: {
      id: 1,
      archived: false,
      dashcards: [
        { action: "add", cardId: 42, displaySize: "wide" },
        { action: "remove", dashcardId: 5 },
        { action: "move", dashcardId: 6, position: "top" },
      ],
    },
    args: {
      id: 1,
      archived: false,
      dashcards: [
        { action: "add", card_id: 42, display_size: "wide" },
        { action: "remove", dashcard_id: 5 },
        { action: "move", dashcard_id: 6, position: "top" },
      ],
    },
  },
  {
    name: "create_collection",
    input: { name: "Test", parentCollectionId: 2 },
    args: { name: "Test", parent_collection_id: 2 },
  },
];

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
  it.each(mappingCases)(
    "maps $name to the verified native fields and returns its declared output",
    async ({ name, input, nativeName, args }) => {
      const { context, calls } = fixture();
      const output = await invoke(name, input, context);
      expect(output).not.toHaveProperty("result");
      expect(calls).toContainEqual(
        expect.objectContaining({
          method: "tools/call",
          params: expect.objectContaining({ name: nativeName ?? name, arguments: args }),
        }),
      );
    },
  );

  it("registers executors for the combined REST and MCP catalog", () => {
    expect(Object.keys(executors).sort()).toEqual(provider.actions.map((action) => action.id).sort());
  });

  it("uses the normalized subpath endpoint and API key for every MCP request without DELETE", async () => {
    const { context, calls, methods, headers, urls } = fixture();
    await invoke("construct_native_query", { databaseId: 1, sql: "select 1" }, context);
    await invoke("create_question", { name: "Test", queryHandle: handle }, context);
    expect(calls.filter((call) => call.method === "initialize")).toHaveLength(2);
    expect(methods).not.toContain("DELETE");
    expect(urls.every((url) => url === "https://metabase.example.com/bi/api/metabase-mcp")).toBe(true);
    expect(headers.every((header) => header.get("x-api-key") === "test-key" && !header.has("authorization"))).toBe(
      true,
    );
  });

  it("discovers all pages with useful fields but never exposes arbitrary tools as actions", async () => {
    const { context, calls } = fixture();
    await expect(invoke("list_mcp_tools", {}, context)).resolves.toMatchObject({
      tools: expect.arrayContaining([
        expect.objectContaining({ name: "future_tool", inputSchema: { type: "object" } }),
      ]),
    });
    await expect(invoke("list_mcp_resources", {}, context)).resolves.toMatchObject({
      resources: [{ uri: "metabase://docs/construct-query.md" }, { uri: "metabase://docs/second.md" }],
    });
    expect(calls.filter((call) => call.params?.cursor === "next")).toHaveLength(2);
    expect(executors["metabase.future_tool"]).toBeUndefined();
    expect(executors["metabase.call_tool"]).toBeUndefined();
  });

  it("reads documentation but refuses arbitrary URLs and Apps resources", async () => {
    const { context, calls } = fixture();
    await expect(
      invoke("read_mcp_resource", { uri: "metabase://docs/construct-query.md" }, context),
    ).resolves.toMatchObject({ contents: [{ text: "Query reference", mimeType: "text/markdown" }] });
    const before = calls.length;
    for (const uri of ["https://example.com", "ui://metabase/app.html", "metabase://databases"]) {
      await expect(metabaseMcpHandlers.read_mcp_resource!({ uri }, context)).rejects.toMatchObject({ status: 400 });
    }
    expect(calls).toHaveLength(before);
  });

  it("preserves per-resource partial failures without failing successful reads", async () => {
    const { context } = fixture();
    await expect(
      invoke("read_resource", { uris: ["metabase://databases", "metabase://question/99"] }, context),
    ).resolves.toMatchObject({
      resources: [{ content: [{ id: 1 }] }, { uri: "metabase://question/99", error: "Not found" }],
      output: "<resources/>",
    });
  });

  it("prefers structuredContent and preserves all raw blocks and metadata", async () => {
    const raw = {
      content: [
        { type: "text", text: "not JSON" },
        { type: "text", text: "more text" },
      ],
      structuredContent: execution,
      _meta: { trace: "test" },
    };
    const { context } = fixture(raw);
    await expect(invoke("execute_sql", { databaseId: 1, sql: "select 1" }, context)).resolves.toMatchObject({
      rows: [[1]],
      columns: [{ name: "count", displayName: "Count", baseType: "type/Integer" }],
      rowCount: 1,
      runningTime: 20,
      raw,
    });
  });

  it("falls back to JSON text when structuredContent is absent", async () => {
    const { context } = fixture({ content: [{ type: "text", text: JSON.stringify(execution) }] });
    await expect(invoke("execute_sql", { databaseId: 1, sql: "select 1" }, context)).resolves.toMatchObject({
      rows: [[1]],
    });
  });

  it.each([
    { content: [{ type: "text", text: "Access denied" }], isError: true },
    { content: [{ type: "text", text: "{}" }], structuredContent: { status: "failed", error: "SQL syntax error" } },
    { content: [{ type: "text", text: JSON.stringify({ status: "failed", error: "SQL syntax error" }) }] },
  ])("normalizes native tool and query failures to provider errors", async (result) => {
    const { context } = fixture(result);
    await expect(metabaseMcpHandlers.execute_sql!({ databaseId: 1, sql: "bad" }, context)).rejects.toMatchObject({
      status: 502,
      message: expect.stringMatching(/Access denied|SQL syntax error/),
    });
  });

  it.each([
    { content: [{ type: "text", text: "not JSON" }] },
    { content: [{ type: "text", text: "[]" }] },
    { content: [{ type: "text", text: "{}" }], structuredContent: {} },
    { content: [], structuredContent: { status: "completed" } },
    { content: [], structuredContent: { ...execution, data: { cols: [], rows: [1] } } },
    { content: [], structuredContent: { ...execution, data: { cols: [{ name: "x" }], rows: [] } } },
    { content: [], structuredContent: { ...execution, row_count: "one" } },
    { content: [], structuredContent: { ...execution, continuation_token: 1 } },
  ])("rejects malformed execution results rather than returning false success", async (result) => {
    const { context } = fixture(result);
    await expect(metabaseMcpHandlers.execute_sql!({ databaseId: 1, sql: "select 1" }, context)).rejects.toMatchObject({
      status: 502,
    });
  });

  it.each([
    "search_content",
    "read_resource",
    "construct_query",
    "construct_native_query",
    "create_question",
    "update_question",
    "create_metric",
    "update_metric",
    "create_dashboard",
    "update_dashboard",
    "create_collection",
  ])("validates required response fields for %s", async (name) => {
    const { context } = fixture({ content: [], structuredContent: {} });
    const input = mappingCases.find((item) => item.name === name)!.input;
    const handler = getProviderActionHandler(metabaseMcpHandlers, name)!;
    await expect(handler(input, context)).rejects.toMatchObject({ status: 502 });
  });

  it("supports fresh MBQL, handle execution, base64 execution, and continuation tokens without rewriting query internals", async () => {
    const { context, calls } = fixture();
    await invoke("query", { query }, context);
    await invoke("query", { continuationToken: "next-page" }, context);
    await invoke("execute_query", { query: "base64-payload" }, context);
    expect(calls.filter((call) => call.method === "tools/call").map((call) => call.params?.arguments)).toEqual([
      { query },
      { continuation_token: "next-page" },
      { query: "base64-payload" },
    ]);
    await expect(metabaseMcpHandlers.query!({ query, queryHandle: handle }, context)).rejects.toMatchObject({
      status: 400,
    });
    await expect(metabaseMcpHandlers.execute_query!({}, context)).rejects.toMatchObject({ status: 400 });
  });

  it("maps already-aborted requests and in-flight cancellation to 504", async () => {
    const { context } = fixture();
    await expect(
      metabaseMcpHandlers.list_mcp_tools!({}, { ...context, signal: AbortSignal.abort() }),
    ).rejects.toMatchObject({ status: 504 });
    const controller = new AbortController();
    const fetcher: typeof fetch = async (url, init) => {
      if (init?.method === "POST" && JSON.parse(String(init.body)).method === "tools/list") {
        controller.abort();
        return new Response(null, { status: 202 });
      }
      return context.fetcher(url, init);
    };
    await expect(
      metabaseMcpHandlers.list_mcp_tools!({}, { ...context, fetcher, signal: controller.signal }),
    ).rejects.toMatchObject({ status: 504 });
  });

  it("propagates cancellation into an in-flight native tool call", async () => {
    const { context } = fixture();
    const controller = new AbortController();
    let toolSignal: AbortSignal | null | undefined;
    const fetcher: typeof fetch = async (url, init) => {
      if (init?.method === "POST" && JSON.parse(String(init.body)).method === "tools/call") {
        toolSignal = init.signal;
        controller.abort(new Error("Caller disconnected"));
        return new Response(null, { status: 202 });
      }
      return context.fetcher(url, init);
    };
    await expect(
      metabaseMcpHandlers.execute_sql!(
        { databaseId: 1, sql: "select 1" },
        { ...context, fetcher, signal: controller.signal },
      ),
    ).rejects.toMatchObject({ status: 504 });
    expect(toolSignal?.aborted).toBe(true);
  });

  it("rejects malformed handles and saved-entity fields", async () => {
    const invalidHandle = fixture({ content: [], structuredContent: { query_handle: "not-a-uuid" } });
    await expect(metabaseMcpHandlers.construct_query!({ query }, invalidHandle.context)).rejects.toMatchObject({
      status: 502,
    });
    for (const body of [
      { ...createdCard, collection_id: undefined },
      { ...createdCard, description: 42 },
      { ...updatedCard, archived: "false" },
    ]) {
      const { context } = fixture({ content: [], structuredContent: body });
      const handler = "archived" in body ? metabaseMcpHandlers.update_question! : metabaseMcpHandlers.create_question!;
      await expect(handler({ id: 1, name: "Test", queryHandle: handle }, context)).rejects.toMatchObject({
        status: 502,
      });
    }
  });

  it("maps SDK request timeouts even before the outer deadline", async () => {
    const { context } = fixture();
    await expect(
      runMetabaseMcp(context, async () => {
        throw new SdkError(SdkErrorCode.RequestTimeout, "Request timed out");
      }),
    ).rejects.toMatchObject({ status: 504 });
  });

  it.each([401, 403, 429, 500])("maps HTTP %s without exposing upstream response secrets", async (status) => {
    const { context } = fixture();
    context.fetcher = async () => new Response("secret upstream detail", { status });
    await expect(metabaseMcpHandlers.list_mcp_tools!({}, context)).rejects.toMatchObject({
      status: status >= 500 ? 502 : status,
      message: expect.not.stringContaining("secret"),
    });
  });
});
