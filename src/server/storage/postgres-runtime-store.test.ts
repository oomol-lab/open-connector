import type { ResolvedCredential } from "../../core/types.ts";

import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { defaultTenant } from "../../connection-service.ts";
import { AesGcmSecretCodec } from "../secrets/secret-codec.ts";
import { PostgresRuntimeDatabase, toPostgresPlaceholders } from "./postgres-runtime-store.ts";
import { RuntimeTokenService } from "./runtime-token-service.ts";
import { SqliteRuntimeDatabase } from "./sqlite-runtime-store.ts";

/**
 * Postgres integration tests.
 *
 * Skipped unless OOMOL_CONNECT_TEST_POSTGRES_URL is set, so the default `npm test` stays
 * dependency-free. CI and local runs that do have a database exercise the real thing —
 * the point of this backend is behaviour under a different SQL engine, which a fake would
 * not tell us anything about.
 */
const databaseUrl = process.env["OOMOL_CONNECT_TEST_POSTGRES_URL"];
const describePostgres = databaseUrl ? describe : describe.skip;

function credential(apiKey: string): ResolvedCredential {
  return {
    authType: "api_key",
    apiKey,
    values: { apiKey },
    profile: { accountId: `acct-${apiKey}`, displayName: `acct-${apiKey}`, grantedScopes: [] },
    metadata: {},
  };
}

describe("toPostgresPlaceholders", () => {
  it("numbers placeholders in order", () => {
    expect(toPostgresPlaceholders("select * from t where a = ? and b = ?")).toBe(
      "select * from t where a = $1 and b = $2",
    );
  });

  it("leaves question marks inside string literals alone", () => {
    // A literal `?` must not consume a parameter index, or every placeholder after it
    // shifts and silently binds the wrong value.
    expect(toPostgresPlaceholders("select ? where note = 'why?' and b = ?")).toBe(
      "select $1 where note = 'why?' and b = $2",
    );
  });

  it("handles doubled single quotes inside a literal", () => {
    expect(toPostgresPlaceholders("select ? where a = 'it''s?' and b = ?")).toBe(
      "select $1 where a = 'it''s?' and b = $2",
    );
  });
});

describePostgres("PostgresRuntimeDatabase", () => {
  let database: PostgresRuntimeDatabase;

  beforeAll(async () => {
    const pool = new Pool({ connectionString: databaseUrl });
    database = await PostgresRuntimeDatabase.create(pool, {
      secretCodec: new AesGcmSecretCodec("postgres-test-key"),
    });
    await database.resetRuntimeData();
  });

  afterAll(async () => {
    await database?.close();
  });

  it("matches the SQLite end-state schema table for table and column for column", async () => {
    // The Postgres schema is authored as one consolidated file rather than a port of the
    // SQLite migration history, so nothing structural forces the two to agree. This test
    // is what does: it builds a fresh SQLite database through every migration and compares
    // the resulting shape. Add a column to one dialect and forget the other, and this
    // fails.
    const sqlitePath = join(await mkdtemp(join(tmpdir(), "oomol-connect-pg-parity-")), "connect.sqlite");
    const sqlite = new SqliteRuntimeDatabase(sqlitePath);
    sqlite.close();

    const raw = new DatabaseSync(sqlitePath);
    const sqliteShape = new Map<string, string[]>();
    for (const table of raw
      .prepare("select name from sqlite_master where type = 'table' and name not like 'sqlite_%'")
      .all() as { name: string }[]) {
      const columns = (raw.prepare(`pragma table_info(${table.name})`).all() as { name: string }[])
        .map((column) => column.name)
        .sort();
      sqliteShape.set(table.name, columns);
    }
    raw.close();

    const pool = new Pool({ connectionString: databaseUrl });
    const postgresShape = new Map<string, string[]>();
    const { rows } = await pool.query<{ table_name: string; column_name: string }>(
      `select table_name, column_name from information_schema.columns
       where table_schema = 'public' order by table_name, column_name`,
    );
    for (const row of rows) {
      postgresShape.set(row.table_name, [...(postgresShape.get(row.table_name) ?? []), row.column_name]);
    }
    await pool.end();

    expect([...postgresShape.keys()].sort()).toEqual([...sqliteShape.keys()].sort());
    for (const [table, columns] of sqliteShape) {
      expect({ table, columns: postgresShape.get(table) }).toEqual({ table, columns });
    }
  });

  it("stores and reads a connection through the secret codec", async () => {
    const stored = await database.connectionStore.set(defaultTenant, "github", "default", credential("token"));
    expect(stored.id).toMatch(/^[0-9a-f-]{36}$/);

    await expect(database.connectionStore.get(defaultTenant, "github", "default")).resolves.toMatchObject({
      tenant: defaultTenant,
      service: "github",
      connectionName: "default",
      credential: { apiKey: "token" },
    });
  });

  it("upserts on the tenant-scoped primary key rather than duplicating", async () => {
    await database.connectionStore.set("upsert-tenant", "github", "default", credential("first"));
    await database.connectionStore.set("upsert-tenant", "github", "default", credential("second"));

    const listed = await database.connectionStore.list("upsert-tenant");
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({ credential: { apiKey: "second" } });
  });

  it("isolates identically-named connections between tenants", async () => {
    await database.connectionStore.set("pg-tenant-a", "github", "default", credential("a"));
    await database.connectionStore.set("pg-tenant-b", "github", "default", credential("b"));

    await expect(database.connectionStore.get("pg-tenant-a", "github", "default")).resolves.toMatchObject({
      credential: { apiKey: "a" },
    });
    await expect(database.connectionStore.get("pg-tenant-b", "github", "default")).resolves.toMatchObject({
      credential: { apiKey: "b" },
    });
    await expect(database.connectionStore.list("pg-tenant-a")).resolves.toHaveLength(1);
  });

  it("rejects a stale or cross-tenant credential update", async () => {
    const a = await database.connectionStore.set("rev-tenant-a", "github", "default", credential("a"));
    await database.connectionStore.set("rev-tenant-b", "github", "default", credential("b"));

    // Correct id + revision, wrong tenant: must not write.
    await expect(
      database.connectionStore.updateCredential({ ...a, tenant: "rev-tenant-b", credential: credential("stolen") }),
    ).resolves.toBe(false);

    // Stale revision in the right tenant: must not write either.
    await expect(
      database.connectionStore.updateCredential({ ...a, revision: "stale", credential: credential("stale") }),
    ).resolves.toBe(false);

    await expect(database.connectionStore.get("rev-tenant-b", "github", "default")).resolves.toMatchObject({
      credential: { apiKey: "b" },
    });
  });

  it("deletes only within the requesting tenant", async () => {
    await database.connectionStore.set("del-tenant-a", "github", "default", credential("a"));
    await database.connectionStore.delete("del-tenant-b", "github", "default");

    await expect(database.connectionStore.get("del-tenant-a", "github", "default")).resolves.toBeDefined();
  });

  it("round-trips a tenant-pinned runtime token", async () => {
    const tokens = new RuntimeTokenService(database.runtimeTokenStore);
    const created = await tokens.createToken(
      "pg-agent",
      { allowedActions: ["github.*"], blockedActions: [], allowedProxies: [] },
      "pg-tenant-a",
    );

    expect(created.record.tenant).toBe("pg-tenant-a");
    await expect(tokens.resolveToken(created.token)).resolves.toMatchObject({
      tenant: "pg-tenant-a",
      allowedActions: ["github.*"],
    });
    await expect(tokens.resolveToken("oct_not-a-real-token")).resolves.toBeUndefined();
  });

  it("stores and lists run logs with filters", async () => {
    await database.runLogStore.add({
      id: "pg-run-1",
      service: "github",
      actionId: "github.get_current_user",
      caller: "http",
      startedAt: "2026-07-01T00:00:00.000Z",
      completedAt: "2026-07-01T00:00:01.000Z",
      durationMs: 1000,
      ok: true,
    });

    await expect(database.runLogStore.get("pg-run-1")).resolves.toMatchObject({ id: "pg-run-1", ok: true });
    await expect(database.runLogStore.list({ service: "github" })).resolves.toMatchObject({
      items: [{ id: "pg-run-1" }],
    });
    await expect(database.runLogStore.list({ service: "gitlab" })).resolves.toMatchObject({ items: [] });
  });

  it("claims an idempotency key once, then reports the duplicate as in progress", async () => {
    const claim = await database.idempotencyStore.claim({
      keyHash: "pg-key",
      requestHash: "req",
      claimId: "claim-1",
      now: "2026-07-01T00:00:00.000Z",
      expiresAt: "2026-07-02T00:00:00.000Z",
    });
    expect(claim).toMatchObject({ kind: "acquired" });

    const duplicate = await database.idempotencyStore.claim({
      keyHash: "pg-key",
      requestHash: "req",
      claimId: "claim-2",
      now: "2026-07-01T00:00:00.000Z",
      expiresAt: "2026-07-02T00:00:00.000Z",
    });
    expect(duplicate).toMatchObject({ kind: "in_progress" });

    // A different request under the same key is a conflict, not a replay.
    const conflicting = await database.idempotencyStore.claim({
      keyHash: "pg-key",
      requestHash: "different-request",
      claimId: "claim-3",
      now: "2026-07-01T00:00:00.000Z",
      expiresAt: "2026-07-02T00:00:00.000Z",
    });
    expect(conflicting).toMatchObject({ kind: "conflict" });
  });
});
