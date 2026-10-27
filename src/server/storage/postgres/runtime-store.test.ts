import type { RuntimeActionHttpResult } from "../../api/runtime-api.ts";
import type { MigrationSource } from "../migration-source.ts";
import type { PGliteTestServer } from "./test-database.ts";

import { setImmediate, setTimeout } from "node:timers/promises";
import { Client, Pool } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { AesGcmSecretCodec } from "../../secrets/secret-codec.ts";
import { connectionRequestStoreTests } from "../connection-request-store.cases.ts";
import { defaultMigrationSource } from "../migration-source.ts";
import { createNodeRuntimeDatabase, migratePostgresRuntimeDatabase } from "../node-runtime-database.ts";
import { RuntimeTokenService } from "../runtime-token-service.ts";
import { saasProjectStoreTests, saasMaintenanceTests } from "../saas-project-store.cases.ts";
import { triggerStoreTests } from "../trigger-store.cases.ts";
import { assertPostgresSchemaReady, migratePostgresDatabase } from "./migrations.ts";
import { PostgresRuntimeDatabase } from "./runtime-store.ts";
import { startPGliteTestServer } from "./test-database.ts";

const githubProfile = {
  accountId: "github:octocat",
  displayName: "octocat",
  grantedScopes: [],
};

describe("PGlite PostgreSQL protocol fixture", () => {
  let testServer: PGliteTestServer;

  beforeAll(async () => {
    testServer = await startPGliteTestServer();
  });

  afterAll(async () => {
    await testServer.close();
  });

  it.each([
    { phase: "Parse", sql: "select * from missing_table where id = $1", code: "42P01" },
    { phase: "Execute", sql: "select 1 / $1::integer", code: "22012" },
  ])("recovers on the same connection after a $phase error and delayed Sync", async ({ sql, code }) => {
    const execute = testServer.database.execProtocolRawStream.bind(testServer.database);
    const delayedSync = vi
      .spyOn(testServer.database, "execProtocolRawStream")
      .mockImplementation(async (message, options) => {
        if (message[0] === "S".charCodeAt(0)) await setTimeout(20);
        await execute(message, options);
      });
    const client = new Client({ connectionString: testServer.url });
    const connectionErrors: Error[] = [];
    client.on("error", (error) => connectionErrors.push(error));
    try {
      await client.connect();
      await client.query("begin");
      await expect(client.query(sql, [0])).rejects.toMatchObject({ code });
      await client.query("rollback");
      await expect(client.query("select $1::integer as value", [42])).resolves.toMatchObject({
        rows: [{ value: 42 }],
      });
      expect(connectionErrors).toEqual([]);
    } finally {
      delayedSync.mockRestore();
      await client.end();
    }
  });
});

it.each([false, true])(
  "waits for disconnected clients to roll back before closing PGlite (timeout: %s)",
  async (timeout) => {
    const fixture = await startPGliteTestServer();
    const client = new Client({ connectionString: fixture.url });
    const rollbackStarted = Promise.withResolvers<void>();
    const finishRollback = Promise.withResolvers<void>();
    const execute = fixture.database.exec.bind(fixture.database);
    const exec = vi.spyOn(fixture.database, "exec").mockImplementation(async (sql, options) => {
      if (sql === "ROLLBACK") {
        rollbackStarted.resolve();
        await finishRollback.promise;
      }
      return execute(sql, options);
    });
    const close = vi.spyOn(fixture.database, "close");
    const failure = new Error("PGlite shutdown timed out");
    const waitFor = vi.spyOn(vi, "waitFor");
    let closing: Promise<void> | undefined;
    try {
      await client.connect();
      await client.query("begin");
      await client.end();
      await rollbackStarted.promise;
      if (timeout) waitFor.mockRejectedValueOnce(failure);
      closing = timeout ? expect(fixture.close()).rejects.toBe(failure) : fixture.close();
      await setImmediate();
      expect(close).not.toHaveBeenCalled();
      finishRollback.resolve();
      await closing;
      expect(close).toHaveBeenCalledOnce();
    } finally {
      finishRollback.resolve();
      await client.end();
      await (closing ?? fixture.close());
      exec.mockRestore();
      close.mockRestore();
      waitFor.mockRestore();
    }
  },
);

it.each(["select 1", "begin"])("closes leaked clients after a shutdown timeout (%s)", async (sql) => {
  const fixture = await startPGliteTestServer();
  const client = new Client({ connectionString: fixture.url });
  const ended = Promise.withResolvers<void>();
  client.on("error", () => undefined);
  client.on("end", () => ended.resolve());
  const failure = new Error("PGlite shutdown timed out");
  const waitFor = vi.spyOn(vi, "waitFor");
  try {
    await client.connect();
    await client.query(sql);
    waitFor.mockRejectedValueOnce(failure);
    await expect(fixture.close()).rejects.toBe(failure);
    await ended.promise;
    expect(fixture.database.closed).toBe(true);
    const probe = new Client({ connectionString: fixture.url });
    try {
      await expect(probe.connect()).rejects.toMatchObject({ code: "ECONNREFUSED" });
    } finally {
      await probe.end();
    }
  } finally {
    waitFor.mockRestore();
    await client.end();
    if (!fixture.database.closed) await fixture.close();
  }
});

describe("PostgreSQL migrations with PGlite", () => {
  let testServer: PGliteTestServer;

  beforeAll(async () => {
    testServer = await startPGliteTestServer();
  });

  afterAll(async () => {
    await testServer.close();
  });

  it("requires explicit migrations and recognizes the current schema", async () => {
    await expect(PostgresRuntimeDatabase.open(testServer.url)).rejects.toThrow(
      "Run `npm run runtime:migrate` before starting the server",
    );

    const pool = new Pool({ connectionString: testServer.url, max: 1 });
    try {
      await migratePostgresDatabase({ pool });
      await expect(assertPostgresSchemaReady(pool)).resolves.toBeUndefined();
      await expect(migratePostgresDatabase({ pool })).resolves.toBeUndefined();
      await expect(pool.query("select name from runtime_migrations order by name")).resolves.toMatchObject({
        rows: [
          { name: "0010_runtime.sql" },
          { name: "0011_runtime_token_connection_scope.sql" },
          { name: "0012_marketplace.sql" },
          { name: "0013_connection_requests.sql" },
          { name: "0014_saas_project.sql" },
          { name: "0015_saas_cleanup_runtime.sql" },
          { name: "0016_trigger_policy.sql" },
          { name: "0017_trigger_subscriptions.sql" },
          { name: "0018_connection_retirement.sql" },
          { name: "0019_trigger_sources.sql" },
        ],
      });

      await pool.query("delete from runtime_migrations where name = $1", ["0010_runtime.sql"]);
      await expect(assertPostgresSchemaReady(pool)).rejects.toThrow("Missing migrations: 0010_runtime.sql");
      await pool.query("insert into runtime_migrations (name, applied_at) values ($1, $2)", [
        "0010_runtime.sql",
        new Date().toISOString(),
      ]);
      await pool.query("insert into runtime_migrations (name, applied_at) values ($1, $2)", [
        "9999_future.sql",
        new Date().toISOString(),
      ]);
      await expect(assertPostgresSchemaReady(pool)).resolves.toBeUndefined();
    } finally {
      await pool.end();
    }
  });
});

describe("PostgreSQL migrations with a custom migration source", () => {
  let testServer: PGliteTestServer;

  beforeAll(async () => {
    testServer = await startPGliteTestServer();
  });

  afterAll(async () => {
    await testServer.close();
  });

  it("validates and executes migrations through the same source", async () => {
    const migrations: MigrationSource = {
      readMigrations(dialect) {
        return [
          ...defaultMigrationSource.readMigrations(dialect),
          { name: "9998_custom.sql", sql: "create table custom_records (id integer primary key)" },
        ];
      },
    };
    const unapplied: MigrationSource = {
      readMigrations: () => [{ name: "9999_unapplied.sql", sql: "select 1" }],
    };

    const pool = new Pool({ connectionString: testServer.url, max: 1 });
    try {
      await migratePostgresDatabase({ pool, migrations });
      await expect(assertPostgresSchemaReady(pool, migrations)).resolves.toBeUndefined();
      await expect(assertPostgresSchemaReady(pool)).resolves.toBeUndefined();
      await expect(assertPostgresSchemaReady(pool, unapplied)).rejects.toThrow(
        "Missing migrations: 9999_unapplied.sql",
      );
      await expect(pool.query("select name from runtime_migrations order by name")).resolves.toMatchObject({
        rows: [
          { name: "0010_runtime.sql" },
          { name: "0011_runtime_token_connection_scope.sql" },
          { name: "0012_marketplace.sql" },
          { name: "0013_connection_requests.sql" },
          { name: "0014_saas_project.sql" },
          { name: "0015_saas_cleanup_runtime.sql" },
          { name: "0016_trigger_policy.sql" },
          { name: "0017_trigger_subscriptions.sql" },
          { name: "0018_connection_retirement.sql" },
          { name: "0019_trigger_sources.sql" },
          { name: "9998_custom.sql" },
        ],
      });
      await expect(pool.query("select to_regclass($1) as name", ["custom_records"])).resolves.toMatchObject({
        rows: [{ name: "custom_records" }],
      });
    } finally {
      await pool.end();
    }

    await expect(PostgresRuntimeDatabase.open(testServer.url, { migrations: unapplied })).rejects.toThrow(
      "Missing migrations: 9999_unapplied.sql",
    );
    const database = await PostgresRuntimeDatabase.open(testServer.url, { migrations });
    await database.close();
  });
});

describe("createNodeRuntimeDatabase with PostgreSQL", () => {
  let testServer: PGliteTestServer;

  beforeAll(async () => {
    testServer = await startPGliteTestServer();
  });

  afterAll(async () => {
    await testServer.close();
  });

  it("migrates and opens the PostgreSQL runtime database through the lazily loaded driver", async () => {
    await migratePostgresRuntimeDatabase({
      connectionString: testServer.url,
      connectionTimeoutMs: 5_000,
      migrations: defaultMigrationSource,
    });

    const database = await createNodeRuntimeDatabase({
      backend: "postgresql",
      connectionString: testServer.url,
      poolMax: 1,
      migrations: defaultMigrationSource,
    });
    try {
      await expect(database.connectionStore.list()).resolves.toEqual([]);
    } finally {
      await database.close();
    }
  });

  it("rejects a non-PostgreSQL URL before loading the driver", async () => {
    await expect(
      createNodeRuntimeDatabase({ backend: "postgresql", connectionString: "mysql://localhost/db" }),
    ).rejects.toThrow("OOMOL_CONNECT_DATABASE_URL must use the postgres: or postgresql: scheme.");
  });
});

describe("PostgresRuntimeDatabase with PGlite", () => {
  let testServer: PGliteTestServer;
  let database: PostgresRuntimeDatabase;

  beforeAll(async () => {
    testServer = await startPGliteTestServer();
    const pool = new Pool({ connectionString: testServer.url, max: 1 });
    try {
      await migratePostgresDatabase({ pool });
    } finally {
      await pool.end();
    }
  });

  beforeEach(async () => {
    database = await PostgresRuntimeDatabase.open(testServer.url, { runLimit: 5 });
    await database.resetRuntimeData();
  });

  afterEach(async () => {
    await database.close();
  });

  afterAll(async () => {
    await testServer.close();
  });

  connectionRequestStoreTests(() => database);
  triggerStoreTests(() => database);

  it("persists connections and OAuth data across database instances", async () => {
    const connection = await database.connectionStore.set("github", "default", githubCredential("github-token"));
    await database.oauthClientConfigStore.set({
      service: "gmail",
      clientId: "client-id",
      clientSecret: "client-secret",
      requestedScopes: ["gmail.readonly"],
      extra: { tenant: "default" },
      secretExtra: {},
    });
    await database.oauthStateStore.set({
      service: "gmail",
      retirementGeneration: await database.connectionStore.getRetirementGeneration("gmail", "default"),
      state: "state-1",
      createdAt: "2026-06-30T00:00:00.000Z",
    });
    await database.close();

    database = await PostgresRuntimeDatabase.open(testServer.url);
    await expect(database.connectionStore.get("github", "default")).resolves.toMatchObject({
      id: connection.id,
      credential: { apiKey: "github-token" },
    });
    await expect(database.oauthClientConfigStore.get("gmail")).resolves.toMatchObject({
      clientId: "client-id",
      clientSecret: "client-secret",
      requestedScopes: ["gmail.readonly"],
    });
    await expect(database.oauthStateStore.take("state-1")).resolves.toMatchObject({ state: "state-1" });
    await expect(database.oauthStateStore.take("state-1")).resolves.toBeUndefined();
  });

  it("deletes OAuth states created before a cutoff", async () => {
    await database.oauthStateStore.set({
      service: "gmail",
      retirementGeneration: await database.connectionStore.getRetirementGeneration("gmail", "default"),
      state: "expired",
      createdAt: "2026-06-30T00:00:00.000Z",
    });
    await database.oauthStateStore.set({
      service: "gmail",
      retirementGeneration: await database.connectionStore.getRetirementGeneration("gmail", "default"),
      state: "current",
      createdAt: "2026-06-30T00:00:01.000Z",
    });

    await database.oauthStateStore.deleteCreatedBefore("2026-06-30T00:00:01.000Z");

    await expect(database.oauthStateStore.take("expired")).resolves.toBeUndefined();
    await expect(database.oauthStateStore.take("current")).resolves.toMatchObject({ state: "current" });
  });

  it("preserves connection identity and rejects stale revisions", async () => {
    const created = await database.connectionStore.set("github", "default", githubCredential("github-token"));
    const updated = await database.connectionStore.set("github", "default", githubCredential("updated-token"));

    expect(updated.id).toBe(created.id);
    expect(updated.revision).not.toBe(created.revision);
    await expect(
      database.connectionStore.updateCredential({
        ...created,
        credential: githubCredential("stale-token"),
      }),
    ).resolves.toBe(false);
    await expect(
      database.connectionStore.updateCredential({
        ...updated,
        credential: githubCredential("refreshed-token"),
      }),
    ).resolves.toBe(true);
    await expect(
      database.connectionStore.updateCredential({
        ...updated,
        credential: githubCredential("second-stale-token"),
      }),
    ).resolves.toBe(false);
    await expect(database.connectionStore.get("github", "default")).resolves.toMatchObject({
      credential: { apiKey: "refreshed-token" },
    });
  });

  it("claims, completes, replays, and expires idempotency records", async () => {
    const first = {
      keyHash: "key-hash",
      requestHash: "request-hash",
      claimId: "claim-1",
      now: "2026-06-30T00:00:00.000Z",
      expiresAt: "2026-06-30T01:00:00.000Z",
    };
    const second = {
      ...first,
      claimId: "claim-2",
      now: first.expiresAt,
      expiresAt: "2026-06-30T02:00:00.000Z",
    };
    const response = successResponse({ claim: "current" });

    await expect(database.idempotencyStore.claim(first)).resolves.toEqual({ kind: "acquired" });
    await expect(database.idempotencyStore.claim({ ...first, claimId: "duplicate" })).resolves.toEqual({
      kind: "in_progress",
    });
    await expect(
      database.idempotencyStore.claim({ ...first, claimId: "conflict", requestHash: "different" }),
    ).resolves.toEqual({ kind: "conflict" });
    await expect(database.idempotencyStore.claim(second)).resolves.toEqual({ kind: "acquired" });
    await expect(
      database.idempotencyStore.complete({
        ...first,
        response: successResponse({ claim: "stale" }),
      }),
    ).resolves.toBe(false);
    await expect(database.idempotencyStore.complete({ ...second, response })).resolves.toBe(true);
    await expect(
      database.idempotencyStore.claim({
        ...second,
        claimId: "claim-3",
        now: "2026-06-30T01:30:00.000Z",
      }),
    ).resolves.toEqual({ kind: "completed", response });
  });

  it("stores tokens and policy and filters paginated run logs", async () => {
    const tokens = new RuntimeTokenService(database.runtimeTokenStore);
    const token = await tokens.createToken("Claude Desktop", {
      allowedActions: ["github.*"],
      blockedActions: ["github.delete_repository"],
      allowedProxies: ["github"],
      allowedConnections: ["connection-work", "connection-personal"],
    });
    await expect(tokens.verifyToken(token.token)).resolves.toBe(true);
    await expect(tokens.resolveToken(token.token)).resolves.toMatchObject({
      allowedConnections: ["connection-work", "connection-personal"],
    });
    await expect(tokens.listTokens()).resolves.toMatchObject([
      {
        id: token.record.id,
        allowedActions: ["github.*"],
        blockedActions: ["github.delete_repository"],
        allowedProxies: ["github"],
        allowedConnections: ["connection-work", "connection-personal"],
      },
    ]);
    await expect(
      tokens.updateTokenPolicy(token.record.id, {
        allowedActions: ["github.get_current_user"],
        blockedActions: [],
        allowedProxies: [],
        allowedConnections: ["connection-work"],
      }),
    ).resolves.toMatchObject({
      allowedActions: ["github.get_current_user"],
      allowedConnections: ["connection-work"],
    });
    await expect(tokens.resolveToken(token.token)).resolves.toMatchObject({
      allowedConnections: ["connection-work"],
    });

    const policy = {
      rules: {
        allowedActions: ["github.*"],
        blockedActions: [],
        allowedProxies: ["github"],
        blockedProxies: [],
      },
      updatedAt: "2026-07-20T00:00:00.000Z",
    };
    await database.runtimePolicyStore.set(policy);
    await expect(database.runtimePolicyStore.get()).resolves.toEqual(policy);

    await database.runLogStore.add(createRun("gmail-1", "2026-06-30T00:00:00.000Z", "gmail.list", "gmail"));
    await database.runLogStore.add(createRun("news-1", "2026-06-30T00:00:01.000Z"));
    await database.runLogStore.add(createRun("gmail-2", "2026-06-30T00:00:02.000Z", "gmail.send", "gmail"));
    const first = await database.runLogStore.list({ service: "gmail", limit: 1 });
    expect(first.items.map((run) => run.id)).toEqual(["gmail-2"]);
    expect(first.nextCursor).toBeTruthy();
    await expect(
      database.runLogStore.list({ service: "gmail", limit: 1, cursor: first.nextCursor }),
    ).resolves.toMatchObject({ items: [{ id: "gmail-1" }] });
    await expect(database.runLogStore.get("news-1")).resolves.toMatchObject({ id: "news-1" });
    await expect(tokens.revokeToken(token.record.id)).resolves.toBe(true);
    await expect(tokens.verifyToken(token.token)).resolves.toBe(false);
  });

  it("keeps only the configured number of recent runs", async () => {
    await database.close();
    database = await PostgresRuntimeDatabase.open(testServer.url, { runLimit: 2 });
    await database.runLogStore.add(createRun("run-1", "2026-06-30T00:00:00.000Z"));
    await database.runLogStore.add(createRun("run-2", "2026-06-30T00:00:01.000Z"));
    await database.runLogStore.add(createRun("run-3", "2026-06-30T00:00:02.000Z"));

    await expect(database.runLogStore.list()).resolves.toMatchObject({
      items: [{ id: "run-3" }, { id: "run-2" }],
    });
  });

  // PostgreSQL numbers its bind parameters, so a combined filter is what pins the `$n` sequence
  // the shared run log query builder emits.
  it("filters runs by action, caller, and status and reads one run by id", async () => {
    const match = {
      ...createRun("run-match", "2026-06-30T00:00:02.000Z", "gmail.send_message", "gmail"),
      caller: "mcp" as const,
      ok: false,
    };

    await database.runLogStore.add(createRun("run-other", "2026-06-30T00:00:01.000Z"));
    await database.runLogStore.add(match);

    await expect(
      database.runLogStore.list({ actionId: "gmail.send_message", caller: "mcp", ok: false }),
    ).resolves.toMatchObject({ items: [{ id: "run-match" }] });
    await expect(database.runLogStore.get("run-match")).resolves.toEqual(match);
    await expect(database.runLogStore.get("missing")).resolves.toBeUndefined();
  });

  it("rotates encrypted values and resets runtime data without removing migrations", async () => {
    await database.close();
    database = await PostgresRuntimeDatabase.open(testServer.url, {
      secretCodec: new AesGcmSecretCodec("old-key"),
    });
    const connection = await database.connectionStore.set("github", "default", githubCredential("github-token"));
    const token = await new RuntimeTokenService(database.runtimeTokenStore).createToken("trigger-owner");
    const triggerRecord = {
      id: "rotation-trigger",
      mode: "webhook" as const,
      tokenId: token.record.id,
      service: "github",
      connectionId: connection.id,
      connectionRevision: connection.revision,
      providerAccountId: githubProfile.accountId,
      triggerId: "github.on_repo_event",
      requestKey: "binding",
      config: { owner: "octocat", repo: "repository" },
      endpointUrl: "https://callback.example/hook",
      callbackNonce: "rotation-nonce",
      callbackSecret: "private-trigger-secret",
      checkpoint: null,
      subscription: { hookId: "private-hook" },
      reconcileAt: 1_000,
      status: "active" as const,
    };
    await database.triggerStore.insertFlowTrigger(triggerRecord);
    const application = { secrets: { signingSecret: "source-secret" }, state: {}, sources: {} };
    await database.triggerStore.saveSourceApplication("owner", "application", null, application);

    await database.oauthClientConfigStore.set({
      service: "gmail",
      clientId: "client-id",
      clientSecret: "client-secret",
      extra: {},
      secretExtra: {},
    });
    await database.oauthStateStore.set({
      service: "gmail",
      retirementGeneration: await database.connectionStore.getRetirementGeneration("gmail", "default"),
      state: "state-rotation",
      createdAt: "2026-06-30T00:00:00.000Z",
    });
    const claim = {
      keyHash: "key-hash",
      requestHash: "request-hash",
      claimId: "claim-1",
      now: "2026-06-30T00:00:00.000Z",
      expiresAt: "2026-07-01T00:00:00.000Z",
    };
    await database.idempotencyStore.claim(claim);
    await database.idempotencyStore.complete({ ...claim, response: successResponse({ secret: "response" }) });
    await database.rotateSecretCodec(new AesGcmSecretCodec("new-key"));
    await database.close();

    const withOldKey = await PostgresRuntimeDatabase.open(testServer.url, {
      secretCodec: new AesGcmSecretCodec("old-key"),
    });
    await expect(withOldKey.connectionStore.get("github", "default")).rejects.toThrow();
    await expect(withOldKey.triggerStore.getFlowTrigger(triggerRecord.id)).rejects.toThrow();
    await expect(withOldKey.triggerStore.getSourceApplication("owner", "application")).rejects.toThrow();
    await withOldKey.close();

    database = await PostgresRuntimeDatabase.open(testServer.url, {
      secretCodec: new AesGcmSecretCodec("new-key"),
    });
    await expect(database.connectionStore.get("github", "default")).resolves.toMatchObject({
      credential: { apiKey: "github-token" },
    });
    await expect(database.triggerStore.getFlowTrigger(triggerRecord.id)).resolves.toEqual(triggerRecord);
    await expect(database.triggerStore.getSourceApplication("owner", "application")).resolves.toEqual({
      revision: 1,
      application,
    });
    await expect(database.oauthClientConfigStore.get("gmail")).resolves.toMatchObject({
      clientSecret: "client-secret",
    });
    await expect(database.oauthStateStore.take("state-rotation")).resolves.toMatchObject({
      state: "state-rotation",
    });
    await expect(database.idempotencyStore.claim({ ...claim, claimId: "claim-2" })).resolves.toEqual({
      kind: "completed",
      response: successResponse({ secret: "response" }),
    });

    await database.resetRuntimeData();
    await expect(database.connectionStore.list()).resolves.toEqual([]);
    await expect(database.triggerStore.list()).resolves.toEqual([]);
    await expect(database.triggerStore.getSourceApplication("owner", "application")).resolves.toBeNull();
    const pool = new Pool({ connectionString: testServer.url, max: 1 });
    try {
      await expect(assertPostgresSchemaReady(pool)).resolves.toBeUndefined();
    } finally {
      await pool.end();
    }
  });
});

function githubCredential(apiKey: string) {
  return {
    authType: "api_key" as const,
    apiKey,
    values: { apiKey },
    profile: githubProfile,
    metadata: {},
  };
}

function createRun(id: string, startedAt: string, actionId = "hackernews.get_top_stories", service = "hackernews") {
  return {
    id,
    service,
    actionId,
    caller: "http" as const,
    startedAt,
    completedAt: startedAt,
    durationMs: 0,
    ok: true,
  };
}

function successResponse(data: unknown): RuntimeActionHttpResult {
  return {
    status: 200,
    body: {
      success: true,
      message: "OK",
      data,
      meta: {},
    },
  };
}

describe("PostgreSQL SaaS storage with PGlite", () => {
  let testServer: PGliteTestServer;
  let database: PostgresRuntimeDatabase;
  beforeEach(async () => {
    testServer = await startPGliteTestServer();
    const pool = new Pool({ connectionString: testServer.url, max: 1 });
    try {
      await migratePostgresDatabase({ pool });
    } finally {
      await pool.end();
    }
    database = await PostgresRuntimeDatabase.open(testServer.url, {
      secretCodec: new AesGcmSecretCodec("saas-test"),
      poolMax: 1,
    });
  });
  afterEach(async () => {
    await database.close();
    await testServer.close();
  });
  saasProjectStoreTests(() => database);
  saasMaintenanceTests(
    () => database,
    async (secretCodec) => {
      await database.close();
      database = await PostgresRuntimeDatabase.open(testServer.url, { secretCodec, poolMax: 1 });
    },
  );
});
