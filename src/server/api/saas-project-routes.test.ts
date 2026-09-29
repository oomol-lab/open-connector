import type { ProviderDefinition } from "../../core/types.ts";

import { afterEach, expect, it, vi } from "vitest";
import { createCatalogStore } from "../../catalog-store.ts";
import { ProviderLoader } from "../../providers/provider-loader.ts";
import { createConnectApp } from "../connect-app.ts";
import { TransitFileService } from "../files/transit-files.ts";
import { AesGcmSecretCodec } from "../secrets/secret-codec.ts";
import { SqliteRuntimeDatabase } from "../storage/sqlite/runtime-store.ts";

const provider: ProviderDefinition = {
  service: "example",
  displayName: "Example",
  categories: [],
  authTypes: ["oauth2"],
  actions: [],
  auth: [
    {
      type: "oauth2",
      authorizationUrl: "https://provider.example/auth",
      tokenUrl: "https://provider.example/token",
      scopes: [],
      tokenEndpointAuthMethod: "client_secret_post",
    },
  ],
};
const databases: SqliteRuntimeDatabase[] = [];
afterEach(() => {
  vi.unstubAllGlobals();
  for (const database of databases.splice(0)) database.close();
});
async function setup(configuredOrigin?: string) {
  const secretCodec = new AesGcmSecretCodec("storage-key");
  const database = new SqliteRuntimeDatabase(":memory:", { secretCodec });
  databases.push(database);
  const fetcher = vi.fn<typeof fetch>().mockImplementation(async () =>
    Response.json({
      success: true,
      data: {
        projectId: "project",
        providerConfigs: [
          {
            id: "config",
            service: "example",
            displayName: "Example",
            callbackUrl: "https://saas.example/callback",
            effectiveScopes: [],
            actionIds: [],
            proxyAvailable: true,
          },
        ],
      },
    }),
  );
  vi.stubGlobal("fetch", fetcher);
  const logger = { warn: vi.fn(), error: vi.fn(), info: vi.fn() };
  const { app } = await createConnectApp({
    logger,
    catalog: createCatalogStore([provider]),
    providerLoader: new ProviderLoader({}),
    runtimeDatabase: database,
    publicOrigin: "https://connect.example",
    configuredOrigin,
    secretCodec,
    adminToken: "admin",
    runtimeToken: "runtime",
    transitFiles: new TransitFileService({
      rootDir: ".tmp/saas-tests",
      publicOrigin: "https://connect.example",
      ttlSeconds: 60,
      maxBytes: 1024,
    }),
  });
  const call = (path: string, method = "GET", body?: unknown, token = "admin") =>
    app.request(path, {
      method,
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  return { call, fetcher, logger };
}
const projectPath = "/api/oauth/managed-project";
const input = { baseUrl: "https://saas.example", projectApiKey: "project-secret" };

it("exposes paired management routes with redacted state and default-source readback", async () => {
  const { call } = await setup("https://connect.example");
  expect((await call(projectPath, "PUT", input)).status).toBe(200);
  const read = await call(projectPath);
  expect(read.headers.get("cache-control")).toContain("no-store");
  const state = await read.json();
  expect(state).toMatchObject({
    configured: true,
    projectId: "project",
    status: "available",
    cleanup: { pending: 0, manual: 0, paused: false },
  });
  expect(JSON.stringify(state)).not.toContain("project-secret");
  expect((await call(`${projectPath}/provider-configs`)).status).toBe(200);
  expect((await call("/api/oauth/sources/example", "PUT", { mode: "saas", providerConfigId: "config" })).status).toBe(
    200,
  );
  expect(await (await call("/api/oauth/sources/example")).json()).toMatchObject({
    mode: "saas",
    projectId: "project",
    providerConfigId: "config",
  });
  expect((await call(projectPath, "DELETE")).status).toBe(409);
  expect((await call("/api/oauth/sources/example", "PUT", { mode: "local" })).status).toBe(200);
  expect((await call(projectPath, "DELETE")).status).toBe(200);
  expect(await (await call(projectPath)).json()).toMatchObject({ configured: false });
});

it("requires admin authentication before reading state or sending a project key", async () => {
  const { call, fetcher } = await setup("https://connect.example");
  for (const token of ["invalid", "runtime"]) {
    for (const path of [projectPath, `${projectPath}/provider-configs`, "/api/oauth/sources/example"]) {
      expect((await call(path, "GET", undefined, token)).status).toBe(401);
    }
    expect((await call(projectPath, "PUT", input, token)).status).toBe(401);
  }
  expect(fetcher).not.toHaveBeenCalled();
});

it("does not treat a runtime publicOrigin fallback as explicit SaaS configuration", async () => {
  const { call, fetcher } = await setup();
  const response = await call(projectPath, "PUT", input);
  expect(response.status).toBe(400);
  expect(await response.json()).toMatchObject({ error: { code: "oauth_source_configuration_error" } });
  expect(fetcher).not.toHaveBeenCalled();
});

it("rejects unknown configuration fields and maps upstream authorization failures safely", async () => {
  const { call, fetcher } = await setup("https://connect.example");
  expect((await call(projectPath, "PUT", { ...input, enabled: true })).status).toBe(400);
  expect(fetcher).not.toHaveBeenCalled();
  fetcher.mockImplementation(async () => new Response("sensitive upstream details", { status: 401 }));
  const response = await call(projectPath, "PUT", input);
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({
    error: {
      code: "oauth_source_unauthorized",
      message: "SaaS project key was rejected. Update the project configuration.",
    },
  });
});

it("projects SaaS setup inside oauthClient while preserving local configuration for Console", async () => {
  const { call, fetcher } = await setup("https://connect.example");
  const local = await (await call("/v1/providers/example/setup")).json();
  await call(projectPath, "PUT", input);
  await call("/api/oauth/sources/example", "PUT", { mode: "saas", providerConfigId: "config" });
  const setupResponse = await (await call("/v1/providers/example/setup")).json();
  expect(setupResponse.data.oauthClient).toEqual({
    configured: true,
    customClientAvailable: false,
    expectedRedirectUri: "https://saas.example/callback",
    missingFields: [],
  });
  expect(setupResponse.data).not.toHaveProperty("configured");
  expect(setupResponse.data).not.toHaveProperty("expectedRedirectUri");
  fetcher.mockClear();
  const configs = await (await call("/api/oauth/configs")).json();
  expect(configs[0]).toMatchObject({
    configured: false,
    customClientAvailable: false,
    oauthSource: { mode: "saas", providerConfigId: "config", projectId: "project" },
  });
  expect(fetcher).not.toHaveBeenCalled();
  await call("/api/oauth/sources/example", "PUT", { mode: "local" });
  expect(await (await call("/v1/providers/example/setup")).json()).toEqual(local);
});

it("logs safe diagnostics for failed SaaS configuration requests", async () => {
  const { call, fetcher, logger } = await setup("https://connect.example");
  fetcher.mockRejectedValue(new Error("authorization: project-secret private upstream details"));
  const response = await call(projectPath, "PUT", input);
  expect(response.status).toBe(502);
  const result = await response.json();
  expect(result.error.message).toContain("Check connectivity, proxy settings and TLS certificates");
  expect(logger.warn).toHaveBeenCalledWith(
    {
      method: "PUT",
      path: projectPath,
      code: "oauth_source_unavailable",
      status: 502,
      reason: result.error.message,
    },
    "SaaS request failed",
  );
  expect(JSON.stringify([result, logger.warn.mock.calls])).not.toContain("project-secret");
  expect(JSON.stringify(logger.warn.mock.calls)).not.toContain("private upstream details");
});
