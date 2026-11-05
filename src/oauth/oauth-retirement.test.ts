import type { ProviderHttpAttempt, ProviderHttpDispatchOptions } from "../core/provider-http-dispatch.ts";
import type { ProviderDefinition } from "../core/types.ts";
import type { PGliteTestServer } from "../server/storage/postgres/test-database.ts";
import type { RuntimeDatabase } from "../server/storage/runtime-database.ts";

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Pool } from "pg";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createCatalogStore } from "../catalog-store.ts";
import { ConnectionService } from "../connection-service.ts";
import { withRuntimeExecution } from "../core/runtime-execution.ts";
import { provider as githubProvider } from "../providers/github/definition.ts";
import { githubOAuthRuntime } from "../providers/github/oauth.ts";
import { ProviderLoader } from "../providers/provider-loader.ts";
import { D1RuntimeDatabase } from "../server/storage/d1/runtime-store.ts";
import { SqliteD1Database } from "../server/storage/d1/test-database.ts";
import { migratePostgresDatabase } from "../server/storage/postgres/migrations.ts";
import { PostgresRuntimeDatabase } from "../server/storage/postgres/runtime-store.ts";
import { startPGliteTestServer } from "../server/storage/postgres/test-database.ts";
import { SqliteRuntimeDatabase } from "../server/storage/sqlite/runtime-store.ts";
import { oauthAuthorizationKey } from "./oauth-authorization-key.ts";
import { OAuthClientConfigService } from "./oauth-client-config-service.ts";
import { OAuthCredentialRefreshService } from "./oauth-credential-refresh-service.ts";
import { OAuthFlowService } from "./oauth-flow-service.ts";

const provider: ProviderDefinition = {
  service: "example",
  displayName: "Example",
  categories: ["Developer Tools"],
  authTypes: ["oauth2"],
  auth: [
    {
      type: "oauth2",
      authorizationUrl: "https://example.com/authorize",
      tokenUrl: "https://example.com/token",
      scopes: ["read"],
      tokenEndpointAuthMethod: "client_secret_post",
    },
  ],
  actions: [],
};

interface RuntimeFixture {
  first: RuntimeDatabase;
  openSecond(): Promise<RuntimeDatabase>;
  close(): Promise<void>;
}

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  vi.unstubAllGlobals();
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

describe("OAuth retirement across runtime sessions", () => {
  it.each([
    { scope: "standalone", denyCleanup: false },
    { scope: "action", denyCleanup: false },
    { scope: "action", denyCleanup: true },
  ])(
    "binds orphaned token cleanup to its stored connection ($scope, deny cleanup: $denyCleanup)",
    async ({ scope, denyCleanup }) => {
      const fixture = await openFixture("sqlite");
      cleanups.push(() => fixture.close());
      const catalog = createCatalogStore([githubProvider]);
      const providerLoader = new ProviderLoader({ github: async () => ({ executors: {}, oauth: githubOAuthRuntime }) });
      const clientConfigs = new OAuthClientConfigService({
        catalog,
        origin: "https://runtime.example.com",
        store: fixture.first.oauthClientConfigStore,
      });
      await clientConfigs.upsertConfig({ service: "github", clientId: "client-id", clientSecret: "client-secret" });
      const original = await fixture.first.connectionStore.set("github", "work", {
        authType: "oauth2",
        accessToken: "old-access",
        refreshToken: "old-refresh",
        tokenType: "Bearer",
        expiresAt: new Date(Date.now() - 60_000).toISOString(),
        profile: { accountId: "account", displayName: "Account", grantedScopes: [] },
        metadata: {},
      });
      const attempts: ProviderHttpAttempt[] = [];
      const providerHttpDispatch: ProviderHttpDispatchOptions = {
        beforeAttempt: (attempt) => {
          attempts.push(attempt);
          return attempt.context.operation === "oauth" &&
            attempt.context.connectionId === original.id &&
            attempt.context.connectionName === "work" &&
            !(denyCleanup && attempt.method === "DELETE")
            ? { allow: true }
            : { allow: false, retryAfterSeconds: 7 };
        },
      };
      const connections = new ConnectionService({
        catalog,
        providerLoader,
        store: fixture.first.connectionStore,
        oauthCredentials: new OAuthCredentialRefreshService(clientConfigs, providerLoader),
        providerHttpDispatch,
      });
      const entered = Promise.withResolvers<void>();
      const released = Promise.withResolvers<void>();
      const fetcher = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "POST") {
          entered.resolve();
          await released.promise;
          return Response.json({ access_token: "rotated-access", refresh_token: "rotated-refresh", expires_in: 3600 });
        }
        return new Response(null, { status: 204 });
      });
      vi.stubGlobal("fetch", fetcher);
      const execution = (
        scope === "action"
          ? withRuntimeExecution(
              { providerHttpDispatch },
              { operation: "action", service: "github", actionId: "github.get_current_user" },
              () => connections.getCredential("github", "work"),
            )
          : connections.getCredential("github", "work")
      ).catch((error: unknown) => error);
      await entered.promise;
      const second = await fixture.openSecond();
      await second.connectionStore.delete("github", "work", original, oauthAuthorizationKey(original));
      released.resolve();

      await expect(execution).resolves.toMatchObject(
        denyCleanup
          ? { code: "rate_limited", status: 429, details: { retryAfterSeconds: 7 } }
          : { code: "connection_not_found" },
      );
      expect(attempts).toHaveLength(2);
      attempts.forEach((attempt) => {
        expect(attempt.context).toMatchObject({
          operation: "oauth",
          service: "github",
          connectionId: original.id,
          connectionName: "work",
        });
      });
      expect(fetcher.mock.calls.map(([, init]) => init?.method)).toEqual(denyCleanup ? ["POST"] : ["POST", "DELETE"]);
      if (!denyCleanup) {
        expect(fetcher.mock.calls[1]?.[1]?.body).toBe(JSON.stringify({ access_token: "rotated-access" }));
      }
      await expect(second.connectionStore.get("github", "work")).resolves.toBeUndefined();
    },
  );

  it.each(["sqlite", "d1", "postgres"] as const)(
    "%s cannot resurrect a disconnected or already absent alias after delayed token exchange",
    async (backend) => {
      const fixture = await openFixture(backend);
      cleanups.push(() => fixture.close());
      const first = createServices(fixture.first);
      await first.clientConfigs.upsertConfig({ service: "example", clientId: "client", clientSecret: "secret" });

      // Both local consent APIs must reject the same delayed exchange, including a never-published alias.
      for (const mode of ["classic", "request"] as const) {
        const start = async (flow: OAuthFlowService, name: string, owner: string): Promise<{ state: string }> => {
          if (mode === "classic") return flow.startAuthorization({ service: "example", connectionName: name });
          const request = await flow.startConnectionRequest({ service: "example", connectionName: name, owner });
          return { state: request.stateHandle };
        };
        for (const previouslyConfigured of [true, false]) {
          const name = `${mode}_${previouslyConfigured ? "work" : "new"}`;
          const control = `${name}_control`;
          const credential = {
            authType: "api_key" as const,
            apiKey: "control-token",
            values: {},
            profile: { accountId: "control", displayName: "Control", grantedScopes: [] },
            metadata: {},
          };
          await fixture.first.connectionStore.set("example", control, credential);
          await fixture.first.connectionStore.set("other-service", name, credential);
          if (previouslyConfigured) await fixture.first.connectionStore.set("example", name, credential);
          const controlState = await start(first.flow, control, control);
          const waiting = await start(first.flow, name, `${name}_waiting`);
          const inFlight = await start(first.flow, name, `${name}_inflight`);
          const oldGeneration = await fixture.first.connectionStore.getRetirementGeneration("example", name);
          const entered = Promise.withResolvers<void>();
          const released = Promise.withResolvers<void>();
          const fetcher = vi.fn(async () => {
            entered.resolve();
            await released.promise;
            return Response.json({ access_token: "late-token", token_type: "Bearer" });
          });
          vi.stubGlobal("fetch", fetcher);
          const callback = first.flow.completeAuthorization({ state: inFlight.state, code: "late-code" }).then(
            () => undefined,
            (error: unknown) => error,
          );
          await entered.promise;

          // A separately opened runtime must see and preserve the durable retirement, even absent credentials.
          const secondDatabase = await fixture.openSecond();
          const second = createServices(secondDatabase);
          await second.connections.disconnect("example", name);
          const retiredGeneration = await secondDatabase.connectionStore.getRetirementGeneration("example", name);
          expect(retiredGeneration).not.toBe(oldGeneration);
          await expect(secondDatabase.connectionStore.get("example", name)).resolves.toBeUndefined();
          await expect(
            first.flow.completeAuthorization({ state: waiting.state, code: "waiting-code" }),
          ).rejects.toMatchObject({ code: "invalid_oauth_state" });
          expect(fetcher).toHaveBeenCalledTimes(1);

          // A state insert already encoding when DELETE ran cannot repopulate the pending ledger either.
          await fixture.first.oauthStateStore.set({
            service: "example",
            connectionName: name,
            retirementGeneration: oldGeneration,
            state: "late-state",
            createdAt: new Date().toISOString(),
          });
          await expect(secondDatabase.oauthStateStore.take("late-state")).resolves.toBeUndefined();
          released.resolve();
          const callbackError = await callback;
          await expect(secondDatabase.connectionStore.get("example", name)).resolves.toBeUndefined();
          expect(callbackError).toMatchObject({
            code: mode === "classic" ? "connection_retired" : "request_key_conflict",
          });

          await second.connections.disconnect("example", name); // Already absent DELETE still retires the fence.
          expect(await secondDatabase.connectionStore.getRetirementGeneration("example", name)).not.toBe(
            retiredGeneration,
          );
          await expect(secondDatabase.connectionStore.get("example", control)).resolves.toMatchObject({ credential });
          await expect(secondDatabase.connectionStore.get("other-service", name)).resolves.toMatchObject({
            credential,
          });
          await expect(
            mode === "classic"
              ? secondDatabase.oauthStateStore.take(controlState.state)
              : secondDatabase.connectionRequestStore.claim(controlState.state),
          ).resolves.toMatchObject({
            connectionName: control,
          });

          // Retirement blocks stale consent, while a fresh explicit authorization can reconnect this exact alias.
          vi.stubGlobal(
            "fetch",
            vi.fn(async () => Response.json({ access_token: "fresh-token", token_type: "Bearer" })),
          );
          const fresh = await start(second.flow, name, `${name}_fresh`);
          if (mode === "request") {
            // A pre-disconnect create resuming after fresh consent must not supersede that new request.
            await fixture.first.connectionRequestStore.create({
              service: "example",
              connectionName: name,
              retirementGeneration: oldGeneration,
              owner: `${name}_fresh`,
              connectionRequestId: crypto.randomUUID(),
              state: `${name}_stale-create`,
              createdAt: new Date().toISOString(),
              expiresAt: new Date(Date.now() + 60_000).toISOString(),
            });
          }
          await expect(second.flow.completeAuthorization({ state: fresh.state, code: "fresh-code" })).resolves.toEqual({
            service: "example",
            connected: true,
          });
          await expect(fixture.first.connectionStore.get("example", name)).resolves.toMatchObject({
            credential: { accessToken: "fresh-token" },
          });
        }
      }
    },
    30_000,
  );
});

function createServices(database: RuntimeDatabase): {
  clientConfigs: OAuthClientConfigService;
  connections: ConnectionService;
  flow: OAuthFlowService;
} {
  const catalog = createCatalogStore([provider]);
  const providerLoader = new ProviderLoader({});
  const connections = new ConnectionService({
    catalog,
    providerLoader,
    store: database.connectionStore,
  });
  const clientConfigs = new OAuthClientConfigService({
    catalog,
    origin: "https://runtime.example.com",
    store: database.oauthClientConfigStore,
  });
  return {
    connections,
    clientConfigs,
    flow: new OAuthFlowService({
      connections,
      clientConfigs,
      providerLoader,
      states: database.oauthStateStore,
      requests: database.connectionRequestStore,
    }),
  };
}

async function openFixture(backend: "sqlite" | "d1" | "postgres"): Promise<RuntimeFixture> {
  if (backend === "sqlite") {
    const dir = await mkdtemp(join(tmpdir(), "oc-retirement-"));
    const path = join(dir, "runtime.sqlite");
    const databases = [new SqliteRuntimeDatabase(path)];
    return {
      first: databases[0],
      async openSecond() {
        const next = new SqliteRuntimeDatabase(path);
        databases.push(next);
        return next;
      },
      async close() {
        for (const database of databases) database.close();
        await rm(dir, { recursive: true });
      },
    };
  }
  if (backend === "d1") {
    const binding = new SqliteD1Database();
    return {
      first: new D1RuntimeDatabase(binding),
      async openSecond() {
        return new D1RuntimeDatabase(binding);
      },
      async close() {
        binding.close();
      },
    };
  }
  // CI supplies a real PostgreSQL service. Locally the same production pg driver runs against PGlite.
  let pgUrl = process.env.TEST_POSTGRES_URL;
  let testServer: PGliteTestServer | undefined;
  if (!pgUrl) {
    testServer = await startPGliteTestServer();
    pgUrl = testServer.url;
  }
  const admin = new Pool({ connectionString: pgUrl, max: 1 });
  const schema = `retirement_${crypto.randomUUID().replaceAll("-", "")}`;
  await admin.query(`create schema ${schema}`);
  const url = new URL(pgUrl);
  url.searchParams.set("options", `-c search_path=${schema}`);
  const migrationPool = new Pool({ connectionString: url.toString(), max: 1 });
  try {
    await migratePostgresDatabase({ pool: migrationPool });
  } finally {
    await migrationPool.end();
  }
  const databases = [await PostgresRuntimeDatabase.open(url.toString(), { poolMax: 2 })];
  return {
    first: databases[0],
    async openSecond() {
      const next = await PostgresRuntimeDatabase.open(url.toString(), { poolMax: 2 });
      databases.push(next);
      return next;
    },
    async close() {
      for (const database of databases) await database.close();
      await admin.query(`drop schema ${schema} cascade`);
      await admin.end();
      await testServer?.close();
    },
  };
}
