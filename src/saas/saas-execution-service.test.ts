import type { ActionDefinition, ProviderDefinition } from "../core/types.ts";
import type { RunLog } from "../server/storage/runtime-store.ts";

import { afterEach, expect, it, vi } from "vitest";
import { createCatalogStore } from "../catalog-store.ts";
import { ConnectionService } from "../connection-service.ts";
import { ActionPolicyService } from "../core/action-policy.ts";
import { ActionRunner } from "../server/actions/action-runner.ts";
import { createConnectApp } from "../server/connect-app.ts";
import { TransitFileService } from "../server/files/transit-files.ts";
import { ProxyRunner } from "../server/proxy/proxy-runner.ts";
import { AesGcmSecretCodec } from "../server/secrets/secret-codec.ts";
import { SqliteRuntimeDatabase } from "../server/storage/sqlite/runtime-store.ts";
import { SaasClient } from "./saas-client.ts";
import { SaasExecutionService } from "./saas-execution-service.ts";
import { SaasProjectService } from "./saas-project-service.ts";

const action: ActionDefinition = {
  id: "example.echo",
  service: "example",
  name: "echo",
  description: "Echo",
  operationType: "read",
  requiredScopes: [],
  providerPermissions: [],
  inputSchema: {
    type: "object",
    required: ["value"],
    properties: { value: { type: "string" } },
    additionalProperties: false,
  },
  outputSchema: {},
};
const provider: ProviderDefinition = {
  service: "example",
  displayName: "Example",
  categories: [],
  authTypes: ["oauth2"],
  actions: [action],
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
const policy = new ActionPolicyService().createSnapshot();
const databases: SqliteRuntimeDatabase[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  for (const database of databases.splice(0)) database.close();
});

async function setup() {
  const codec = new AesGcmSecretCodec("encryption-key");
  const db = new SqliteRuntimeDatabase(":memory:", { secretCodec: codec });
  databases.push(db);
  const project = { id: "managed", projectId: "project", baseUrl: "https://saas.example", apiKey: "project-secret" };
  await db.saasProjectStore.saveProject(project);
  const pending = {
    connectionRequestId: crypto.randomUUID(),
    connectionId: crypto.randomUUID(),
    owner: "admin",
    service: "example",
    connectionName: "work",
    managedProjectId: project.id,
    providerConfigId: "config",
    externalUserId: `open-connector:${await db.saasProjectStore.getInstanceId()}`,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 600_000).toISOString(),
  };
  const lease = await db.connectionRequestStore.createSaas(pending);
  await db.connectionRequestStore.saveSaasRequest(lease, "remote-request");
  await db.connectionRequestStore.saveSaasCandidate(lease, {
    connectedAccountId: "account",
    status: "active",
    profile: { accountId: "user", displayName: "User", grantedScopes: [] },
    comment: null,
  });
  expect(await db.connectionRequestStore.completeSaas(lease)).toBe("connected");
  const discovery = {
    projectId: "project",
    providerConfigs: [
      {
        id: "config",
        service: "example",
        displayName: "Example",
        callbackUrl: "https://saas.example/callback",
        effectiveScopes: [],
        actionIds: [action.id],
        proxyAvailable: true,
      },
    ],
  };
  const behavior = {
    execute: async (_url: string, _init?: RequestInit): Promise<Response> =>
      Response.json({
        success: true,
        data: { executionId: "remote-action", actionId: action.id, output: { value: "remote" } },
      }),
  };
  const fetcher = vi.fn<typeof fetch>(async (url, init) =>
    String(url).endsWith("/oauth/provider-configs")
      ? Response.json({ success: true, data: discovery })
      : behavior.execute(String(url), init),
  );
  const catalog = createCatalogStore([provider]);
  const client = new SaasClient(fetcher);
  const projects = new SaasProjectService({ catalog, store: db.saasProjectStore, secretCodec: codec, client });
  const saas = new SaasExecutionService({ projects, client });
  const forbidden = vi.fn(async (): Promise<never> => {
    throw new Error("Local execution must not run");
  });
  const loader = { loadActionExecutor: forbidden, loadProxyExecutor: forbidden, loadCredentialValidators: forbidden };
  const connections = new ConnectionService({
    catalog,
    store: db.connectionStore,
    providerLoader: loader,
    oauthCredentials: { refresh: forbidden },
  });
  const actions = new ActionRunner({ catalog, connections, providerLoader: loader, saas, runs: db.runLogStore });
  const proxy = new ProxyRunner({ catalog, connections, providerLoader: loader, saas });
  const runAction = (overrides: Partial<Parameters<ActionRunner["run"]>[0]> = {}) =>
    actions.run({
      actionId: action.id,
      input: { value: "hello" },
      caller: "http",
      connectionName: "work",
      policy,
      ...overrides,
    });
  const runProxy = (
    input: unknown = { endpoint: "/items", method: "GET" },
    overrides: Partial<Parameters<ProxyRunner["run"]>[0]> = {},
  ) => proxy.run({ service: "example", input, connectionName: "work", policy, ...overrides });
  return {
    db,
    project,
    pending,
    discovery,
    behavior,
    fetcher,
    catalog,
    forbidden,
    connections,
    runAction,
    runProxy,
    app: async () => {
      vi.stubGlobal("fetch", fetcher);
      return (
        await createConnectApp({
          catalog,
          providerLoader: loader,
          runtimeDatabase: db,
          secretCodec: codec,
          publicOrigin: "https://connect.example",
          adminToken: "admin",
          transitFiles: new TransitFileService({
            rootDir: ".tmp/saas-execution-tests",
            publicOrigin: "https://connect.example",
            ttlSeconds: 60,
            maxBytes: 1024,
          }),
        })
      ).app;
    },
  };
}

it("executes the exact account remotely and persists distinct local and remote IDs without revising the connection", async () => {
  const f = await setup();
  const before = await f.db.connectionStore.get("example", "work");
  const run = await f.runAction();
  expect(run).toMatchObject({ remoteExecutionId: "remote-action", result: { ok: true, output: { value: "remote" } } });
  expect(run!.executionId).not.toBe("remote-action");
  const [url, init] = f.fetcher.mock.calls[1];
  expect(String(url)).toBe("https://saas.example/v1/saas/actions/example.echo");
  expect(JSON.parse(String(init?.body))).toEqual({
    providerConfigId: "config",
    userId: f.pending.externalUserId,
    connectedAccountId: "account",
    input: { value: "hello" },
  });
  expect(new Headers(init?.headers).get("authorization")).toBe("Bearer project-secret");
  expect(await f.db.runLogStore.get(run!.executionId)).toMatchObject({ remoteExecutionId: "remote-action", ok: true });
  expect(await f.db.connectionStore.get("example", "work")).toEqual(before);
  expect(f.forbidden).not.toHaveBeenCalled();
});

it("rejects action, proxy and connection grants and invalid local schemas before remote discovery", async () => {
  const f = await setup();
  const blocked = new ActionPolicyService({ blockedActions: [action.id], allowedProxies: [] }).createSnapshot();
  expect((await f.runAction({ policy: blocked }))?.result.ok).toBe(false);
  expect((await f.runAction({ input: { unknown: true } }))?.result.error?.code).toBe("invalid_input");
  const restricted = new ActionPolicyService().createSnapshot(undefined, {
    allowedActions: [action.id],
    blockedActions: [],
    allowedProxies: ["example"],
    allowedConnections: [crypto.randomUUID()],
  });
  expect((await f.runAction({ policy: restricted }))?.result.error?.code).toBe("connection_not_allowed");
  expect(await f.runProxy(undefined, { policy: restricted })).toMatchObject({ status: 403 });
  const deniedProxy = new ActionPolicyService({ allowedProxies: ["other"] }).createSnapshot();
  expect(await f.runProxy(undefined, { policy: deniedProxy })).toMatchObject({ status: 403 });
  expect(f.fetcher).not.toHaveBeenCalled();
  expect(f.forbidden).not.toHaveBeenCalled();
});

it("rechecks the final selected connection grant if it changes during resolution", async () => {
  const f = await setup();
  const original = f.connections.resolveForExecution.bind(f.connections);
  vi.spyOn(f.connections, "resolveForExecution").mockImplementation(async (...args) => {
    const target = await original(...args);
    target.summary!.id = "changed";
    return target;
  });
  const restricted = new ActionPolicyService().createSnapshot(undefined, {
    allowedActions: [action.id],
    blockedActions: [],
    allowedProxies: ["example"],
    allowedConnections: [f.pending.connectionId],
  });
  expect((await f.runAction({ policy: restricted }))?.result.error?.code).toBe("connection_not_allowed");
  expect(await f.runProxy(undefined, { policy: restricted })).toMatchObject({ status: 403 });
  expect(f.fetcher).not.toHaveBeenCalled();
});

it("checks source capabilities without changing the global catalog or trying a local executor", async () => {
  const f = await setup();
  f.discovery.providerConfigs[0].actionIds = [];
  f.discovery.providerConfigs[0].proxyAvailable = false;
  expect((await f.runAction())?.result.error?.code).toBe("oauth_source_unsupported");
  expect(await f.runProxy()).toMatchObject({ status: 501, errorCode: "proxy_not_supported" });
  expect(f.catalog.actionsById.has(action.id)).toBe(true);
  expect(f.fetcher.mock.calls.every(([url]) => String(url).endsWith("/oauth/provider-configs"))).toBe(true);
  expect(f.forbidden).not.toHaveBeenCalled();
});

it("unwraps proxy status, headers and nested data and retains exact selectors", async () => {
  const f = await setup();
  f.behavior.execute = async () =>
    Response.json({
      success: true,
      data: { status: 202, headers: { "content-type": "application/json" }, data: { data: "nested" } },
      meta: { executionId: "remote-proxy", service: "example" },
    });
  expect(
    await f.runProxy({
      endpoint: "/items",
      method: "post",
      body: "hello",
      query: { limit: 2, enabled: true, empty: null },
      headers: { "x-test": "value" },
      alias: "work",
    }),
  ).toMatchObject({
    ok: true,
    response: { status: 202, data: { data: "nested" } },
    meta: { remoteExecutionId: "remote-proxy", executionId: expect.any(String) },
  });
  expect(JSON.parse(String(f.fetcher.mock.calls[1][1]?.body))).toEqual({
    providerConfigId: "config",
    userId: f.pending.externalUserId,
    connectedAccountId: "account",
    request: {
      endpoint: "/items",
      method: "POST",
      body: "hello",
      query: { limit: 2, enabled: true, empty: null },
      headers: { "x-test": "value" },
    },
  });
  expect(f.forbidden).not.toHaveBeenCalled();
});

it.each([
  { method: "HEAD" },
  { accessGrant: {} },
  { unknown: true },
  { query: { q: [] } },
  { query: { q: {} } },
  { query: { q: Infinity } },
  { query: { q: -Infinity } },
  { query: { q: NaN } },
  { headers: { x: 1 } },
  { headers: { authorization: "Bearer secret" } },
  { headers: { "content-type": "application/octet-stream" } },
  { method: "POST", body: new Uint8Array([1]) },
  { method: "POST", body: new Date() },
  { method: "POST", body: { n: Infinity } },
])("rejects unrepresentable proxy input before remote I/O: %j", async (input) => {
  const f = await setup();
  expect(await f.runProxy({ endpoint: "/items", method: "GET", ...input })).toMatchObject({
    status: 400,
    errorCode: "invalid_input",
  });
  expect(f.fetcher).not.toHaveBeenCalled();
});

it.each(["action", "proxy"])("does not replay a %s after a lost response", async (kind) => {
  const f = await setup();
  f.behavior.execute = async () => {
    throw new Error("secret upstream address");
  };
  const result = kind === "action" ? await f.runAction() : await f.runProxy();
  expect(JSON.stringify(result)).toContain("oauth_source_unavailable");
  expect(JSON.stringify(result)).not.toContain("secret upstream address");
  expect(f.fetcher).toHaveBeenCalledTimes(2);
  expect(f.forbidden).not.toHaveBeenCalled();
});

it.each(["action", "proxy"])(
  "aborts waiting for %s without replay even if the remote operation later finishes",
  async (kind) => {
    const f = await setup();
    const controller = new AbortController();
    let started!: () => void;
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    let finish!: () => void;
    const done = new Promise<void>((resolve) => {
      finish = resolve;
    });
    let remoteFinished = false;
    let remoteSignal: AbortSignal | null | undefined;
    f.behavior.execute = async (_url, init) => {
      remoteSignal = init?.signal;
      started();
      await done;
      remoteFinished = true;
      return Response.json({ success: true, data: { executionId: "remote", actionId: action.id, output: {} } });
    };
    const run =
      kind === "action"
        ? f.runAction({ signal: controller.signal })
        : f.runProxy(undefined, { signal: controller.signal });
    await ready;
    controller.abort();
    expect(JSON.stringify(await run)).toContain("execution_cancelled");
    expect(remoteSignal?.aborted).toBe(true);
    expect(remoteFinished).toBe(false);
    finish();
    await done;
    await Promise.resolve();
    expect(remoteFinished).toBe(true);
    expect(f.fetcher).toHaveBeenCalledTimes(2);
  },
);

it("preserves safe business errors, remote correlation and Retry-After through idempotent HTTP replay", async () => {
  const f = await setup();
  const app = await f.app();
  f.behavior.execute = async () =>
    Response.json(
      {
        errorCode: "rate_limited",
        errorMessage: "secret raw provider error",
        data: { token: "secret" },
        executionId: "remote-failure",
      },
      { status: 429, headers: { "retry-after": "Wed, 30 Sep 2026 00:00:00 GMT" } },
    );
  const call = () =>
    app.request("https://connect.example/v1/actions/example.echo", {
      method: "POST",
      headers: {
        authorization: "Bearer admin",
        "content-type": "application/json",
        "idempotency-key": "saas-execution",
      },
      body: JSON.stringify({ input: { value: "hello" }, alias: "work" }),
    });
  const first = await call();
  const body = await first.json();
  const second = await call();
  expect(first.status).toBe(429);
  expect(second.status).toBe(429);
  expect(await second.json()).toEqual(body);
  expect(second.headers.get("retry-after")).toBe("Wed, 30 Sep 2026 00:00:00 GMT");
  expect(body.meta).toMatchObject({ remoteExecutionId: "remote-failure", executionId: expect.any(String) });
  expect(JSON.stringify(body)).not.toContain("secret");
  expect(f.fetcher).toHaveBeenCalledTimes(2);
  const log: RunLog | undefined = await f.db.runLogStore.get(body.meta.executionId);
  expect(log?.remoteExecutionId).toBe("remote-failure");
  expect(JSON.stringify(log)).not.toContain("secret");
});

it("serializes SaaS action and proxy success without changing the public data shapes", async () => {
  const f = await setup();
  const app = await f.app();
  const headers = { authorization: "Bearer admin", "content-type": "application/json" };
  const actionResponse = await app.request("https://connect.example/v1/actions/example.echo", {
    method: "POST",
    headers,
    body: JSON.stringify({ input: { value: "hello" }, alias: "work" }),
  });
  expect(await actionResponse.json()).toMatchObject({
    success: true,
    data: { value: "remote" },
    meta: { remoteExecutionId: "remote-action", executionId: expect.any(String) },
  });
  f.behavior.execute = async () =>
    Response.json({
      success: true,
      data: { status: 404, headers: { "content-type": "text/plain" }, data: "missing" },
      meta: { executionId: "remote-proxy", service: "example" },
    });
  const proxyResponse = await app.request("https://connect.example/v1/proxy/example", {
    method: "POST",
    headers,
    body: JSON.stringify({ endpoint: "/items", method: "GET", connectionName: "work" }),
  });
  expect(proxyResponse.status).toBe(200);
  expect(await proxyResponse.json()).toMatchObject({
    success: true,
    data: { status: 404, data: "missing" },
    meta: { remoteExecutionId: "remote-proxy", executionId: expect.any(String) },
  });
});

it("preserves raw SaaS proxy business failures and Retry-After at the HTTP boundary", async () => {
  const f = await setup();
  const app = await f.app();
  f.behavior.execute = async () =>
    Response.json(
      { errorCode: "rate_limited", errorMessage: "secret provider body", executionId: "remote-proxy-error" },
      { status: 429, headers: { "retry-after": "9" } },
    );
  const response = await app.request("https://connect.example/v1/proxy/example", {
    method: "POST",
    headers: { authorization: "Bearer admin", "content-type": "application/json" },
    body: JSON.stringify({ endpoint: "/items", method: "GET", alias: "work" }),
  });
  expect(response.status).toBe(429);
  expect(response.headers.get("retry-after")).toBe("9");
  const json = await response.json();
  expect(json.meta).toMatchObject({ remoteExecutionId: "remote-proxy-error", executionId: expect.any(String) });
  expect(JSON.stringify(json)).not.toContain("secret");
  expect(f.fetcher).toHaveBeenCalledTimes(2);
});

it("does not contact SaaS for an already cancelled execution", async () => {
  const f = await setup();
  const controller = new AbortController();
  controller.abort();
  expect((await f.runAction({ signal: controller.signal }))?.result.error?.code).toBe("execution_cancelled");
  expect(await f.runProxy(undefined, { signal: controller.signal })).toMatchObject({
    errorCode: "execution_cancelled",
  });
  expect(f.fetcher).not.toHaveBeenCalled();
});

it("rejects changed project identity before sending a business request", async () => {
  const f = await setup();
  f.discovery.projectId = "another-project";
  expect((await f.runAction())?.result.error?.code).toBe("oauth_source_mismatch");
  expect(await f.runProxy()).toMatchObject({ errorCode: "oauth_source_mismatch", status: 409 });
  expect(f.fetcher.mock.calls.every(([url]) => String(url).endsWith("/oauth/provider-configs"))).toBe(true);
});
