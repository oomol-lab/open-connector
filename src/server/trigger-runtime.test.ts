import type { IConnectionStore } from "../connection-service.ts";
import type { ProviderHttpAttempt } from "../core/provider-http-dispatch.ts";
import type { ProviderDefinition, ProviderProxyExecutor } from "../core/types.ts";
import type { ConnectorProxyRequest } from "../triggers/common/proxy.ts";
import type { ConnectApp } from "./connect-app.ts";

import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCatalogStore } from "../catalog-store.ts";
import { ConnectionService } from "../connection-service.ts";
import { ActionPolicyService } from "../core/action-policy.ts";
import { provider as feishu } from "../providers/feishu_app_bot/definition.ts";
import { provider as github } from "../providers/github/definition.ts";
import { provider as gmail } from "../providers/gmail/definition.ts";
import { provider as linear } from "../providers/linear/definition.ts";
import { ProviderLoader } from "../providers/provider-loader.ts";
import { TriggerRunner } from "../triggers/trigger-runner.ts";
import { createConnectApp } from "./connect-app.ts";
import { TransitFileService } from "./files/transit-files.ts";
import { PlainTextSecretCodec } from "./secrets/secret-codec-core.ts";
import { RuntimeTokenService } from "./storage/runtime-token-service.ts";
import { SqliteRuntimeDatabase } from "./storage/sqlite/runtime-store.ts";

const callback = "https://flow.example/events/hook";
const config = { owner: "octocat", repo: "repository", events: ["issues"] };
let database: SqliteRuntimeDatabase;
let connector: ConnectApp;
let connectionId: string;
let token: string;
let tokenId: string;
let calls: { service: string; key: string; request: ConnectorProxyRequest }[];
let hooks: Record<string, unknown>[];
let nextId: number;
let failDelete: boolean;
let loseCreate: boolean;
let useNativeProxy: boolean;
let denyProviderDispatch: boolean;
let dispatchAttempts: ProviderHttpAttempt[];
let fixtureProviderLoader: ProviderLoader;

beforeEach(async () => {
  database = new SqliteRuntimeDatabase(":memory:");
  calls = [];
  hooks = [];
  nextId = 1;
  failDelete = false;
  loseCreate = false;
  useNativeProxy = false;
  denyProviderDispatch = false;
  dispatchAttempts = [];
  const sources: ProviderDefinition[] = [github, gmail, linear, feishu];
  const modulePaths: Record<string, string> = {
    github: "../providers/github/executors.ts",
    gmail: "../providers/gmail/executors.ts",
    linear: "../providers/linear/executors.ts",
    feishu_app_bot: "../providers/feishu_app_bot/executors.ts",
  };
  const modules = Object.fromEntries(
    sources.map((provider) => [
      provider.service,
      async () => {
        const native = await import(modulePaths[provider.service]!);
        if (useNativeProxy) return native;
        const proxy: ProviderProxyExecutor = async (request, context) => {
          context.signal?.throwIfAborted();
          const credential = await context.getCredential(provider.service);
          const key =
            credential?.authType === "api_key"
              ? credential.apiKey
              : credential?.authType === "oauth2"
                ? credential.accessToken
                : "unknown";
          calls.push({ service: provider.service, key, request: request as ConnectorProxyRequest });
          let data: unknown = {};
          let status = 200;
          if (provider.service === "gmail") data = { historyId: "100" };
          else if (provider.service === "linear")
            data = {
              data: {
                teams: {
                  nodes: [{ id: "11111111-1111-4111-8111-111111111111", name: "Engineering", key: "ENG" }],
                  pageInfo: { hasNextPage: false },
                },
              },
            };
          else if (provider.service === "feishu_app_bot") data = { code: 0, data: {} };
          else if (request.method === "GET")
            data = request.endpoint.endsWith("/hooks")
              ? hooks
              : (hooks.find((hook) => String(hook.id) === request.endpoint.split("/").at(-1)) ?? null);
          else if (request.method === "POST") {
            const hook: Record<string, unknown> = { ...(request.body as Record<string, unknown>), id: nextId++ };
            const duplicate = hooks.some(
              (existing) =>
                (existing.config as Record<string, unknown>).url === (hook.config as Record<string, unknown>).url,
            );
            if (duplicate)
              return { ok: true, response: { status: 422, headers: {}, data: { message: "Hook already exists" } } };
            hooks.push(hook);
            data = hook;
            status = 201;
            if (loseCreate) {
              loseCreate = false;
              throw new Error("Connection lost after upstream accepted the hook");
            }
          } else if (request.method === "PATCH") {
            const id = request.endpoint.split("/").at(-1);
            const index = hooks.findIndex((hook) => String(hook.id) === id);
            if (index >= 0) hooks[index] = { ...hooks[index], ...(request.body as Record<string, unknown>) };
            data = hooks[index];
          } else if (request.method === "DELETE") {
            if (failDelete)
              return {
                ok: false,
                error: { code: "provider_error", message: "Upstream unavailable", details: { status: 503 } },
              };
            hooks = hooks.filter((hook) => String(hook.id) !== request.endpoint.split("/").at(-1));
            status = 204;
          }
          return { ok: true, response: { status, headers: {}, data } };
        };
        return { ...native, proxy };
      },
    ]),
  );
  const connection = await database.connectionStore.set("github", "work", credential("work-key", "work-account"));
  connectionId = connection.id;
  await database.connectionStore.set("github", "default", credential("default-key", "default-account"));
  const created = await new RuntimeTokenService(database.runtimeTokenStore).createToken("Open Flow", {
    allowedActions: [],
    blockedActions: ["*"],
    allowedProxies: [],
    allowedTriggers: [
      "github.on_repo_event",
      "gmail.on_message_received",
      "linear.on_issue_changed",
      "feishu_app_bot.on_event",
    ],
  });
  token = created.token;
  tokenId = created.record.id;
  fixtureProviderLoader = new ProviderLoader(modules);
  connector = await createConnectApp({
    providerHttpDispatch: {
      beforeAttempt: (attempt) => {
        dispatchAttempts.push(attempt);
        return denyProviderDispatch ? { allow: false, retryAfterSeconds: 46 } : { allow: true };
      },
    },
    catalog: createCatalogStore(sources),
    providerLoader: fixtureProviderLoader,
    runtimeDatabase: database,
    transitFiles: new TransitFileService({
      rootDir: "/unused-trigger-test",
      publicOrigin: callback,
      ttlSeconds: 60,
      maxBytes: 1024,
    }),
    publicOrigin: "https://connector.example",
    secretCodec: new PlainTextSecretCodec(),
    adminToken: "admin",
    runtimeToken: "environment-token",
    actionPolicy: new ActionPolicyService(),
    serveDocumentation: false,
  });
});

afterEach(async () => {
  await connector.triggerMaintenance.close();
  await connector.saasCleanup.close();
  database.close();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function credential(key: string, accountId: string) {
  return {
    authType: "api_key" as const,
    apiKey: key,
    values: { apiKey: key },
    profile: { accountId, displayName: accountId, grantedScopes: [] },
    metadata: { providerAccountVerified: true },
  };
}
function request(
  body: unknown,
  bearer = token,
  id = connectionId,
  service = "github",
  trigger = "github.on_repo_event",
) {
  return connector.app.request(`/v1/providers/${service}/triggers/${trigger}/execute`, {
    method: "POST",
    headers: { authorization: `Bearer ${bearer}`, "content-type": "application/json", "x-oo-connector-app-id": id },
    body: JSON.stringify(body),
  });
}
function reconcile(extra: Record<string, unknown> = {}) {
  return { operation: "reconcile", config, endpointUrl: callback, active: true, requestKey: "binding-key", ...extra };
}
async function subscription() {
  const response = await request(reconcile());
  expect(response.status).toBe(200);
  return (await response.json()).data.subscription.id as string;
}

describe("Trigger runtime HTTP boundary", () => {
  it("retains Trigger OAuth refresh with a boolean-only custom connection store and admission configured", async () => {
    const sql = database.connectionStore;
    const store: IConnectionStore = {
      get: sql.get.bind(sql),
      set: sql.set.bind(sql),
      updateCredential: sql.updateCredential.bind(sql),
      delete: sql.delete.bind(sql),
      list: sql.list.bind(sql),
    };
    const oauth = {
      authType: "oauth2" as const,
      accessToken: "expired-token",
      refreshToken: "refresh-token",
      tokenType: "Bearer",
      expiresAt: "2026-01-01T00:00:00.000Z",
      profile: credential("unused", "work-account").profile,
      metadata: { providerAccountVerified: true },
    };
    await store.set("github", "work", oauth);
    const catalog = createCatalogStore([github]);
    const providerHttpDispatch = { beforeAttempt: () => ({ allow: true as const }) };
    const connections = new ConnectionService({
      providerHttpDispatch,
      catalog,
      store,
      providerLoader: fixtureProviderLoader,
      oauthCredentials: {
        refresh: async () => ({ ...oauth, accessToken: "fresh-token", expiresAt: "2099-01-01T00:00:00.000Z" }),
      },
    });
    const runner = new TriggerRunner({
      providerHttpDispatch,
      catalog,
      connections,
      providerLoader: fixtureProviderLoader,
      store: database.triggerStore,
    });
    await expect(
      runner.run({
        service: "github",
        triggerId: "github.on_repo_event",
        connectionId,
        policy: new ActionPolicyService().createSnapshot(),
        grant: {
          tokenId,
          allowedActions: [],
          blockedActions: [],
          allowedProxies: [],
          allowedTriggers: ["github.on_repo_event"],
        },
        request: { operation: "reconcile", config, endpointUrl: callback, active: true, requestKey: "legacy-refresh" },
        signal: new AbortController().signal,
      }),
    ).resolves.toMatchObject({ subscription: { id: expect.any(String) } });
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.every((call) => call.key === "fresh-token")).toBe(true);
  });

  it("preserves admission denial through native Trigger proxy and integration error mapping", async () => {
    useNativeProxy = true;
    denyProviderDispatch = true;
    const fetcher = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetcher);
    const response = await request(reconcile());
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("46");
    expect(await response.json()).toMatchObject({ errorCode: "rate_limited" });
    expect(fetcher).not.toHaveBeenCalled();
    expect(dispatchAttempts).toHaveLength(1);
    expect(dispatchAttempts[0]?.context).toMatchObject({
      operation: "trigger",
      connectionId,
      connectionName: "work",
    });
  });

  it("runs Trigger-only grants against the stable non-default connection and denies Action and public proxy", async () => {
    await subscription();
    expect(calls.every((call) => call.key === "work-key")).toBe(true);
    expect(hooks).toHaveLength(1);
    expect(
      (
        await connector.app.request("/v1/actions/github.get_current_user", {
          method: "POST",
          headers: {
            authorization: `Bearer ${token}`,
            "content-type": "application/json",
            "x-oo-connector-app-id": connectionId,
          },
          body: '{"input":{}}',
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await connector.app.request("/v1/proxy/github", {
          method: "POST",
          headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
          body: '{"method":"GET","endpoint":"/user"}',
        })
      ).status,
    ).toBe(403);
    expect((await request(reconcile(), token, connectionId, "github", "github.watch_pull_request")).status).toBe(403);
    const mismatched = await connector.app.request(
      "/v1/providers/github/triggers/github.on_repo_event/execute?alias=default",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
          "x-oo-connector-app-id": connectionId,
        },
        body: JSON.stringify(reconcile()),
      },
    );
    expect(mismatched.status).toBe(404);
  });

  it("defaults legacy tokens to no Trigger grant and rejects caller-supplied grants and stateful environment tokens", async () => {
    const legacy = await new RuntimeTokenService(database.runtimeTokenStore).createToken("Legacy", {
      allowedActions: ["*"],
      blockedActions: [],
      allowedProxies: ["*"],
    });
    expect((await request(reconcile(), legacy.token)).status).toBe(403);
    expect((await request({ ...reconcile(), accessGrant: { allowedTriggers: ["*"] } })).status).toBe(400);
    expect((await request(reconcile(), "environment-token")).status).toBe(403);
    expect(calls).toEqual([]);
  });

  it("reads Gmail and Linear options without a proxy grant and rejects malformed checkpoints", async () => {
    const mail = await database.connectionStore.set("gmail", "work", credential("mail-key", "mail-user"));
    const result = await request(
      { operation: "read", config: {}, checkpoint: null },
      token,
      mail.id,
      "gmail",
      "gmail.on_message_received",
    );
    expect(result.status).toBe(200);
    expect((await result.json()).data).toEqual({ checkpoint: { historyId: "100" }, events: [] });
    const invalid = await request(
      { operation: "read", config: {}, checkpoint: { historyId: false } },
      token,
      mail.id,
      "gmail",
      "gmail.on_message_received",
    );
    expect(invalid.status).toBe(400);
    const workspace = await database.connectionStore.set("linear", "work", credential("linear-key", "workspace"));
    const options = await request(
      { operation: "options", config: {}, field: "teamId" },
      token,
      workspace.id,
      "linear",
      "linear.on_issue_changed",
    );
    expect(options.status).toBe(200);
    expect((await options.json()).data).toEqual([
      { value: "11111111-1111-4111-8111-111111111111", label: "Engineering (ENG)" },
    ]);
  });

  it("recovers a lost create response idempotently and rejects immutable callback changes and cross-token ownership", async () => {
    loseCreate = true;
    expect((await request(reconcile())).status).toBe(503);
    const id = await subscription();
    expect(hooks).toHaveLength(1);
    expect((await request(reconcile({ endpointUrl: "https://another.example/hook" }))).status).toBe(409);
    const other = await new RuntimeTokenService(database.runtimeTokenStore).createToken("Other", {
      allowedActions: [],
      blockedActions: ["*"],
      allowedProxies: [],
      allowedTriggers: ["github.*"],
    });
    const response = await request(reconcile({ active: false, subscriptionId: id }), other.token);
    expect(response.status).toBe(404);
    expect(hooks).toHaveLength(1);
  });

  it("verifies nonce and signature, exposes opaque state, and retires old callbacks after recreation", async () => {
    const id = await subscription();
    const record = (await database.triggerStore.getFlowTrigger(id))!;
    const raw = JSON.stringify({ action: "opened", issue: { number: 7 } });
    const receive = {
      operation: "receive",
      subscriptionId: id,
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-github-event": "issues",
        "x-github-delivery": "delivery-7",
        "x-hub-signature-256": `sha256=${createHmac("sha256", record.callbackSecret).update(raw).digest("hex")}`,
      },
      query: { connector_subscription: record.callbackNonce },
      rawBody: Buffer.from(raw).toString("base64"),
      admit: true,
      current: true,
    };
    const response = await request(receive);
    expect(response.status).toBe(200);
    const data = (await response.json()).data;
    expect(data.result).toMatchObject({ outcome: "event", dedupeKey: "delivery-7" });
    expect(data.subscription).toEqual({ id });
    expect(JSON.stringify(data)).not.toContain(record.callbackSecret);
    expect((await (await request({ ...receive, query: {} })).json()).data.result).toMatchObject({
      outcome: "respond",
      status: 404,
    });
    expect((await request(reconcile({ active: false, subscriptionId: id }))).status).toBe(200);
    expect(hooks).toHaveLength(0);
    await subscription();
    expect((await (await request(receive)).json()).data.result).toMatchObject({ outcome: "respond", status: 404 });
  });

  it("retains failed cleanup after revocation, allows same-account recovery, and supports explicit abandonment", async () => {
    const id = await subscription();
    failDelete = true;
    await database.runtimeTokenStore.revoke(tokenId);
    const maintenanceNow = Date.now() + 60_001;
    vi.spyOn(Date, "now").mockReturnValue(maintenanceNow);
    await connector.triggerMaintenance.run();
    expect((await database.triggerStore.getFlowTrigger(id))?.status).toBe("deleting");
    await expect(database.connectionStore.delete("github", "work")).rejects.toMatchObject({
      code: "connection_has_subscriptions",
    });
    const recovered = await database.connectionStore.set("github", "work", credential("renewed-key", "work-account"));
    expect(recovered.id).toBe(connectionId);
    await connector.triggerMaintenance.cancel(id, new AbortController().signal).catch(() => undefined);
    expect(calls.at(-1)?.key).toBe("renewed-key");
    const abandoned = await connector.app.request(`/api/trigger-subscriptions/${encodeURIComponent(id)}/abandon`, {
      method: "POST",
      headers: { authorization: "Bearer admin" },
    });
    expect(abandoned.status).toBe(200);
    await database.connectionStore.delete("github", "work");
    expect((await database.triggerStore.getFlowTrigger(id))?.status).toBe("abandoned");
    expect(hooks).toHaveLength(1);
  });

  it("shares Feishu resources per account and cleans only after the final owner's demand is released", async () => {
    const app = await database.connectionStore.set("feishu_app_bot", "work", credential("feishu-key", "cli_verified"));
    const body = {
      operation: "resource",
      config: {
        sourceId: `source_${"a".repeat(32)}`,
        eventTypes: ["drive.file.edit_v1"],
        resource: { kind: "document", id: "document-id", documentType: "docx" },
      },
      active: true,
      requestKey: "first",
    };
    expect((await request(body, token, app.id, "feishu_app_bot", "feishu_app_bot.on_event")).status).toBe(200);
    expect(
      (await request({ ...body, requestKey: "second" }, token, app.id, "feishu_app_bot", "feishu_app_bot.on_event"))
        .status,
    ).toBe(200);
    expect(calls.filter((call) => call.service === "feishu_app_bot")).toHaveLength(1);
    expect(
      (await request({ ...body, active: false }, token, app.id, "feishu_app_bot", "feishu_app_bot.on_event")).status,
    ).toBe(200);
    expect(calls.filter((call) => call.request.method === "DELETE")).toHaveLength(0);
    expect(
      (
        await request(
          { ...body, requestKey: "second", active: false },
          token,
          app.id,
          "feishu_app_bot",
          "feishu_app_bot.on_event",
        )
      ).status,
    ).toBe(200);
    expect(calls.filter((call) => call.request.method === "DELETE")).toHaveLength(1);
    const apps = await connector.app.request("/v1/apps", { headers: { authorization: `Bearer ${token}` } });
    expect((await apps.json()).data.find((item: { id: string }) => item.id === app.id).providerAccountId).toBe(
      "cli_verified",
    );
  });

  it.each(["release", "abandon"])("shares Feishu demand across aliases and tokens through $0", async (mode) => {
    const first = await database.connectionStore.set("feishu_app_bot", "first", credential("first-key", "cli_shared"));
    const second = await database.connectionStore.set(
      "feishu_app_bot",
      "second",
      credential("second-key", "cli_shared"),
    );
    const other = await new RuntimeTokenService(database.runtimeTokenStore).createToken("Second owner", {
      allowedActions: [],
      blockedActions: ["*"],
      allowedProxies: [],
      allowedTriggers: ["feishu_app_bot.on_event"],
      allowedConnections: [second.id],
    });
    const body = {
      operation: "resource",
      config: {
        sourceId: `source_${"a".repeat(32)}`,
        eventTypes: ["drive.file.edit_v1"],
        resource: { kind: "document", id: "shared-document", documentType: "docx" },
      },
      active: true,
      requestKey: "same-binding-key",
    };
    const execute = (id: string, bearer: string, active: boolean) =>
      request({ ...body, active }, bearer, id, "feishu_app_bot", "feishu_app_bot.on_event");
    expect((await execute(first.id, other.token, true)).status).toBe(403);
    expect((await execute(first.id, token, true)).status).toBe(200);
    expect((await execute(second.id, other.token, true)).status).toBe(200);
    expect(calls.filter((call) => call.service === "feishu_app_bot")).toHaveLength(1);
    const consumers = (await database.triggerStore.list()).filter((record) => record.mode === "resource");
    expect(consumers).toHaveLength(2);
    expect(new Set(consumers.map((record) => record.tokenId))).toEqual(new Set([tokenId, other.record.id]));
    if (mode === "abandon") {
      await connector.triggerMaintenance.abandon(
        consumers.find((record) => record.connectionId === first.id)!.id,
        new AbortController().signal,
      );
    } else expect((await execute(first.id, token, false)).status).toBe(200);
    expect(calls.filter((call) => call.request.method === "DELETE")).toHaveLength(0);
    await database.connectionStore.delete("feishu_app_bot", "first");
    expect((await execute(second.id, other.token, false)).status).toBe(200);
    expect(calls.filter((call) => call.request.method === "DELETE")).toMatchObject([{ key: "second-key" }]);
  });

  it("keeps the same Feishu resource separate for different provider accounts", async () => {
    const first = await database.connectionStore.set("feishu_app_bot", "first", credential("first-key", "cli_first"));
    const second = await database.connectionStore.set(
      "feishu_app_bot",
      "second",
      credential("second-key", "cli_second"),
    );
    const body = {
      operation: "resource",
      config: {
        sourceId: `source_${"a".repeat(32)}`,
        eventTypes: ["drive.file.edit_v1"],
        resource: { kind: "document", id: "same-document", documentType: "docx" },
      },
      active: true,
      requestKey: "binding-key",
    };
    for (const connection of [first, second]) {
      expect((await request(body, token, connection.id, "feishu_app_bot", "feishu_app_bot.on_event")).status).toBe(200);
    }
    expect(calls.filter((call) => call.service === "feishu_app_bot")).toHaveLength(2);
    expect(
      (await request({ ...body, active: false }, token, first.id, "feishu_app_bot", "feishu_app_bot.on_event")).status,
    ).toBe(200);
    expect(calls.filter((call) => call.request.method === "DELETE")).toMatchObject([{ key: "first-key" }]);
  });

  it("rebuilds a released Feishu binding after same-account reauthorization with the current revision", async () => {
    const first = await database.connectionStore.set("feishu_app_bot", "work", credential("old-key", "cli_verified"));
    const body = {
      operation: "resource",
      config: {
        sourceId: `source_${"a".repeat(32)}`,
        eventTypes: ["drive.file.edit_v1"],
        resource: { kind: "document", id: "first-document", documentType: "docx" },
      },
      active: true,
      requestKey: "binding-key",
    };
    const execute = (input: unknown) => request(input, token, first.id, "feishu_app_bot", "feishu_app_bot.on_event");
    expect((await execute(body)).status).toBe(200);
    expect((await execute({ ...body, active: false })).status).toBe(200);
    const renewed = await database.connectionStore.set("feishu_app_bot", "work", credential("new-key", "cli_verified"));
    expect(renewed.id).toBe(first.id);
    expect(renewed.revision).not.toBe(first.revision);
    const rebuilt = {
      ...body,
      config: { ...body.config, resource: { ...body.config.resource, id: "second-document" } },
    };
    expect((await execute(rebuilt)).status).toBe(200);
    expect((await execute(rebuilt)).status).toBe(200);
    expect(calls.filter((call) => call.key === "new-key")).toMatchObject([
      { request: { endpoint: "/drive/v1/files/second-document/subscribe" } },
    ]);
    expect((await execute({ ...rebuilt, active: false })).status).toBe(200);
    expect(calls.at(-1)).toMatchObject({
      key: "new-key",
      request: { method: "DELETE", endpoint: "/drive/v1/files/second-document/delete_subscribe" },
    });
  });
});
