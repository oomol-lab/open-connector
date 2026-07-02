import type { D1DatabaseBinding, D1PreparedStatementBinding } from "../cloudflare/cloudflare-bindings.ts";

import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { AesGcmSecretCodec } from "../secrets/secret-codec.ts";
import { D1RuntimeDatabase } from "./d1-runtime-store.ts";
import { RuntimeTokenService } from "./runtime-token-service.ts";

const githubProfile = {
  accountId: "github:octocat",
  displayName: "octocat",
  grantedScopes: [],
};

describe("D1RuntimeDatabase", () => {
  it("stores connections and OAuth client configs through the secret codec", async () => {
    const d1 = new SqliteD1Database();
    const database = new D1RuntimeDatabase(d1, {
      secretCodec: new AesGcmSecretCodec("local-test-key"),
    });

    await database.connectionStore.set("github", "default", {
      authType: "api_key",
      apiKey: "github-token",
      values: { apiKey: "github-token" },
      profile: githubProfile,
      metadata: { login: "octocat" },
    });
    await database.oauthClientConfigStore.set({
      service: "gmail",
      clientId: "client-id",
      clientSecret: "client-secret",
      extra: { tenant: "default" },
      secretExtra: {},
    });

    expect(d1.value("connections", "service", "github")).not.toContain("github-token");
    expect(d1.value("oauth_client_configs", "service", "gmail")).not.toContain("client-secret");
    await expect(database.connectionStore.get("github", "default")).resolves.toMatchObject({
      authType: "api_key",
      apiKey: "github-token",
      metadata: { login: "octocat" },
    });
    await expect(database.oauthClientConfigStore.get("gmail")).resolves.toMatchObject({
      clientId: "client-id",
      clientSecret: "client-secret",
      extra: { tenant: "default" },
    });
    await expect(database.connectionStore.list()).resolves.toMatchObject([
      { service: "github", connectionName: "default" },
    ]);
    await expect(database.oauthClientConfigStore.list()).resolves.toMatchObject([{ service: "gmail" }]);

    await database.connectionStore.delete("github", "default");
    await database.oauthClientConfigStore.delete("gmail");
    await expect(database.connectionStore.get("github", "default")).resolves.toBeUndefined();
    await expect(database.oauthClientConfigStore.get("gmail")).resolves.toBeUndefined();
  });

  it("takes OAuth state once", async () => {
    const database = new D1RuntimeDatabase(new SqliteD1Database());

    await database.oauthStateStore.set({
      service: "gmail",
      state: "state-1",
      createdAt: "2026-06-30T00:00:00.000Z",
    });

    await expect(database.oauthStateStore.take("state-1")).resolves.toMatchObject({
      service: "gmail",
      state: "state-1",
    });
    await expect(database.oauthStateStore.take("state-1")).resolves.toBeUndefined();
  });

  it("stores runtime token hashes and supports verification and revocation", async () => {
    const database = new D1RuntimeDatabase(new SqliteD1Database());
    const tokens = new RuntimeTokenService(database.runtimeTokenStore);

    const created = await tokens.createToken("Claude Desktop");
    expect(created.token).toMatch(/^oct_/);
    expect(created.record.tokenHash).not.toBe(created.token);

    await expect(tokens.verifyToken(created.token)).resolves.toBe(true);
    const [listed] = await tokens.listTokens();
    expect(listed).toMatchObject({
      id: created.record.id,
      name: "Claude Desktop",
    });
    expect(listed?.lastUsedAt).toBeTruthy();

    await expect(tokens.revokeToken(created.record.id)).resolves.toBe(true);
    await expect(tokens.verifyToken(created.token)).resolves.toBe(false);
    await expect(tokens.revokeToken(created.record.id)).resolves.toBe(false);
  });

  it("keeps only the configured number of recent runs", async () => {
    const database = new D1RuntimeDatabase(new SqliteD1Database(), { runLimit: 2 });

    await database.runLogStore.add(createRun("run-1", "2026-06-30T00:00:00.000Z"));
    await database.runLogStore.add(createRun("run-2", "2026-06-30T00:00:01.000Z"));
    await database.runLogStore.add(createRun("run-3", "2026-06-30T00:00:02.000Z"));

    await expect(database.runLogStore.list()).resolves.toMatchObject({
      items: [{ id: "run-3" }, { id: "run-2" }],
    });
  });

  it("paginates recent runs with a cursor", async () => {
    const database = new D1RuntimeDatabase(new SqliteD1Database(), { runLimit: 4 });

    await database.runLogStore.add(createRun("run-1", "2026-06-30T00:00:00.000Z"));
    await database.runLogStore.add(createRun("run-2", "2026-06-30T00:00:01.000Z"));
    await database.runLogStore.add(createRun("run-3", "2026-06-30T00:00:02.000Z"));

    const first = await database.runLogStore.list({ limit: 2 });
    expect(first.items.map((run) => run.id)).toEqual(["run-3", "run-2"]);
    expect(first.nextCursor).toBeTruthy();

    const second = await database.runLogStore.list({ limit: 2, cursor: first.nextCursor });
    expect(second.items.map((run) => run.id)).toEqual(["run-1"]);
    expect(second.nextCursor).toBeUndefined();
  });
});

function createRun(id: string, startedAt: string) {
  return {
    id,
    actionId: "hackernews.get_top_stories",
    caller: "http" as const,
    startedAt,
    completedAt: startedAt,
    durationMs: 0,
    ok: true,
  };
}

class SqliteD1Database implements D1DatabaseBinding {
  private readonly database = new DatabaseSync(":memory:");

  constructor() {
    this.database.exec(readFileSync(new URL("../../../migrations/0001_runtime.sql", import.meta.url), "utf8"));
  }

  prepare(query: string): D1PreparedStatementBinding {
    return new SqliteD1PreparedStatement(this.database, query);
  }

  value(table: "connections" | "oauth_client_configs", keyColumn: "service", key: string): string {
    const row = this.database.prepare(`select value from ${table} where ${keyColumn} = ?`).get(key) as
      | { value: string }
      | undefined;
    return row?.value ?? "";
  }
}

class SqliteD1PreparedStatement implements D1PreparedStatementBinding {
  private readonly database: DatabaseSync;
  private readonly query: string;
  private readonly values: unknown[];

  constructor(database: DatabaseSync, query: string, values: unknown[] = []) {
    this.database = database;
    this.query = query;
    this.values = values;
  }

  bind(...values: unknown[]): D1PreparedStatementBinding {
    return new SqliteD1PreparedStatement(this.database, this.query, values);
  }

  async first<T = Record<string, unknown>>(): Promise<T | null> {
    return (this.database.prepare(this.query).get(...toSqlValues(this.values)) as T | undefined) ?? null;
  }

  async all<T = Record<string, unknown>>(): Promise<{ results: T[] }> {
    return { results: this.database.prepare(this.query).all(...toSqlValues(this.values)) as T[] };
  }

  async run(): Promise<{ success: boolean; meta: { changes?: number } }> {
    const result = this.database.prepare(this.query).run(...toSqlValues(this.values));
    return { success: true, meta: { changes: Number(result.changes) } };
  }
}

function toSqlValues(values: unknown[]): Array<string | number | bigint | null | Uint8Array> {
  return values.map((value) => (value === undefined ? null : (value as string | number | bigint | null | Uint8Array)));
}
