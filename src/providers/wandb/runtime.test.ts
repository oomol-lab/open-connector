import { afterEach, describe, expect, it, vi } from "vitest";
import { ProviderRequestError } from "../provider-runtime.ts";
import {
  callWandbMcpTool,
  createWandbMcpContext,
  normalizeWandbMcpEndpoint,
  validateWandbMcpCredential,
  wandbMcpTools,
} from "./runtime.ts";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("W&B MCP endpoint", () => {
  it("uses the hosted endpoint by default", () => {
    expect(normalizeWandbMcpEndpoint(undefined).toString()).toBe("https://mcp.withwandb.com/mcp");
    expect(normalizeWandbMcpEndpoint("   ").toString()).toBe("https://mcp.withwandb.com/mcp");
  });

  it("preserves a custom full endpoint path and removes URL metadata", () => {
    expect(normalizeWandbMcpEndpoint("https://wandb.example.com/custom/mcp/?tenant=one#section").toString()).toBe(
      "https://wandb.example.com/custom/mcp/",
    );
  });

  it("rejects embedded credentials and unsafe HTTP endpoints", () => {
    expect(() => normalizeWandbMcpEndpoint("https://user:pass@wandb.example.com/mcp")).toThrow(
      "must not include username or password",
    );
    expect(() => normalizeWandbMcpEndpoint("http://wandb.example.com/mcp")).toThrow("require private-network access");
    expect(() => normalizeWandbMcpEndpoint("http://10.0.0.8/mcp")).toThrow("private or reserved IP addresses");
    expect(normalizeWandbMcpEndpoint("http://10.0.0.8/mcp", true).toString()).toBe("http://10.0.0.8/mcp");
  });
});

describe("W&B MCP runtime", () => {
  it("validates a feature-gated tool subset with Bearer auth and Worker-safe schemas", async () => {
    const requests: CapturedRequest[] = [];
    const fetcher = createStreamableMcpFetch({
      tools: [wandbMcpTools.list_entities, wandbMcpTools.query_wandb],
      requests,
    });

    // Warm the SDK's Node-only validation path so the assertion isolates tool schema validation.
    await validateWandbMcpCredential("secret-key", {}, fetcher);
    vi.stubGlobal("Function", function disabledFunctionConstructor() {
      throw new EvalError("Code generation from strings disallowed for this context");
    });

    const result = await validateWandbMcpCredential("secret-key", {}, fetcher);

    expect(result.metadata).toMatchObject({
      mcpEndpoint: "https://mcp.withwandb.com/mcp",
      discoveredToolCount: 2,
      availableActions: ["query_wandb", "list_entities"],
    });
    expect(requests.every((request) => request.url === "https://mcp.withwandb.com/mcp")).toBe(true);
    expect(requests.every((request) => request.authorization === "Bearer secret-key")).toBe(true);
  });

  it("rejects endpoints that expose no supported W&B tools", async () => {
    const fetcher = createStreamableMcpFetch({ tools: ["unrelated_tool"] });

    await expect(validateWandbMcpCredential("secret-key", {}, fetcher)).rejects.toMatchObject({
      status: 502,
      message: "W&B MCP endpoint did not expose any supported tools",
    });
  });

  it.each([
    [401, 401],
    [403, 401],
    [404, 400],
    [429, 429],
    [500, 502],
  ])("maps MCP HTTP status %i to provider status %i", async (upstreamStatus, providerStatus) => {
    const fetcher = vi.fn(async () => new Response("request failed", { status: upstreamStatus })) as typeof fetch;

    await expect(validateWandbMcpCredential("secret-key", {}, fetcher)).rejects.toMatchObject({
      status: providerStatus,
    });
  });

  it("maps local actions to the official W&B MCP tool names", () => {
    expect(wandbMcpTools).toMatchObject({
      query_wandb: "query_wandb_tool",
      create_report: "create_wandb_report_tool",
      log_analysis: "log_analysis_to_wandb",
      list_projects: "query_wandb_entity_projects",
      probe_project: "probe_project_tool",
    });
    expect(Object.keys(wandbMcpTools)).toHaveLength(22);
  });

  it("parses JSON text tool results", async () => {
    const requests: CapturedRequest[] = [];
    const fetcher = createStreamableMcpFetch({
      tools: [wandbMcpTools.list_entities],
      callResult: { content: [{ type: "text", text: '{"entities":[{"name":"team"}]}' }] },
      requests,
    });
    const context = createWandbMcpContext("secret-key", { mcpEndpoint: "https://wandb.example.com/api/mcp" }, fetcher);

    await expect(callWandbMcpTool(context, wandbMcpTools.list_entities, {})).resolves.toEqual({
      entities: [{ name: "team" }],
    });
    expect(requests.find((request) => request.method === "tools/call")?.params).toEqual({
      name: "list_entities_tool",
      arguments: {},
    });
  });

  it("returns plain text and structured tool results", async () => {
    const plainContext = createWandbMcpContext(
      "key",
      {},
      createStreamableMcpFetch({
        tools: [wandbMcpTools.search_docs],
        callResult: { content: [{ type: "text", text: "W&B documentation result" }] },
      }),
    );
    await expect(callWandbMcpTool(plainContext, wandbMcpTools.search_docs, { query: "runs" })).resolves.toBe(
      "W&B documentation result",
    );

    const structuredContext = createWandbMcpContext(
      "key",
      {},
      createStreamableMcpFetch({
        tools: [wandbMcpTools.query_wandb],
        callResult: {
          content: [{ type: "text", text: "fallback" }],
          structuredContent: { data: { project: "demo" } },
        },
      }),
    );
    await expect(callWandbMcpTool(structuredContext, wandbMcpTools.query_wandb, { query: "query" })).resolves.toEqual({
      data: { project: "demo" },
    });
  });

  it("turns MCP tool errors into provider errors", async () => {
    const context = createWandbMcpContext(
      "key",
      {},
      createStreamableMcpFetch({
        tools: [wandbMcpTools.query_wandb],
        callResult: { isError: true, content: [{ type: "text", text: "query rejected" }] },
      }),
    );

    await expect(callWandbMcpTool(context, wandbMcpTools.query_wandb, { query: "mutation" })).rejects.toEqual(
      expect.objectContaining<Partial<ProviderRequestError>>({
        status: 502,
        message: "W&B MCP tool query_wandb_tool returned an error: query rejected",
      }),
    );
  });
});

interface CapturedRequest {
  url: string;
  authorization: string | null;
  method: string;
  params?: unknown;
}

interface MockMcpOptions {
  tools: string[];
  callResult?: Record<string, unknown>;
  requests?: CapturedRequest[];
}

function createStreamableMcpFetch(options: MockMcpOptions): typeof fetch {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = readRequest(init);
    const headers = new Headers(init?.headers);
    options.requests?.push({
      url: input instanceof Request ? input.url : input.toString(),
      authorization: headers.get("authorization"),
      method: typeof request.method === "string" ? request.method : (init?.method ?? "GET"),
      params: request.params,
    });

    if (!Object.hasOwn(request, "id")) {
      return new Response(null, { status: 202 });
    }

    const result =
      request.method === "initialize"
        ? {
            protocolVersion: "2025-03-26",
            capabilities: {},
            serverInfo: { name: "wandb-mcp-server", version: "0.3.7" },
          }
        : request.method === "tools/list"
          ? {
              tools: options.tools.map((name) => ({
                name,
                inputSchema: { type: "object" },
                outputSchema: { type: "object" },
              })),
            }
          : (options.callResult ?? { content: [] });

    return new Response(JSON.stringify({ jsonrpc: "2.0", id: request.id, result }), {
      headers: {
        "content-type": "application/json",
        "mcp-session-id": "wandb-test-session",
      },
    });
  }) as typeof fetch;
}

function readRequest(init?: RequestInit): Record<string, unknown> {
  return typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : {};
}
