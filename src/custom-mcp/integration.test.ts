import type { ConnectApp } from "../server/connect-app.ts";
import type { CustomMcpRecord } from "./definition.ts";

import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createCatalogStore } from "../catalog-store.ts";
import { ProviderLoader } from "../providers/provider-loader.ts";
import { createConnectApp } from "../server/connect-app.ts";
import { TransitFileService } from "../server/files/transit-files.ts";
import { PlainTextSecretCodec } from "../server/secrets/secret-codec-core.ts";
import { RuntimeTokenService } from "../server/storage/runtime-token-service.ts";
import { SqliteRuntimeDatabase } from "../server/storage/sqlite/runtime-store.ts";

let database: SqliteRuntimeDatabase;
let apps: ConnectApp[];
let tools: { name: string; description: string; inputSchema: Record<string, unknown> }[];
let unavailable: boolean;
let toolCalls: { name: string; authorization: string | null }[];

async function createApp(builtinName?: string): Promise<ConnectApp> {
  const app = await createConnectApp({
    catalog: createCatalogStore(
      builtinName
        ? [
            {
              service: "builtin",
              displayName: builtinName,
              categories: [],
              authTypes: ["no_auth"],
              auth: [{ type: "no_auth" }],
              actions: [],
            },
          ]
        : [],
    ),
    providerLoader: new ProviderLoader({}),
    runtimeDatabase: database,
    transitFiles: new TransitFileService({
      rootDir: "/unused-custom-mcp-test",
      publicOrigin: "https://connector.example",
      ttlSeconds: 60,
      maxBytes: 1024,
    }),
    secretCodec: new PlainTextSecretCodec(),
    publicOrigin: "https://connector.example",
    adminToken: "admin",
    runtimeToken: "runtime",
    serveDocumentation: false,
  });
  apps.push(app);
  return app;
}

beforeEach(() => {
  database = new SqliteRuntimeDatabase(":memory:");
  apps = [];
  unavailable = false;
  toolCalls = [];
  tools = [
    {
      name: "find_items",
      description: "Find inventory items",
      inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
    },
  ];
  vi.stubGlobal("fetch", async (url: string | URL | Request, init?: RequestInit) => {
    expect(String(url)).toBe("https://mcp.example.com/mcp");
    if (unavailable) return new Response("upstream failure including secret", { status: 503 });
    if (!init?.body) return new Response(null, { status: 405 });
    const request = JSON.parse(String(init.body));
    if (request.id === undefined) return new Response(null, { status: 202 });
    let result;
    if (request.method === "initialize")
      result = {
        protocolVersion: request.params.protocolVersion,
        serverInfo: { name: "fixture", version: "1" },
        capabilities: { tools: {} },
      };
    else if (request.method === "tools/list") result = { tools };
    else if (request.method === "tools/call") {
      toolCalls.push({ name: request.params.name, authorization: new Headers(init.headers).get("authorization") });
      result = {
        content: [{ type: "text", text: request.params.arguments.query }],
        structuredContent: { query: request.params.arguments.query },
      };
    } else throw new Error(`Unexpected method ${request.method}`);
    return Response.json({ jsonrpc: "2.0", id: request.id, result });
  });
});
afterEach(async () => {
  for (const app of apps) {
    await app.triggerMaintenance.close();
    await app.saasCleanup.close();
  }
  database.close();
  vi.unstubAllGlobals();
});

async function request(
  app: ConnectApp,
  path: string,
  method = "GET",
  body?: unknown,
  token = "admin",
  headers?: Record<string, string>,
): Promise<Response> {
  return app.app.request(path, {
    method,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
async function add(app: ConnectApp, auth: unknown = { type: "none" }): Promise<CustomMcpRecord> {
  const response = await request(app, "/api/custom-mcp", "POST", {
    displayName: "Inventory MCP",
    endpoint: "https://mcp.example.com/mcp",
    auth,
  });
  const record = await response.json();
  expect(response.status, JSON.stringify(record)).toBe(201);
  return record;
}

it("discovers tools, refreshes another instance, searches and executes ordinary actions", async () => {
  const app = await createApp();
  const other = await createApp();
  for (const path of ["/api/actions", "/api/providers?locale=en"]) {
    expect((await request(app, path)).headers.get("cloudflare-cdn-cache-control")).toBe("no-store");
  }
  const record = await add(app);
  expect(record.syncError).toBeUndefined();
  expect(record.actions).toHaveLength(1);
  const search = await request(other, "/v1/actions/search?q=inventory", "GET", undefined, "runtime");
  expect(await search.json()).toMatchObject({
    data: [{ id: `${record.service}.find_items`, inputSchema: { required: ["query"] } }],
  });
  const list = await request(other, "/api/providers");
  expect(list.headers.get("cloudflare-cdn-cache-control")).toBe("no-store");
  const provider = (await list.json())[0];
  expect(provider.actions[0]).not.toHaveProperty("inputSchema");
  const result = await request(
    other,
    `/v1/actions/${record.service}.find_items`,
    "POST",
    { input: { query: "books" } },
    "runtime",
  );
  expect(result.status).toBe(200);
  expect(toolCalls).toEqual([{ name: "find_items", authorization: null }]);
  const invalid = await request(other, `/v1/actions/${record.service}.find_items`, "POST", { input: {} }, "runtime");
  expect(invalid.status).toBe(400);
  expect(toolCalls).toHaveLength(1);
  tools = [];
  await request(app, `/api/custom-mcp/${record.service}/sync`, "POST", {});
  expect(
    await (await request(other, "/v1/actions/search?q=inventory", "GET", undefined, "runtime")).json(),
  ).toMatchObject({ data: [] });
  expect(
    (await request(other, `/v1/actions/${record.service}.find_items`, "POST", { input: { query: "books" } }, "runtime"))
      .status,
  ).toBe(404);
  await request(app, `/api/custom-mcp/${record.service}`, "DELETE");
  expect((await request(other, "/api/actions")).headers.get("cloudflare-cdn-cache-control")).toBe("no-store");
});

it("uses the selected connection and enforces connection grants without falling back to the sync credential", async () => {
  const app = await createApp();
  const record = await add(app, { type: "headers", headers: [{ name: "Authorization", prefix: "Bearer " }] });
  const first = await request(app, `/api/connections/${record.service}`, "PUT", {
    authType: "custom_credential",
    connectionName: "first",
    values: { Authorization: "first-secret" },
  });
  expect(first.status).toBe(200);
  const firstConnection = await first.json();
  const second = await request(app, `/api/connections/${record.service}`, "PUT", {
    authType: "custom_credential",
    connectionName: "second",
    values: { Authorization: "second-secret" },
  });
  const secondConnection = await second.json();
  const token = await new RuntimeTokenService(database.runtimeTokenStore).createToken("Second only", {
    allowedActions: [`${record.service}.*`],
    blockedActions: [],
    allowedProxies: [],
    allowedConnections: [secondConnection.id],
  });
  const path = `/v1/actions/${record.service}.find_items`;
  expect(
    (
      await request(app, path, "POST", { input: { query: "books" } }, token.token, {
        "x-oo-connector-app-id": firstConnection.id,
      })
    ).status,
  ).toBe(403);
  expect(toolCalls).toHaveLength(0);
  expect(
    (
      await request(app, path, "POST", { input: { query: "books" } }, token.token, {
        "x-oo-connector-app-id": secondConnection.id,
      })
    ).status,
  ).toBe(200);
  expect(toolCalls[0].authorization).toBe("Bearer second-secret");
  expect((await request(app, `/api/custom-mcp/${record.service}`, "DELETE")).status).toBe(409);
});

it("retains published tools after failed sync and removes them when disabled", async () => {
  const app = await createApp();
  const record = await add(app);
  unavailable = true;
  const failed = await (await request(app, `/api/custom-mcp/${record.service}/sync`, "POST", {})).json();
  expect(failed.actions).toHaveLength(1);
  expect(failed.syncedAt).toBe(record.syncedAt);
  expect(failed.syncError).not.toContain("secret");
  await request(app, `/api/custom-mcp/${record.service}`, "PATCH", { displayName: record.displayName, enabled: false });
  expect(
    await (await request(app, "/v1/actions/search?q=inventory", "GET", undefined, "runtime")).json(),
  ).toMatchObject({ data: [] });
});

it("rejects duplicate names, runtime administration and private addresses", async () => {
  const app = await createApp();
  await add(app);
  expect(
    (
      await request(app, "/api/custom-mcp", "POST", {
        displayName: "inventory mcp",
        endpoint: "https://mcp.example.com/mcp",
        auth: { type: "none" },
      })
    ).status,
  ).toBe(409);
  expect((await request(app, "/api/custom-mcp", "GET", undefined, "runtime")).status).toBe(401);
  expect(
    (
      await request(app, "/api/custom-mcp", "POST", {
        displayName: "Private",
        endpoint: "http://127.0.0.1/mcp",
        auth: { type: "none" },
      })
    ).status,
  ).toBe(400);
});

it("discovers OAuth, registers once, binds consent and refresh to the resource, and preserves a connection after failed tool discovery", async () => {
  const app = await createApp();
  const mcpFetch = globalThis.fetch;
  const exchanges: URLSearchParams[] = [];
  let registrations = 0;
  let failTools = true;
  vi.stubGlobal("fetch", async (url: string | URL | Request, init?: RequestInit) => {
    const address = String(url);
    if (address === "https://mcp.example.com/mcp" && (!init?.method || init.method === "GET"))
      return new Response(null, {
        status: 401,
        headers: { "www-authenticate": 'Bearer resource_metadata="https://mcp.example.com/resource", scope="read"' },
      });
    if (address === "https://mcp.example.com/resource")
      return Response.json({
        resource: "https://mcp.example.com/mcp",
        authorization_servers: ["https://auth.example.com"],
      });
    if (address === "https://auth.example.com/.well-known/oauth-authorization-server")
      return Response.json({
        issuer: "https://auth.example.com",
        authorization_endpoint: "https://auth.example.com/authorize",
        token_endpoint: "https://auth.example.com/token",
        registration_endpoint: "https://auth.example.com/register",
        response_types_supported: ["code"],
        code_challenge_methods_supported: ["S256"],
        token_endpoint_auth_methods_supported: ["none"],
        authorization_response_iss_parameter_supported: true,
      });
    if (address === "https://auth.example.com/register") {
      registrations++;
      const metadata = JSON.parse(String(init?.body));
      expect(metadata.redirect_uris).toEqual(["https://connector.example/oauth/callback"]);
      return Response.json({ ...metadata, client_id: "registered-client" }, { status: 201 });
    }
    if (address === "https://auth.example.com/token") {
      const fields = new URLSearchParams(String(init?.body));
      exchanges.push(fields);
      expect(fields.get("resource")).toBe("https://mcp.example.com/mcp");
      return Response.json({
        access_token: "oauth-token",
        token_type: "Bearer",
        expires_in: 3600,
        refresh_token: "refresh-token",
      });
    }
    if (failTools) return new Response("tools temporarily unavailable", { status: 503 });
    return mcpFetch(url, init);
  });
  const record = await add(app, { type: "oauth2" });
  expect(record.auth.type).toBe("oauth2");
  expect(registrations).toBe(1);
  const start = await request(app, "/api/oauth/authorizations", "POST", { service: record.service });
  const pending = await start.json();
  expect(start.status, JSON.stringify(pending)).toBe(200);
  const authorize = new URL(pending.authorizationUrl);
  expect(authorize.searchParams.get("resource")).toBe(record.endpoint);
  expect(authorize.searchParams.get("code_challenge_method")).toBe("S256");
  const callback = await request(
    app,
    `/oauth/callback?state=${pending.state}&code=code&iss=${encodeURIComponent("https://auth.example.com")}`,
  );
  expect(callback.status).toBe(200);
  expect(exchanges[0].get("code_verifier")).toBeTruthy();
  const connection = (await database.connectionStore.list())[0];
  expect(connection.service).toBe(record.service);
  expect((await database.customMcpStore.list())[0].syncError).toBeTruthy();
  failTools = false;
  if (connection.source === "saas" || connection.credential.authType !== "oauth2")
    throw new Error("Expected OAuth connection");
  await database.connectionStore.set(record.service, connection.connectionName, {
    ...connection.credential,
    expiresAt: new Date(0).toISOString(),
  });
  const sync = await request(app, `/api/custom-mcp/${record.service}/sync`, "POST", { connectionId: connection.id });
  expect((await sync.json()).syncError).toBeUndefined();
  expect(exchanges[1].get("grant_type")).toBe("refresh_token");
  expect(registrations).toBe(1);
  const rejected = await (
    await request(app, "/api/oauth/authorizations", "POST", { service: record.service, connectionName: "other" })
  ).json();
  const wrongIssuer = await request(
    app,
    `/oauth/callback?state=${rejected.state}&code=code&iss=${encodeURIComponent("https://other.example.com")}`,
  );
  expect(wrongIssuer.status).toBe(400);
  expect(exchanges).toHaveLength(2);
  const missing = await (
    await request(app, "/api/oauth/authorizations", "POST", { service: record.service, connectionName: "missing" })
  ).json();
  expect((await request(app, `/oauth/callback?state=${missing.state}&code=code`)).status).toBe(400);
  expect(exchanges).toHaveLength(2);
  const refused = await (
    await request(app, "/api/oauth/authorizations", "POST", { service: record.service, connectionName: "refused" })
  ).json();
  const refusedResponse = await request(
    app,
    `/oauth/callback?state=${refused.state}&error=access_denied&iss=${encodeURIComponent("https://other.example.com")}`,
  );
  expect(refusedResponse.status).toBe(400);
  expect(await refusedResponse.json()).toMatchObject({ error: { code: "invalid_oauth_issuer" } });
});

it("rejects names already used by built-in providers on creation and rename", async () => {
  const app = await createApp("Existing provider");
  const collision = await request(app, "/api/custom-mcp", "POST", {
    displayName: " EXISTING PROVIDER ",
    endpoint: "https://mcp.example.com/mcp",
    auth: { type: "none" },
  });
  expect(collision.status).toBe(409);
  const record = await add(app);
  expect(
    (
      await request(app, `/api/custom-mcp/${record.service}`, "PATCH", {
        displayName: "existing provider",
        enabled: true,
      })
    ).status,
  ).toBe(409);
  expect((await database.customMcpStore.list())[0].displayName).toBe(record.displayName);
});

it("keeps the published snapshot when a server returns duplicate tool names", async () => {
  const app = await createApp();
  const record = await add(app);
  tools.push({ ...tools[0] });
  const result = await (await request(app, `/api/custom-mcp/${record.service}/sync`, "POST", {})).json();
  expect(result.syncError).toBeTruthy();
  expect(result.actions).toEqual(record.actions);
});

it("uses a readable service identifier and keeps it stable after renaming", async () => {
  const app = await createApp();
  const record = await add(app);
  expect(record.service).toBe("inventory_mcp");
  const created = await request(app, "/api/custom-mcp", "POST", {
    service: "company_docs",
    displayName: "公司知识库",
    endpoint: "https://mcp.example.com/mcp",
    auth: { type: "none" },
  });
  expect(created.status).toBe(201);
  expect((await created.json()).service).toBe("company_docs");
  await request(app, "/api/custom-mcp/company_docs", "PATCH", {
    displayName: "Renamed",
    enabled: true,
    service: "changed",
  });
  const found = await (await request(app, "/v1/actions/search?q=company_docs", "GET", undefined, "runtime")).json();
  expect(found.data).toHaveLength(1);
  expect(found.data[0]).toMatchObject({ id: "company_docs.find_items", description: "Find inventory items" });
  expect((await database.customMcpStore.list()).find((entry) => entry.displayName === "Renamed")?.service).toBe(
    "company_docs",
  );
});

it("rejects conflicting or invalid service identifiers", async () => {
  const app = await createApp("Built-in provider");
  await add(app);
  for (const service of ["builtin", "inventory_mcp"]) {
    const response = await request(app, "/api/custom-mcp", "POST", {
      service,
      displayName: "Different name",
      endpoint: "https://mcp.example.com/mcp",
      auth: { type: "none" },
    });
    expect(response.status).toBe(409);
  }
  for (const service of ["", "Uppercase", "with.dot", "with/slash", "a".repeat(101), undefined]) {
    const response = await request(app, "/api/custom-mcp", "POST", {
      service,
      displayName: "知识库",
      endpoint: "https://mcp.example.com/mcp",
      auth: { type: "none" },
    });
    expect(response.status).toBe(400);
  }
});

it("validates authentication setup before publishing a provider", async () => {
  const app = await createApp();
  const manual = {
    issuer: "https://auth.example.com",
    authorizationUrl: "https://auth.example.com/authorize",
    tokenUrl: "https://auth.example.com/token",
    tokenEndpointAuthMethod: "client_secret_post",
  };
  for (const auth of [
    { type: "headers", headers: [{ name: "Host" }] },
    { type: "headers", headers: [{ name: "Authorization" }, { name: "authorization" }] },
    { type: "headers", headers: [{ name: "Authorization", prefix: "Bearer \r\n" }] },
    { type: "oauth2", manual },
    { type: "oauth2", manual, client: { clientId: "client" } },
  ]) {
    const response = await request(app, "/api/custom-mcp", "POST", {
      displayName: "Invalid auth",
      endpoint: "https://mcp.example.com/mcp",
      auth,
    });
    expect(response.status).toBe(400);
  }
  expect(await database.customMcpStore.list()).toEqual([]);
  const record = await add(app, { type: "oauth2", manual, client: { clientId: "client", clientSecret: "secret" } });
  expect(record.auth).toMatchObject({
    type: "oauth2",
    definition: { ...manual, resource: record.endpoint, pkce: { method: "S256" } },
  });
  const response = await request(app, `/api/custom-mcp/${record.service}`);
  expect(await response.text()).not.toContain('"secret"');
});
