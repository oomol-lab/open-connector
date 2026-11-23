import type { ProviderFetch } from "../provider-runtime.ts";

import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createCatalogStore } from "../../catalog-store.ts";
import { ConnectionService } from "../../connection-service.ts";
import { OAuthClientConfigService } from "../../oauth/oauth-client-config-service.ts";
import { OAuthFlowService } from "../../oauth/oauth-flow-service.ts";
import { SqliteRuntimeDatabase } from "../../server/storage/sqlite/runtime-store.ts";
import { ProviderLoader } from "../provider-loader.ts";
import { provider } from "./definition.ts";
import { executors } from "./executors.ts";
import { validateClosedloopAiCredential } from "./runtime.ts";

// Invented protocol and product records used only in these tests; no live workspace.
const accessToken = "test-only-access-value";
const actionNames = ["get_overview", "search_insights", "get_insight", "get_conversation"];
interface WireRequest {
  url: string;
  method: string;
  body: Record<string, any>;
  headers: Headers;
}
interface WireOptions {
  answer?: Record<string, unknown>;
  status?: number;
  missingTool?: string;
  repeatCursor?: boolean;
  cancel?: boolean;
}
function protocolFixture(options: WireOptions = {}) {
  const requests: WireRequest[] = [];
  const fetcher: ProviderFetch = async (url, init) => {
    const request = new Request(url, init);
    if (options.cancel && request.signal.aborted) throw request.signal.reason;
    const body: Record<string, any> =
      request.method !== "POST"
        ? {}
        : request.headers.get("content-type")?.includes("application/x-www-form-urlencoded")
          ? Object.fromEntries(new URLSearchParams(await request.text()))
          : ((await request.json()) as Record<string, any>);
    requests.push({ url: request.url, method: request.method, body, headers: request.headers });
    if (request.url.endsWith("/token"))
      return Response.json({
        access_token: accessToken,
        refresh_token: "test-only-refresh-value",
        token_type: "Bearer",
        scope: "mcp:read",
      });
    if (options.status) return Response.json({ error: "test_only_rejection" }, { status: options.status });
    if (request.method !== "POST") return new Response(null, { status: 405 });
    if (body.id === undefined) return new Response(null, { status: 202 });
    let result: unknown;
    if (body.method === "initialize")
      result = {
        protocolVersion: body.params.protocolVersion,
        capabilities: { tools: {} },
        serverInfo: { name: "test-only-protocol-fixture", version: "1.0.0" },
      };
    else if (body.method === "tools/list")
      result = {
        tools: actionNames
          .filter((name) => name !== options.missingTool)
          .map((name) => ({ name, inputSchema: { type: "object" } })),
        nextCursor: options.repeatCursor ? "test-only-repeated-cursor" : undefined,
      };
    else if (body.method === "tools/call")
      result = options.answer ?? {
        content: [{ type: "text", text: "test-only evidence warning" }],
        structuredContent: {
          source_complete: false,
          warning_codes: ["test-only-partial-source"],
          conversation: { id: "test-only-conversation-id", source: "gong" },
        },
      };
    else throw new Error("Unexpected fixture method: " + body.method);
    return Response.json({ jsonrpc: "2.0", id: body.id, result });
  };
  return { requests, fetcher };
}
const databases: SqliteRuntimeDatabase[] = [];
afterEach(() => {
  vi.unstubAllGlobals();
  for (const db of databases.splice(0)) db.close();
});
const credential = {
  authType: "oauth2" as const,
  accessToken,
  tokenType: "Bearer",
  profile: { accountId: "test-only-account", displayName: "Test-only fixture", grantedScopes: [] },
  metadata: {},
};
function context(signal?: AbortSignal) {
  return { getCredential: async () => credential, signal };
}

describe("ClosedLoop AI read-only provider through the real MCP SDK", () => {
  it.each([
    ["get_overview", { time_range: "7d" }],
    ["search_insights", { query: "test-only keyboard navigation", limit: 4, offset: 2 }],
    ["get_insight", { id: "test-only-insight-id" }],
    ["get_conversation", { id: "test-only-conversation-id", source: "gong" }],
  ])("executes %s once with the exact documented arguments", async (name, input) => {
    const wire = protocolFixture();
    vi.stubGlobal("fetch", wire.fetcher);
    const result = await executors[`closedloop_ai.${name}`]!(input, context());
    expect(result.ok).toBe(true);
    expect(result.output).toMatchObject({
      structuredContent: { source_complete: false, warning_codes: ["test-only-partial-source"] },
      content: [{ type: "text", text: "test-only evidence warning" }],
    });
    const calls = wire.requests.filter((r) => r.body.method === "tools/call");
    expect(calls).toHaveLength(1);
    expect(calls[0]!.body.params).toEqual({ name, arguments: input });
    expect(calls[0]!.headers.get("authorization")).toBe(`Bearer ${accessToken}`);
    expect(wire.requests.every((r) => r.url === "https://mcp.closedloop.sh/")).toBe(true);
  });
  it("preserves every text block, structured evidence, annotations and source warnings", async () => {
    const answer = {
      content: [
        { type: "text", text: "test-only first" },
        { type: "text", text: "test-only omitted source warning" },
      ],
      structuredContent: { source_complete: false },
      _meta: { "test-only-origin": "synthetic" },
    };
    vi.stubGlobal("fetch", protocolFixture({ answer }).fetcher);
    const result = await executors["closedloop_ai.get_insight"]!({ id: "test-only-id" }, context());
    expect(result).toEqual({ ok: true, output: answer });
  });
  it.each([401, 403, 429])("propagates HTTP%i through the shared SDK error path", async (status) => {
    const wire = protocolFixture({ status });
    vi.stubGlobal("fetch", wire.fetcher);
    const result = await executors["closedloop_ai.get_overview"]!({}, context());
    expect(result).toMatchObject({
      ok: false,
      error: { code: status === 429 ? "rate_limited" : "provider_error", details: { status } },
    });
    expect(JSON.stringify(result)).not.toContain(accessToken);
  });
  it.each([
    ["MCP error -32602: test-only missing id", "invalid_input"],
    ["test-only upstream failure", "provider_error"],
  ])("preserves factual MCP tool errors: %s", async (text, code) => {
    vi.stubGlobal("fetch", protocolFixture({ answer: { content: [{ type: "text", text }], isError: true } }).fetcher);
    await expect(executors["closedloop_ai.get_insight"]!({ id: "test-only-id" }, context())).resolves.toMatchObject({
      ok: false,
      error: { code },
    });
  });
  it("keeps cancellation from becoming a successful or retried action", async () => {
    const wire = protocolFixture({ cancel: true });
    vi.stubGlobal("fetch", wire.fetcher);
    const controller = new AbortController();
    controller.abort(new DOMException("test-only cancel", "AbortError"));
    const result = await executors["closedloop_ai.get_overview"]!({}, context(controller.signal));
    expect(result).toMatchObject({ ok: false });
    expect(wire.requests.filter((r) => r.body.method === "tools/call")).toHaveLength(0);
  });
  it("rejects missing OAuth credentials before any protocol request", async () => {
    const wire = protocolFixture();
    vi.stubGlobal("fetch", wire.fetcher);
    await expect(
      executors["closedloop_ai.get_overview"]!({}, { getCredential: async () => undefined }),
    ).resolves.toMatchObject({ ok: false, error: { code: "authorization_failed" } });
    expect(wire.requests).toHaveLength(0);
  });
});

describe("credential capability discovery without fabricated identity or grant scope", () => {
  it("discovers the four supported reads without calling a product-data or write tool", async () => {
    const wire = protocolFixture();
    const result = await validateClosedloopAiCredential(credential, { fetcher: wire.fetcher });
    expect(result?.profile).toBeUndefined();
    expect(result?.grantedScopes).toBeUndefined();
    expect(wire.requests.filter((r) => r.body.method === "tools/call")).toHaveLength(0);
  });
  it("rejects a server that no longer advertises a required action", async () => {
    await expect(
      validateClosedloopAiCredential(credential, { fetcher: protocolFixture({ missingTool: "get_insight" }).fetcher }),
    ).rejects.toMatchObject({ status: 502 });
  });
  it("rejects cyclic discovery through the existing shared pagination guard", async () => {
    await expect(
      validateClosedloopAiCredential(credential, { fetcher: protocolFixture({ repeatCursor: true }).fetcher }),
    ).rejects.toMatchObject({ status: 502, message: expect.stringContaining("repeated cursor") });
  });
});

it("uses the real OAuth flow for consumer PKCE and resource-bound token exchange, with no registration request", async () => {
  const wire = protocolFixture();
  vi.stubGlobal("fetch", wire.fetcher);
  const database = new SqliteRuntimeDatabase(":memory:");
  databases.push(database);
  const catalog = createCatalogStore([provider], { executableActionIds: Object.keys(executors) });
  const loader = new ProviderLoader({ closedloop_ai: () => import("./executors.ts") });
  const connections = new ConnectionService({ catalog, providerLoader: loader, store: database.connectionStore });
  const clientConfigs = new OAuthClientConfigService({
    catalog,
    origin: "https://test-only-runtime.example",
    store: database.oauthClientConfigStore,
  });
  await clientConfigs.upsertConfig({ service: "closedloop_ai", clientId: "test-only-public-client" });
  const flow = new OAuthFlowService({
    clientConfigs,
    connections,
    providerLoader: loader,
    states: database.oauthStateStore,
    requests: database.connectionRequestStore,
  });
  const started = await flow.startAuthorization({ service: "closedloop_ai" });
  const url = new URL(started.authorizationUrl);
  expect(url.origin + url.pathname).toBe("https://mcp.closedloop.sh/authorize");
  expect(url.searchParams.get("resource")).toBe("https://mcp.closedloop.sh");
  expect(url.searchParams.get("scope")).toBe("mcp:read");
  expect(url.searchParams.get("code_challenge_method")).toBe("S256");
  await flow.completeAuthorization({
    state: started.state,
    code: "test-only-code",
    callbackParameters: { iss: "https://mcp.closedloop.sh" },
  });
  const tokenCall = wire.requests.find((r) => r.url.endsWith("/token"))!;
  expect(tokenCall).toBeDefined();
  expect(tokenCall.body.resource).toBe("https://mcp.closedloop.sh");
  expect(tokenCall.body.client_id).toBe("test-only-public-client");
  expect(tokenCall.body.client_secret).toBeUndefined();
  expect(createHash("sha256").update(tokenCall.body.code_verifier).digest("base64url")).toBe(
    url.searchParams.get("code_challenge"),
  );
  expect(wire.requests.some((r) => r.url.endsWith("/register"))).toBe(false);
  expect(wire.requests.some((r) => r.body.method === "tools/call")).toBe(false);
  await expect(flow.completeAuthorization({ state: started.state, code: "test-only-code" })).rejects.toMatchObject({
    code: "invalid_oauth_state",
  });
});
