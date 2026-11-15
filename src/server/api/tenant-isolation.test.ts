import type { ActionDefinition, ProviderDefinition } from "../../core/types.ts";

import { afterEach, describe, expect, it, vi } from "vitest";
import { createCatalogStore } from "../../catalog-store.ts";
import { ProviderLoader } from "../../providers/provider-loader.ts";
import { createConnectApp } from "../connect-app.ts";
import { TransitFileService } from "../files/transit-files.ts";
import { PlainTextSecretCodec } from "../secrets/secret-codec-core.ts";
import { SqliteRuntimeDatabase } from "../storage/sqlite/runtime-store.ts";

const ADMIN = "admin-secret";

const TOKEN_POLICY = {
  allowedActions: ["*"],
  blockedActions: [],
  allowedProxies: ["*"],
  allowedConnections: ["*"],
  allowedTriggers: ["*"],
};

const echoAction: ActionDefinition = {
  id: "example.echo",
  service: "example",
  name: "echo",
  description: "Echo input.",
  operationType: "write",
  requiredScopes: [],
  providerPermissions: [],
  inputSchema: { type: "object" },
  outputSchema: { type: "object" },
};

const provider: ProviderDefinition = {
  service: "example",
  displayName: "Example",
  categories: [],
  authTypes: ["api_key", "oauth2"],
  auth: [
    { type: "api_key", label: "API key" },
    {
      type: "oauth2",
      authorizationUrl: "https://example.com/oauth/authorize",
      tokenUrl: "https://example.com/oauth/token",
      scopes: ["read"],
      tokenEndpointAuthMethod: "client_secret_post",
    },
  ],
  actions: [echoAction],
};

const databases: SqliteRuntimeDatabase[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  for (const database of databases.splice(0)) database.close();
});

interface CallOptions {
  method?: string;
  body?: unknown;
  token?: string;
}

async function setup() {
  const database = new SqliteRuntimeDatabase(":memory:");
  databases.push(database);
  const { app } = await createConnectApp({
    catalog: createCatalogStore([provider], { executableActionIds: [echoAction.id] }),
    providerLoader: new ProviderLoader({ example: async () => ({ executors: {} }) }),
    runtimeDatabase: database,
    publicOrigin: "http://localhost",
    configuredOrigin: "http://localhost",
    secretCodec: new PlainTextSecretCodec(),
    adminToken: ADMIN,
    transitFiles: new TransitFileService({
      rootDir: ".tmp/tenant-isolation-tests",
      publicOrigin: "http://localhost",
      ttlSeconds: 60,
      maxBytes: 1024,
    }),
  });
  const call = (path: string, input: CallOptions = {}) =>
    app.request(path, {
      method: input.method ?? (input.body === undefined ? "GET" : "POST"),
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${input.token ?? ADMIN}`,
      },
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
    });
  const mint = async (tenant: string, name = `${tenant}-token`) => {
    const created = await call(`/api/runtime-tokens?tenant=${tenant}`, {
      body: { name, ...TOKEN_POLICY },
    });
    if (created.status !== 200) throw new Error("PUT failed: " + (await created.text()));
    return ((await created.json()) as { token: string }).token;
  };
  return { app, database, call, mint };
}

function appRequest(
  app: { request(input: string, init?: RequestInit): Promise<Response> | Response },
  path: string,
  token: string,
  extraHeaders: Record<string, string> = {},
  body?: unknown,
): Promise<Response> {
  return Promise.resolve(
    app.request(path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
        ...extraHeaders,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
}

describe("tenant isolation (real service graph)", () => {
  it("lists and manages runtime tokens only inside their own tenant", async () => {
    const { call, mint } = await setup();
    await mint("alpha");
    await mint("beta");

    const alphaList = await call("/api/runtime-tokens?tenant=alpha");
    const alphaTokens = (await alphaList.json()) as { id: string; name: string }[];
    expect(alphaTokens).toHaveLength(1);
    expect(alphaTokens[0].name).toBe("alpha-token");

    const betaList = await call("/api/runtime-tokens?tenant=beta");
    const betaTokens = (await betaList.json()) as { id: string }[];
    expect(betaTokens).toHaveLength(1);
    expect(betaTokens[0].id).not.toBe(alphaTokens[0].id);

    // Local and cross-tenant lookups see nothing of the other tenant.
    await expect((await call("/api/runtime-tokens")).json()).resolves.toEqual([]);
    expect(
      (await call(`/api/runtime-tokens/${alphaTokens[0].id}?tenant=beta`, { method: "PUT", body: TOKEN_POLICY }))
        .status,
    ).toBe(404);
    expect((await call(`/api/runtime-tokens/${alphaTokens[0].id}?tenant=beta`, { method: "DELETE" })).status).toBe(404);
    // The row survives under its own tenant.
    await expect((await call("/api/runtime-tokens?tenant=alpha")).json()).resolves.toHaveLength(1);
  });

  it("binds a tenant token to its tenant and rejects a mismatched selector", async () => {
    const { app, call, mint } = await setup();
    const token = await mint("alpha");

    expect((await call("/v1/actions", { token })).status).toBe(200);
    // A runtime grant cannot select a different tenant than it was minted for.
    const mismatched = await call("/v1/actions?tenant=beta", { token });
    expect(mismatched.status).toBe(403);
    expect(await mismatched.json()).toMatchObject({ error: { code: "tenant_conflict" } });
    // The header selector conflicts the same way.
    const headerMismatch = await call("/v1/actions?tenant=alpha", { token });
    expect(headerMismatch.status).toBe(200);
    const headerOnly = await appRequest(app, "/v1/actions", token, { "x-connect-tenant": "beta" });
    expect(headerOnly.status).toBe(403);
  });

  it("keeps connections and connection requests invisible across tenants", async () => {
    const { call } = await setup();
    // Console create API writes a connection under the selected tenant.
    const created = await call("/api/connections/example?tenant=alpha", {
      method: "PUT",
      body: { authType: "api_key", values: { apiKey: "alpha-secret" } },
    });
    if (created.status !== 200) throw new Error("PUT failed: " + (await created.text()));

    const alphaConnections = (await (await call("/api/connections?tenant=alpha")).json()) as unknown[];
    expect(alphaConnections).toHaveLength(1);
    expect(await (await call("/api/connections?tenant=beta")).json()).toEqual([]);
    expect(await (await call("/api/connections")).json()).toEqual([]);

    // OAuth client config is tenant-scoped too.
    expect(
      (
        await call("/api/oauth/configs/example?tenant=alpha", {
          method: "PUT",
          body: { clientId: "id", clientSecret: "secret", extra: {} },
        })
      ).status,
    ).toBe(200);
    const alphaConfigs = (await (await call("/api/oauth/configs?tenant=alpha")).json()) as {
      service: string;
      configured: boolean;
      clientId: string | null;
    }[];
    expect(alphaConfigs.find((config) => config.service === "example")).toMatchObject({
      configured: true,
      clientId: "id",
    });
    const betaConfigs = (await (await call("/api/oauth/configs?tenant=beta")).json()) as {
      service: string;
      configured: boolean;
      clientId: string | null;
    }[];
    // The provider exists in every tenant's catalog, but its stored config does not.
    expect(betaConfigs.find((config) => config.service === "example")).toMatchObject({
      configured: false,
      clientId: null,
    });
  });

  it("keeps connection requests invisible across tenants", async () => {
    const { call } = await setup();
    await call("/api/oauth/configs/example?tenant=alpha", {
      method: "PUT",
      body: { clientId: "id", clientSecret: "secret" },
    });
    const started = await call("/v1/connections/example/connect?tenant=alpha", { body: {} });
    expect(started.status).toBe(200);
    const request = ((await started.json()) as { data: { connectionRequestId: string } }).data;

    const poll = (tenant: string | undefined) =>
      call(`/v1/connection-requests/${request.connectionRequestId}${tenant ? `?tenant=${tenant}` : ""}`);
    expect((await poll("alpha")).status).toBe(200);
    expect((await poll("beta")).status).toBe(404);
    expect((await poll(undefined)).status).toBe(404);
  });

  it("does not replay or conflict idempotency claims across tenants", async () => {
    const { app, mint } = await setup();
    const alpha = await mint("alpha");
    const beta = await mint("beta");

    const first = await appRequest(
      app,
      "/v1/actions/example.echo",
      alpha,
      { "idempotency-key": "shared-key" },
      {
        input: { marker: "alpha-1" },
      },
    );
    expect(first.status).not.toBe(401);
    const firstBody = await first.json();

    // Same key + different input in the SAME tenant is a conflict.
    const conflict = await appRequest(
      app,
      "/v1/actions/example.echo",
      alpha,
      { "idempotency-key": "shared-key" },
      {
        input: { marker: "alpha-2" },
      },
    );
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toMatchObject({ errorCode: "idempotency_key_conflict" });

    // Same key + different input in ANOTHER tenant is an independent claim.
    const betaRun = await appRequest(
      app,
      "/v1/actions/example.echo",
      beta,
      { "idempotency-key": "shared-key" },
      {
        input: { marker: "beta-1" },
      },
    );
    expect(betaRun.status).not.toBe(409);
    const betaBody = await betaRun.json();

    // Replays stay inside their tenant: alpha replays alpha's, beta replays beta's.
    const alphaReplay = await appRequest(
      app,
      "/v1/actions/example.echo",
      alpha,
      { "idempotency-key": "shared-key" },
      {
        input: { marker: "alpha-1" },
      },
    );
    expect(await alphaReplay.json()).toEqual(firstBody);
    const betaReplay = await appRequest(
      app,
      "/v1/actions/example.echo",
      beta,
      { "idempotency-key": "shared-key" },
      {
        input: { marker: "beta-1" },
      },
    );
    expect(await betaReplay.json()).toEqual(betaBody);
  });

  it("scopes run logs to the tenant that produced them", async () => {
    const { call, mint } = await setup();
    const alpha = await mint("alpha");
    const beta = await mint("beta");
    for (const token of [alpha, beta]) {
      await call("/v1/actions/example.echo", {
        token,
        method: "POST",
        body: { input: {} },
      });
    }
    const alphaRuns = (await (await call("/api/runs?tenant=alpha")).json()) as { items: unknown[] };
    const betaRuns = (await (await call("/api/runs?tenant=beta")).json()) as { items: unknown[] };
    expect(alphaRuns.items).toHaveLength(1);
    expect(betaRuns.items).toHaveLength(1);
    // Local produced nothing.
    expect(((await (await call("/api/runs")).json()) as { items: unknown[] }).items).toHaveLength(0);
  });

  it("keeps every tenant-scoped table's rows inside its own scope", async () => {
    const { database } = await setup();
    const alpha = database.forTenant("alpha");
    const beta = database.forTenant("beta");
    const instance = database.forInstance();
    const now = new Date().toISOString();

    // Seed the same logical entities in two tenants.
    for (const [db, marker] of [
      [alpha, "alpha"],
      [beta, "beta"],
    ] as const) {
      await db.oauthClientConfigStore.set({
        service: "example",
        clientId: `${marker}-client`,
        clientSecret: "secret",
        extra: {},
        secretExtra: {},
      });
      await db.idempotencyStore.claim({
        keyHash: "same-key",
        claimId: `claim-${marker}`,
        requestHash: `hash-${marker}`,
        now,
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      });
    }

    // Instance view sees both; each tenant sees exactly its own.
    expect(await instance.oauthClientConfigStore.get("example")).toBeDefined();
    expect((await alpha.oauthClientConfigStore.get("example"))?.clientId).toBe("alpha-client");
    expect((await beta.oauthClientConfigStore.get("example"))?.clientId).toBe("beta-client");
    expect(await database.oauthClientConfigStore.get("example")).toBeUndefined();
  });
});
