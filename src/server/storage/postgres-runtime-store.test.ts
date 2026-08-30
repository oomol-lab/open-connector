import type { RuntimeActionHttpResult } from "../api/runtime-api.ts";

import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AesGcmSecretCodec } from "../secrets/secret-codec.ts";
import { assertPostgresSchemaReady, migratePostgresDatabase } from "./postgres-migrations.ts";
import { PostgresRuntimeDatabase } from "./postgres-runtime-store.ts";
import { RuntimeTokenService } from "./runtime-token-service.ts";

const githubProfile = {
  accountId: "github:octocat",
  displayName: "octocat",
  grantedScopes: [],
};

interface PGliteTestServer {
  database: PGlite;
  server: PGLiteSocketServer;
  url: string;
}

describe("PostgreSQL migrations with PGlite", () => {
  let testServer: PGliteTestServer;

  beforeAll(async () => {
    testServer = await startPGliteTestServer();
  });

  afterAll(async () => {
    await testServer.server.stop();
    await testServer.database.close();
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
    await testServer.server.stop();
    await testServer.database.close();
  });

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
      state: "expired",
      createdAt: "2026-06-30T00:00:00.000Z",
    });
    await database.oauthStateStore.set({
      service: "gmail",
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
    await database.connectionStore.set("github", "default", githubCredential("github-token"));
    await database.oauthClientConfigStore.set({
      service: "gmail",
      clientId: "client-id",
      clientSecret: "client-secret",
      extra: {},
      secretExtra: {},
    });
    await database.oauthStateStore.set({
      service: "gmail",
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
    await withOldKey.close();

    database = await PostgresRuntimeDatabase.open(testServer.url, {
      secretCodec: new AesGcmSecretCodec("new-key"),
    });
    await expect(database.connectionStore.get("github", "default")).resolves.toMatchObject({
      credential: { apiKey: "github-token" },
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
    const pool = new Pool({ connectionString: testServer.url, max: 1 });
    try {
      await expect(assertPostgresSchemaReady(pool)).resolves.toBeUndefined();
    } finally {
      await pool.end();
    }
  });
});

async function startPGliteTestServer(): Promise<PGliteTestServer> {
  const database = await PGlite.create();
  const server = new PGLiteSocketServer({
    db: database,
    host: "127.0.0.1",
    port: 0,
    maxConnections: 20,
  });
  await server.start();
  const port = server.getServerConn().split(":").at(-1)!;
  return {
    database,
    server,
    url: `postgresql://postgres:postgres@127.0.0.1:${port}/postgres?sslmode=disable`,
  };
}

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
