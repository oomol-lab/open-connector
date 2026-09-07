import type { CredentialValidators, ProviderDefinition } from "../../core/types.ts";
import type { ProviderOAuthRuntime } from "../../oauth/oauth-token.ts";

import { afterEach, describe, expect, it, vi } from "vitest";
import { createCatalogStore } from "../../catalog-store.ts";
import { provider as githubProvider } from "../../providers/github/definition.ts";
import { ProviderLoader } from "../../providers/provider-loader.ts";
import { createConnectApp } from "../connect-app.ts";
import { TransitFileService } from "../files/transit-files.ts";
import { PlainTextSecretCodec } from "../secrets/secret-codec-core.ts";
import { SqliteRuntimeDatabase } from "../storage/sqlite-runtime-store.ts";

const provider: ProviderDefinition = {
  service: "example",
  displayName: "Example",
  categories: [],
  authTypes: ["oauth2", "api_key", "custom_credential"],
  auth: [
    {
      type: "oauth2",
      authorizationUrl: "https://example.com/authorize",
      tokenUrl: "https://example.com/token",
      scopes: ["read"],
      tokenEndpointAuthMethod: "client_secret_post",
    },
    { type: "api_key", label: "API key" },
    {
      type: "custom_credential",
      fields: [{ key: "password", label: "Password", inputType: "password", required: true, secret: true }],
    },
  ],
  actions: [],
};
const databases: SqliteRuntimeDatabase[] = [];
afterEach(() => {
  vi.useRealTimers();
  for (const database of databases.splice(0)) database.close();
});

async function setup(
  exchangeCode?: ProviderOAuthRuntime["exchangeCode"],
  auth: { adminToken?: string; runtimeToken?: string } = {},
  definition: ProviderDefinition = provider,
  credentialValidators?: CredentialValidators,
) {
  const database = new SqliteRuntimeDatabase(":memory:");
  databases.push(database);
  await database.oauthClientConfigStore.set({
    service: "example",
    clientId: "client",
    clientSecret: "secret",
    extra: {},
    secretExtra: {},
  });
  const { app } = await createConnectApp({
    catalog: createCatalogStore([definition]),
    runtimeDatabase: database,
    providerLoader: new ProviderLoader({
      example: async () => ({
        executors: {},
        credentialValidators,
        oauth: {
          exchangeCode:
            exchangeCode ??
            (async () => ({ accessToken: "access-secret", tokenType: "Bearer", metadata: { scope: "read" } })),
        },
      }),
    }),
    transitFiles: new TransitFileService({
      rootDir: ".tmp/connection-tests",
      publicOrigin: "http://localhost",
      ttlSeconds: 60,
      maxBytes: 1024,
    }),
    publicOrigin: "http://localhost",
    secretCodec: new PlainTextSecretCodec(),
    ...auth,
  });
  const call = async (path: string, body?: unknown, token = auth.adminToken) =>
    app.request(path, {
      method: body === undefined ? "GET" : "POST",
      headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const start = async () => (await (await call("/v1/connections/example/connect", {})).json()).data;
  return { app, database, call, start };
}

describe("shared personal connection API", () => {
  it("returns an independent request ID and persists the exact connected app after callback consumption", async () => {
    const { call, start, database } = await setup();
    const request = await start();
    expect(request).toMatchObject({
      status: "initiated",
      authorizationUrl: expect.any(String),
      expiresAt: expect.any(String),
    });
    expect(request.connectionRequestId).not.toBe(request.stateHandle);
    const poll = `/v1/connection-requests/${request.connectionRequestId}`;
    expect((await (await call(poll)).json()).data.status).toBe("initiated");
    expect((await call(`/oauth/callback?state=${request.stateHandle}&code=code`)).status).toBe(200);
    const response = await call(poll);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const result = (await response.json()).data;
    expect(result).toMatchObject({ status: "connected", errorCode: null, appId: expect.any(String) });
    expect((await database.connectionStore.list())[0].id).toBe(result.appId);
    const detail = (await (await call(`/v1/connections/by-id/${result.appId}`)).json()).data;
    expect(detail).toMatchObject({ id: result.appId, status: "active", authType: "oauth2" });
    expect(JSON.stringify(detail)).not.toContain("access-secret");
    expect((await call(`/oauth/callback?state=${request.stateHandle}&code=again`)).status).toBe(400);
    expect((await (await call(poll)).json()).data).toEqual(result);
  });

  it("supersedes unclaimed requests and records denied authorization without upstream secrets", async () => {
    const { call, start } = await setup();
    const first = await start();
    const second = await start();
    expect((await (await call(`/v1/connection-requests/${first.connectionRequestId}`)).json()).data).toMatchObject({
      status: "failed",
      errorCode: "request_superseded",
    });
    expect((await call(`/oauth/callback?state=${first.stateHandle}&code=old`)).status).toBe(400);
    await call(`/oauth/callback?state=${second.stateHandle}&error=access_denied&error_description=secret-value`);
    const result = (await (await call(`/v1/connection-requests/${second.connectionRequestId}`)).json()).data;
    expect(result).toMatchObject({ status: "failed", errorCode: "invalid_input", appId: null });
    expect(JSON.stringify(result)).not.toContain("secret-value");
  });

  it("expires pending requests and keeps terminal results for the retention window", async () => {
    vi.useFakeTimers();
    const { call, start } = await setup();
    const request = await start();
    vi.setSystemTime(Date.parse(request.expiresAt));
    expect((await (await call(`/v1/connection-requests/${request.connectionRequestId}`)).json()).data.status).toBe(
      "expired",
    );
    expect((await call(`/oauth/callback?state=${request.stateHandle}&code=late`)).status).toBe(400);
    vi.setSystemTime(Date.parse(request.expiresAt) + 86_400_000);
    const expired = await call(`/v1/connection-requests/${request.connectionRequestId}`);
    expect(expired.status).toBe(404);
    expect((await expired.json()).errorCode).toBe("connection_request_not_found");
  });

  it("creates distinct API-key connections and replaces credentials without changing the ID", async () => {
    const { call, database } = await setup();
    const create = async (apiKey: string) =>
      (await (await call("/v1/connections/example/connect/api-key", { apiKey, comment: "My key" })).json()).data;
    const first = await create("first");
    const second = await create("second");
    expect(first.id).not.toBe(second.id);
    const replaced = (
      await (
        await call(`/v1/connections/by-id/${first.id}/connect/api-key`, { apiKey: "replacement", comment: null })
      ).json()
    ).data;
    expect(replaced).toMatchObject({ id: first.id, comment: null });
    expect((await database.connectionStore.list()).find((item) => item.id === first.id)?.credential).toMatchObject({
      apiKey: "replacement",
    });
    expect((await call("/v1/connections/by-id/missing/connect/api-key", { apiKey: "x" })).status).toBe(404);
    expect((await call("/v1/connections/example/connect/api-key", { apiKey: 123 })).status).toBe(400);
    expect(
      (await call("/v1/connections/example/connect/custom-credential", { values: { password: "secret" } })).status,
    ).toBe(200);
  });

  it("keeps the original app ID when OAuth is reconnected", async () => {
    const { call, start } = await setup();
    const first = await start();
    await call(`/oauth/callback?state=${first.stateHandle}&code=first`);
    const appId = (await (await call(`/v1/connection-requests/${first.connectionRequestId}`)).json()).data.appId;
    const reconnect = (await (await call(`/v1/connections/by-id/${appId}/connect`, {})).json()).data;
    await call(`/oauth/callback?state=${reconnect.stateHandle}&code=second`);
    expect((await (await call(`/v1/connection-requests/${reconnect.connectionRequestId}`)).json()).data).toMatchObject({
      status: "connected",
      appId,
    });
  });

  it("does not recreate a connection deleted while its reconnect request was pending", async () => {
    const { call, start, database } = await setup();
    const first = await start();
    await call(`/oauth/callback?state=${first.stateHandle}&code=first`);
    const original = (await database.connectionStore.list())[0];
    const reconnect = (await (await call(`/v1/connections/by-id/${original.id}/connect`, {})).json()).data;
    await database.connectionStore.delete(original.service, original.connectionName);
    expect((await call(`/oauth/callback?state=${reconnect.stateHandle}&code=second`)).status).toBe(400);
    expect(await database.connectionStore.list()).toEqual([]);
    expect((await (await call(`/v1/connection-requests/${reconnect.connectionRequestId}`)).json()).data.status).toBe(
      "failed",
    );
  });

  it("requires management credentials even when an execution token is valid", async () => {
    const { call } = await setup(undefined, { adminToken: "admin", runtimeToken: "runtime" });
    expect((await call("/v1/connections", undefined, "runtime")).status).toBe(401);
    expect((await call("/v1/connections")).status).toBe(200);
    const restricted = await setup(undefined, { runtimeToken: "runtime" });
    expect((await restricted.call("/v1/connections", undefined, "runtime")).status).toBe(403);
  });

  it("records a safe failure when token exchange fails", async () => {
    const { call, start } = await setup(async () => {
      throw new Error("secret-token");
    });
    const request = await start();
    await call(`/oauth/callback?state=${request.stateHandle}&code=code`);
    const result = (await (await call(`/v1/connection-requests/${request.connectionRequestId}`)).json()).data;
    expect(result).toMatchObject({ status: "failed", errorCode: "provider_error" });
    expect(JSON.stringify(result)).not.toContain("secret-token");
  });
});

it("applies declared authorization options and always includes required scopes", async () => {
  const { call } = await setup(undefined, {}, { ...githubProvider, service: "example", actions: [] });
  const response = await call("/v1/connections/example/connect", { authorizationOptionIds: ["repo"] });
  expect(response.status).toBe(200);
  const url = new URL((await response.json()).data.authorizationUrl);
  expect(url.searchParams.get("scope")).toBe("read:user repo");
  const invalid = await call("/v1/connections/example/connect", { authorizationOptionIds: ["unknown"] });
  expect(invalid.status).toBe(400);
  expect((await invalid.json()).errorCode).toBe("invalid_input");
});

it("fails a request when the provider does not grant its required authorization scope", async () => {
  const { call } = await setup(undefined, {}, { ...githubProvider, service: "example", actions: [] });
  const request = (await (await call("/v1/connections/example/connect", { authorizationOptionIds: [] })).json()).data;
  await call(`/oauth/callback?state=${request.stateHandle}&code=code`);
  expect((await (await call(`/v1/connection-requests/${request.connectionRequestId}`)).json()).data).toMatchObject({
    status: "failed",
    errorCode: "scope_missing",
  });
});

it("returns to the caller with success and safe failure parameters", async () => {
  const { call } = await setup();
  const create = async () =>
    (await (await call("/v1/connections/example/connect", { returnUri: "https://client.example/done?keep=1" })).json())
      .data;
  const success = await create();
  const response = await call(`/oauth/callback?state=${success.stateHandle}&code=code`);
  expect(response.status).toBe(302);
  const successUrl = new URL(response.headers.get("location")!);
  expect(Object.fromEntries(successUrl.searchParams)).toEqual({ keep: "1", status: "success", service: "example" });
  const denied = await create();
  const failure = await call(
    `/oauth/callback?state=${denied.stateHandle}&error=access_denied&error_description=secret`,
  );
  expect(failure.status).toBe(302);
  const failureUrl = new URL(failure.headers.get("location")!);
  expect(failureUrl.searchParams.get("status")).toBe("error");
  expect(failureUrl.searchParams.get("code")).toBe("invalid_input");
  expect(failureUrl.toString()).not.toContain("secret");
  expect((await call("/v1/connections/example/connect", { returnUri: "javascript:alert(1)" })).status).toBe(400);
});

it("lets a claimed callback finish after expiry and a newer request", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  const started = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const { call, start } = await setup(async () => {
    started.resolve();
    await release.promise;
    return { accessToken: "secret", tokenType: "Bearer", metadata: {} };
  });
  const first = await start();
  const callback = call(`/oauth/callback?state=${first.stateHandle}&code=code`);
  await started.promise;
  const second = await start();
  expect((await (await call(`/v1/connection-requests/${first.connectionRequestId}`)).json()).data.status).toBe(
    "initiated",
  );
  vi.setSystemTime(Date.parse(first.expiresAt) + 1);
  expect((await (await call(`/v1/connection-requests/${first.connectionRequestId}`)).json()).data.status).toBe(
    "expired",
  );
  release.resolve();
  expect((await callback).status).toBe(200);
  expect((await (await call(`/v1/connection-requests/${first.connectionRequestId}`)).json()).data.status).toBe(
    "connected",
  );
  expect((await (await call(`/v1/connection-requests/${second.connectionRequestId}`)).json()).data.status).toBe(
    "expired",
  );
});

it("does not save credentials when a callback is cancelled during token exchange", async () => {
  const started = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const { app, start, database, call } = await setup(async () => {
    started.resolve();
    await release.promise;
    return { accessToken: "secret", tokenType: "Bearer", metadata: {} };
  });
  const request = await start();
  const abort = new AbortController();
  const callback = app.request(`/oauth/callback?state=${request.stateHandle}&code=code`, { signal: abort.signal });
  await started.promise;
  abort.abort();
  release.resolve();
  await callback;
  expect(await database.connectionStore.list()).toEqual([]);
  expect((await (await call(`/v1/connection-requests/${request.connectionRequestId}`)).json()).data.status).toBe(
    "failed",
  );
});

it("reports current reauthorization needs separately from a successful request", async () => {
  const { call, start } = await setup(async () => ({
    accessToken: "secret",
    tokenType: "Bearer",
    expiresAt: new Date(Date.now() - 1000).toISOString(),
    metadata: {},
  }));
  const request = await start();
  await call(`/oauth/callback?state=${request.stateHandle}&code=code`);
  const result = (await (await call(`/v1/connection-requests/${request.connectionRequestId}`)).json()).data;
  expect(result.status).toBe("connected");
  expect((await (await call(`/v1/connections/by-id/${result.appId}`)).json()).data.status).toBe("reauth_required");
  expect((await (await call("/v1/connections?status=active")).json()).data).toEqual([]);
  expect((await (await call("/v1/connections?status=reauth_required")).json()).data).toHaveLength(1);
});

it("preserves existing credentials when provider validation rejects a replacement", async () => {
  const { call, database } = await setup(undefined, {}, provider, {
    apiKey: async ({ apiKey }) => {
      if (apiKey === "bad") throw new Error("Rejected credentials");
    },
    oauth2: async () => {
      throw new Error("Rejected OAuth token");
    },
  });
  const original = (await (await call("/v1/connections/example/connect/api-key", { apiKey: "valid" })).json()).data;
  expect((await call(`/v1/connections/by-id/${original.id}/connect/api-key`, { apiKey: "bad" })).status).toBe(400);
  expect((await database.connectionStore.list())[0].credential).toMatchObject({ apiKey: "valid" });
  const request = (await (await call("/v1/connections/example/connect", {})).json()).data;
  await call(`/oauth/callback?state=${request.stateHandle}&code=code`);
  expect((await (await call(`/v1/connection-requests/${request.connectionRequestId}`)).json()).data.status).toBe(
    "failed",
  );
  expect(await database.connectionStore.list()).toHaveLength(1);
});

it("does not overwrite credentials when a synchronous replacement loses a validation race", async () => {
  const started = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const { call, database } = await setup(undefined, {}, provider, {
    apiKey: async ({ apiKey }) => {
      if (apiKey === "slow") {
        started.resolve();
        await release.promise;
      }
    },
  });
  const original = (await (await call("/v1/connections/example/connect/api-key", { apiKey: "original" })).json()).data;
  const pending = call(`/v1/connections/by-id/${original.id}/connect/api-key`, { apiKey: "slow" });
  await started.promise;
  expect((await call(`/v1/connections/by-id/${original.id}/connect/api-key`, { apiKey: "winner" })).status).toBe(200);
  release.resolve();
  const conflict = await pending;
  expect(conflict.status).toBe(409);
  expect((await conflict.json()).errorCode).toBe("request_key_conflict");
  expect((await database.connectionStore.list())[0].credential).toMatchObject({ apiKey: "winner" });
});
