import type { ProviderDefinition } from "../../core/types.ts";
import type { SaasConnectionRequest } from "../../saas/saas-client.ts";

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
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  for (const db of databases.splice(0)) db.close();
});
interface CallOptions {
  method?: string;
  body?: unknown;
  token?: string | null;
  cookie?: string;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}
async function setup(adminToken: string | undefined = "admin") {
  let now = Date.now();
  vi.spyOn(Date, "now").mockImplementation(() => now);
  const secretCodec = new AesGcmSecretCodec("key");
  const database = new SqliteRuntimeDatabase(":memory:", { secretCodec });
  databases.push(database);
  const remote = new Map<string, SaasConnectionRequest>();
  const calls: { path: string; method: string; body?: Record<string, string> }[] = [];
  const behavior: {
    failLink?: boolean;
    getFailure?: number;
    getWait?: Promise<void>;
    mismatch?: boolean;
    secretSummary?: boolean;
  } = {};
  const ok = (data: unknown) => Response.json({ success: true, data });
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>().mockImplementation(async (url, init) => {
      const path = new URL(String(url)).pathname;
      const method = init?.method ?? "GET";
      const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, string>) : undefined;
      calls.push({ path, method, body });
      if (path.endsWith("/oauth/provider-configs"))
        return ok({
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
        });
      if (path.endsWith("/connected-accounts/link")) {
        if (behavior.failLink) throw new Error("private upstream error");
        const id = crypto.randomUUID();
        const value: SaasConnectionRequest = {
          id,
          projectId: "project",
          providerConfigId: body!.providerConfigId,
          externalUserId: body!.userId,
          service: "example",
          alias: body!.alias,
          status: "connected",
          authorizationUrl: `https://saas.example/v1/saas/connection-requests/${id}/authorize`,
          connectedAccountId: `account-${id}`,
          errorCode: null,
          errorMessage: null,
          expiresAt: new Date(now + 600_000).toISOString(),
          createdAt: now,
          updatedAt: now,
        };
        remote.set(id, value);
        return ok(value);
      }
      if (path.includes("/connection-requests/")) {
        await behavior.getWait;
        if (behavior.getFailure)
          return new Response("private upstream error", {
            status: behavior.getFailure,
            headers: { "retry-after": "7" },
          });
        const value = remote.get(path.split("/").at(-1)!)!;
        return ok(behavior.mismatch ? { ...value, externalUserId: "other-user" } : value);
      }
      if (path.includes("/connected-accounts/")) {
        const value = [...remote.values()].find((item) => path.endsWith(item.connectedAccountId!))!;
        const account = {
          projectId: value.projectId,
          providerConfigId: value.providerConfigId,
          service: value.service,
          externalUserId: value.externalUserId,
          connectedAccountId: value.connectedAccountId,
          alias: value.alias,
          status: "active",
          providerAccountId: "provider-user",
          accountLabel: "User",
          scopes: [],
        };
        return ok(behavior.secretSummary ? { ...account, accessToken: "secret" } : account);
      }
      throw new Error(`Unexpected request: ${path}`);
    }),
  );
  const options = {
    catalog: createCatalogStore([provider]),
    providerLoader: new ProviderLoader({}),
    runtimeDatabase: database,
    publicOrigin: "https://connect.example",
    configuredOrigin: "https://connect.example",
    secretCodec,
    adminToken,
    transitFiles: new TransitFileService({
      rootDir: ".tmp/saas-oauth-tests",
      publicOrigin: "https://connect.example",
      ttlSeconds: 60,
      maxBytes: 1024,
    }),
  };
  let { app } = await createConnectApp(options);
  const call = (path: string, input: CallOptions = {}) => {
    const token = input.token === undefined ? adminToken : input.token;
    const headers = new Headers({ "content-type": "application/json", ...input.headers });
    if (token) headers.set("authorization", `Bearer ${token}`);
    if (input.cookie) headers.set("cookie", input.cookie);
    return app.request(`https://connect.example${path}`, {
      method: input.method ?? "GET",
      headers,
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: input.signal,
    });
  };
  expect(
    (
      await call("/api/oauth/managed-project", {
        method: "PUT",
        body: { baseUrl: "https://saas.example", projectApiKey: "project-key" },
      })
    ).status,
  ).toBe(200);
  expect(
    (await call("/api/oauth/sources/example", { method: "PUT", body: { mode: "saas", providerConfigId: "config" } }))
      .status,
  ).toBe(200);
  calls.length = 0;
  const start = async (
    path = "/v1/connections/example/connect",
    body: unknown = { returnUri: "oomol://connect/done?keep=yes" },
  ) => {
    const response = await call(path, { method: "POST", body });
    const json = await response.json();
    return { response, data: json.data, cookie: response.headers.get("set-cookie")?.split(";")[0] };
  };
  return {
    database,
    call,
    calls,
    remote,
    behavior,
    start,
    tick: (ms: number) => {
      now += ms;
    },
    restart: async () => {
      ({ app } = await createConnectApp(options));
    },
  };
}

it("starts remotely without a local client config, keeps cookie GET read-only, and commits by admin bearer", async () => {
  const env = await setup();
  const { response, data, cookie } = await env.start();
  expect(response.status).toBe(200);
  expect(env.calls.find((call) => call.method === "POST")?.body).toMatchObject({
    providerConfigId: "config",
    alias: `connect-${data.connectionRequestId}`,
    returnUri: `https://connect.example/oauth/saas/complete?request=${data.connectionRequestId}`,
  });
  expect(JSON.stringify(env.calls)).not.toContain("oomol://");
  const before = env.calls.length;
  const page = await env.call(`/oauth/saas/complete?request=${data.connectionRequestId}&status=success`, {
    token: null,
  });
  expect(page.status).toBe(200);
  expect(page.headers.get("cache-control")).toBe("private, no-store");
  expect(await page.text()).not.toContain("oomol://connect/done");
  env.tick(660_000);
  const readonly = await env.call(`/v1/connection-requests/${data.connectionRequestId}`, { token: null, cookie });
  expect((await readonly.json()).data.status).toBe("expired");
  expect(env.calls).toHaveLength(before);
  const result = await env.call(`/v1/connection-requests/${data.connectionRequestId}`);
  expect((await result.json()).data.status).toBe("connected");
  const connections = await env.database.connectionStore.list();
  expect(connections).toHaveLength(1);
  expect(connections[0]).toMatchObject({ source: "saas", profile: { accountId: "provider-user" } });
  expect(connections[0]).not.toHaveProperty("credential");
  const browser = await env.call(`/api/oauth/connection-requests/${data.connectionRequestId}/sync`, {
    method: "POST",
    body: {},
    token: null,
    cookie,
    headers: { origin: "https://connect.example", "x-openconnector-request": "sync" },
  });
  expect((await browser.json()).returnUri).toBe("oomol://connect/done?keep=yes&status=success&service=example");
});

it("requires same-origin protected POST and does not fall back from an invalid bearer to a valid cookie", async () => {
  const env = await setup();
  const { data, cookie } = await env.start();
  env.tick(3000);
  const before = env.calls.length;
  const invalidHeaders: Record<string, string>[] = [
    {},
    { origin: "https://evil.example", "x-openconnector-request": "sync" },
    { origin: "https://connect.example" },
    { origin: "https://connect.example", "x-openconnector-request": "sync", "content-type": "text/plain" },
  ];
  for (const headers of invalidHeaders) {
    expect(
      (
        await env.call(`/api/oauth/connection-requests/${data.connectionRequestId}/sync`, {
          method: "POST",
          body: {},
          token: null,
          cookie,
          headers,
        })
      ).status,
    ).toBe(403);
  }
  expect(
    (await env.call(`/v1/connection-requests/${data.connectionRequestId}`, { token: "wrong", cookie })).status,
  ).toBe(401);
  expect(env.calls).toHaveLength(before);
});

it("keeps unauthenticated local GET read-only while allowing same-origin local POST", async () => {
  const env = await setup("");
  const { data } = await env.start();
  env.tick(3000);
  const before = env.calls.length;
  expect((await env.call(`/v1/connection-requests/${data.connectionRequestId}`)).status).toBe(200);
  expect(env.calls).toHaveLength(before);
  const result = await env.call(`/api/oauth/connection-requests/${data.connectionRequestId}/sync`, {
    method: "POST",
    body: {},
    headers: { origin: "https://connect.example", "x-openconnector-request": "sync" },
  });
  expect((await result.json()).request.status).toBe("connected");
});

it("rejects SaaS per-request overrides and the legacy authorization entry", async () => {
  const env = await setup();
  for (const body of [{ extra: {} }, { secretExtra: {} }, { authorizationOptionIds: [] }, { clientConfig: {} }]) {
    expect((await env.start(undefined, body)).response.status).toBe(400);
  }
  expect((await env.call("/api/oauth/authorizations", { method: "POST", body: { service: "example" } })).status).toBe(
    400,
  );
  expect(env.calls).toHaveLength(0);
});

it("persists unknown creation results and never recreates the remote link", async () => {
  const env = await setup();
  env.behavior.failLink = true;
  const { response, data } = await env.start();
  expect(response.status).toBe(502);
  expect(data.connectionRequestId).toEqual(expect.any(String));
  env.tick(60_000);
  const result = await env.call(`/v1/connection-requests/${data.connectionRequestId}`);
  expect((await result.json()).data).toMatchObject({ status: "failed", errorCode: "oauth_source_result_unknown" });
  expect(env.calls.filter((call) => call.method === "POST")).toHaveLength(1);
  expect(await env.database.saasProjectStore.getCleanupStats()).toEqual({ pending: 0, manual: 1, paused: false });
});

it("merges concurrent polls and resumes a persisted candidate after restart", async () => {
  const env = await setup();
  const { data } = await env.start();
  env.tick(3000);
  let release!: () => void;
  env.behavior.getWait = new Promise<void>((resolve) => {
    release = resolve;
  });
  const complete = vi
    .spyOn(env.database.connectionRequestStore, "completeSaas")
    .mockRejectedValueOnce(new Error("commit unavailable"));
  const first = env.call(`/v1/connection-requests/${data.connectionRequestId}`);
  const second = env.call(`/v1/connection-requests/${data.connectionRequestId}`);
  await vi.waitFor(() =>
    expect(env.calls.filter((call) => call.path.includes("/connection-requests/"))).toHaveLength(1),
  );
  await env.restart();
  const otherWorker = await env.call(`/v1/connection-requests/${data.connectionRequestId}`);
  expect((await otherWorker.json()).data.status).toBe("initiated");
  expect(env.calls.filter((call) => call.path.includes("/connection-requests/"))).toHaveLength(1);
  release();
  await Promise.all([first, second]);
  complete.mockRestore();
  expect(await env.database.connectionStore.list()).toHaveLength(0);
  const before = env.calls.length;
  await env.restart();
  env.tick(3000);
  const result = await env.call(`/v1/connection-requests/${data.connectionRequestId}`);
  expect((await result.json()).data.status).toBe("connected");
  expect(env.calls).toHaveLength(before);
});

it("honors persisted Retry-After without permanently failing a pending authorization", async () => {
  const env = await setup();
  const { data } = await env.start();
  env.tick(3000);
  env.behavior.getFailure = 429;
  const limited = await env.call(`/v1/connection-requests/${data.connectionRequestId}`);
  expect(limited.status).toBe(429);
  expect(limited.headers.get("retry-after")).toBe("7");
  const before = env.calls.length;
  env.behavior.getFailure = undefined;
  env.tick(3000);
  expect((await (await env.call(`/v1/connection-requests/${data.connectionRequestId}`)).json()).data.status).toBe(
    "initiated",
  );
  expect(env.calls).toHaveLength(before);
  env.tick(4001);
  expect((await (await env.call(`/v1/connection-requests/${data.connectionRequestId}`)).json()).data.status).toBe(
    "connected",
  );
});

it.each(["mismatch", "secretSummary"] as const)("does not commit an untrusted remote result: %s", async (mode) => {
  const env = await setup();
  const { data } = await env.start();
  env.tick(3000);
  env.behavior[mode] = true;
  expect((await env.call(`/v1/connection-requests/${data.connectionRequestId}`)).status).toBe(
    mode === "mismatch" ? 409 : 502,
  );
  expect(await env.database.connectionStore.list()).toHaveLength(0);
  expect(await env.database.saasProjectStore.getCleanupStats()).toEqual({ pending: 1, manual: 0, paused: false });
});

it("reconnects through the original source and never revives a deleted target", async () => {
  const env = await setup();
  const original = await env.start();
  env.tick(3000);
  await env.call(`/v1/connection-requests/${original.data.connectionRequestId}`);
  const connection = (await env.database.connectionStore.list())[0];
  await env.call("/api/oauth/sources/example", { method: "PUT", body: { mode: "local" } });
  const next = await env.start(`/v1/connections/by-id/${connection.id}/connect`);
  expect(next.response.status).toBe(200);
  expect(await env.database.connectionStore.list()).toEqual([connection]);
  await env.database.connectionStore.delete(connection.service, connection.connectionName);
  env.tick(3000);
  const result = await env.call(`/v1/connection-requests/${next.data.connectionRequestId}`);
  expect((await result.json()).data).toMatchObject({ status: "failed", errorCode: "request_key_conflict" });
  expect(await env.database.connectionStore.list()).toHaveLength(0);
  expect(await env.database.saasProjectStore.getCleanupStats()).toEqual({ pending: 2, manual: 0, paused: false });
});

it("recovers an abandoned creating request as unknown without sending a new link", async () => {
  const env = await setup();
  const project = (await env.database.saasProjectStore.getProject())!;
  const id = crypto.randomUUID();
  await env.database.connectionRequestStore.createSaas({
    connectionRequestId: id,
    connectionId: crypto.randomUUID(),
    owner: "local-admin",
    service: "example",
    connectionName: crypto.randomUUID(),
    managedProjectId: project.id,
    providerConfigId: "config",
    externalUserId: `open-connector:${await env.database.saasProjectStore.getInstanceId()}`,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 600_000).toISOString(),
  });
  env.tick(46_000);
  await env.restart();
  const result = await env.call(`/v1/connection-requests/${id}`);
  expect((await result.json()).data).toMatchObject({ status: "failed", errorCode: "oauth_source_result_unknown" });
  expect(env.calls).toHaveLength(0);
});

it("cancels only one waiter while shared synchronization completes for other callers", async () => {
  const env = await setup();
  const { data } = await env.start();
  env.tick(3000);
  let release!: () => void;
  env.behavior.getWait = new Promise<void>((resolve) => {
    release = resolve;
  });
  const abort = new AbortController();
  const polling = env.call(`/v1/connection-requests/${data.connectionRequestId}`, { signal: abort.signal });
  await vi.waitFor(() =>
    expect(env.calls.filter((call) => call.path.includes("/connection-requests/"))).toHaveLength(1),
  );
  const second = env.call(`/v1/connection-requests/${data.connectionRequestId}`);
  abort.abort();
  await polling;
  expect(await env.database.connectionStore.list()).toHaveLength(0);
  expect(await env.database.connectionRequestStore.get(data.connectionRequestId, "local-admin")).toMatchObject({
    status: "initiated",
  });
  const third = env.call(`/v1/connection-requests/${data.connectionRequestId}`);
  release();
  const results = await Promise.all([second, third]);
  for (const result of results) expect((await result.json()).data.status).toBe("connected");
  expect(env.calls.filter((call) => call.path.includes("/connection-requests/"))).toHaveLength(1);
});

it("keeps a local reconnect local after changing the new-connection default to SaaS", async () => {
  const env = await setup();
  const local = await env.database.connectionStore.set("example", "local", {
    authType: "oauth2",
    accessToken: "local-access",
    tokenType: "Bearer",
    metadata: {},
    profile: { accountId: "local-user", displayName: "Local", grantedScopes: [] },
  });
  await env.database.oauthClientConfigStore.set({
    service: "example",
    clientId: "local-client",
    clientSecret: "local-secret",
    extra: {},
    secretExtra: {},
  });
  const result = await env.start(`/v1/connections/by-id/${local.id}/connect`);
  expect(result.response.status).toBe(200);
  expect(new URL(result.data.authorizationUrl).hostname).toBe("provider.example");
  expect(env.calls).toHaveLength(0);
});

it("creates named Console requests and reconnects through the original source after defaults change", async () => {
  const env = await setup();
  const started = await env.call("/api/oauth/connection-requests", {
    method: "POST",
    body: { service: "example", connectionName: "work" },
  });
  expect(started.status).toBe(200);
  expect(started.headers.get("cache-control")).toBe("private, no-store");
  const request = await started.json();
  env.tick(2100);
  await env.call("/api/oauth/connection-requests/" + request.connectionRequestId + "/sync", {
    method: "POST",
    body: {},
    headers: { origin: "https://connect.example", "x-openconnector-request": "sync" },
  });
  const connection = await env.database.connectionStore.get("example", "work");
  expect(connection?.source).toBe("saas");
  await env.call("/api/oauth/sources/example", { method: "PUT", body: { mode: "local" } });
  const count = env.calls.filter((call) => call.path.endsWith("/link")).length;
  const reconnected = await env.call("/api/oauth/connection-requests", {
    method: "POST",
    body: { service: "example", connectionName: "work", appId: connection!.id },
  });
  expect(reconnected.status).toBe(200);
  expect(env.calls.filter((call) => call.path.endsWith("/link"))).toHaveLength(count + 1);
  const invalid = await env.call("/api/oauth/connection-requests", {
    method: "POST",
    body: { service: "example", connectionName: "other", appId: connection!.id },
  });
  expect(invalid.status).toBe(400);
  expect(env.calls.filter((call) => call.path.endsWith("/link"))).toHaveLength(count + 1);
});

it("rejects Console input overrides, missing local config and unauthenticated creation before linking", async () => {
  const env = await setup();
  for (const body of [
    { service: "example", connectionName: "../invalid" },
    { service: "example", connectionName: "work", projectApiKey: "not-allowed" },
    { service: "example", connectionName: "work", authorizationOptionIds: [] },
  ]) {
    expect((await env.call("/api/oauth/connection-requests", { method: "POST", body })).status).toBe(400);
  }
  expect(
    (
      await env.call("/api/oauth/connection-requests", {
        method: "POST",
        token: "wrong",
        body: { service: "example", connectionName: "work" },
      })
    ).status,
  ).toBe(401);
  await env.call("/api/oauth/sources/example", { method: "PUT", body: { mode: "local" } });
  const missing = await env.call("/api/oauth/connection-requests", {
    method: "POST",
    body: { service: "example", connectionName: "work" },
  });
  expect(missing.status).toBe(400);
  expect(await missing.json()).toMatchObject({ error: { code: "oauth_client_config_required" } });
  expect(env.calls.some((call) => call.path.endsWith("/link"))).toBe(false);
});

it("explains Console origin mismatches without contacting SaaS", async () => {
  const env = await setup();
  const { data, cookie } = await env.start();
  const before = env.calls.length;
  const response = await env.call(`/api/oauth/connection-requests/${data.connectionRequestId}/sync`, {
    method: "POST",
    body: {},
    token: null,
    cookie,
    headers: { origin: "http://localhost:5173", "x-openconnector-request": "sync" },
  });
  expect(response.status).toBe(403);
  expect(await response.json()).toMatchObject({
    error: {
      code: "oauth_source_origin_mismatch",
      message: expect.stringContaining("Open Console at https://connect.example"),
    },
  });
  expect(env.calls).toHaveLength(before);
});
