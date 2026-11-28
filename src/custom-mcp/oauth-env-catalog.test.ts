import type { ConnectApp } from "../server/connect-app.ts";

import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createCatalogStore } from "../catalog-store.ts";
import { ProviderLoader } from "../providers/provider-loader.ts";
import { createConnectApp } from "../server/connect-app.ts";
import { TransitFileService } from "../server/files/transit-files.ts";
import { PlainTextSecretCodec } from "../server/secrets/secret-codec-core.ts";
import { SqliteRuntimeDatabase } from "../server/storage/sqlite/runtime-store.ts";

let database: SqliteRuntimeDatabase;
let secretCodec: PlainTextSecretCodec;
let apps: ConnectApp[];

async function createApp(oauthClientEnvironment?: object): Promise<ConnectApp> {
  const app = await createConnectApp({
    catalog: createCatalogStore([]),
    providerLoader: new ProviderLoader({}),
    runtimeDatabase: database,
    transitFiles: new TransitFileService({
      rootDir: "/unused-custom-mcp-test",
      publicOrigin: "https://connector.example",
      ttlSeconds: 60,
      maxBytes: 1024,
    }),
    secretCodec,
    publicOrigin: "https://connector.example",
    adminToken: "admin",
    runtimeToken: "runtime",
    serveDocumentation: false,
    oauthClientEnvironment,
  });
  apps.push(app);
  return app;
}

beforeEach(() => {
  secretCodec = new PlainTextSecretCodec();
  database = new SqliteRuntimeDatabase(":memory:", { secretCodec });
  apps = [];
  vi.stubGlobal("fetch", async (url: string | URL | Request, init?: RequestInit) => {
    expect(String(url)).toBe("https://mcp.example.com/mcp");
    if (!init?.body) return new Response(null, { status: 405 });
    const request = JSON.parse(String(init.body));
    if (request.id === undefined) return new Response(null, { status: 202 });
    const result =
      request.method === "initialize"
        ? {
            protocolVersion: request.params.protocolVersion,
            serverInfo: { name: "fixture", version: "1" },
            capabilities: { tools: {} },
          }
        : { tools: [] };
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

it("does not let OAUTH_ variables configure a stored custom MCP server", async () => {
  const first = await createApp();
  const created = await first.app.request("/api/custom-mcp", {
    method: "POST",
    headers: { "authorization": "Bearer admin", "content-type": "application/json" },
    body: JSON.stringify({
      service: "custom_oauth",
      displayName: "Custom OAuth",
      endpoint: "https://mcp.example.com/mcp",
      auth: {
        type: "oauth2",
        client: { clientId: "own-client", clientSecret: "own-secret" },
        manual: {
          issuer: "https://auth.example.com",
          authorizationUrl: "https://auth.example.com/authorize",
          tokenUrl: "https://auth.example.com/token",
          tokenEndpointAuthMethod: "client_secret_post",
        },
      },
    }),
  });
  expect(created.status).toBe(201);

  await expect(
    createApp({ OAUTH_CUSTOM_OAUTH_CLIENT_ID: "env-client", OAUTH_CUSTOM_OAUTH_CLIENT_SECRET: "env-secret" }),
  ).rejects.toThrow("OAUTH_CUSTOM_OAUTH_CLIENT_ID names no provider");
});
