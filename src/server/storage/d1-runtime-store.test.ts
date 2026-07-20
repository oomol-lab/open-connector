import type { RuntimeActionHttpResult } from "../api/runtime-api.ts";
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
      id: expect.any(String),
      credential: {
        authType: "api_key",
        apiKey: "github-token",
        metadata: { login: "octocat" },
      },
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

  it("preserves connection identity on update and replaces it after deletion", async () => {
    const database = new D1RuntimeDatabase(new SqliteD1Database());
    const credential = {
      authType: "api_key" as const,
      apiKey: "github-token",
      values: { apiKey: "github-token" },
      profile: githubProfile,
      metadata: {},
    };

    const created = await database.connectionStore.set("github", "default", credential);
    const updated = await database.connectionStore.set("github", "default", {
      ...credential,
      apiKey: "updated-token",
    });
    expect(updated.id).toBe(created.id);
    await expect(
      database.connectionStore.updateCredential({
        ...updated,
        credential: { ...credential, apiKey: "refreshed-token" },
      }),
    ).resolves.toBe(true);

    await database.connectionStore.delete("github", "default");
    const recreated = await database.connectionStore.set("github", "default", credential);
    expect(recreated.id).not.toBe(created.id);
    await expect(
      database.connectionStore.updateCredential({
        ...created,
        credential: { ...credential, apiKey: "stale-refreshed-token" },
      }),
    ).resolves.toBe(false);
    await expect(database.connectionStore.get("github", "default")).resolves.toMatchObject({
      id: recreated.id,
      credential: { apiKey: "github-token" },
    });
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

    const created = await tokens.createToken("Claude Desktop", {
      allowedActions: ["github.*"],
      blockedActions: ["github.delete_repository"],
    });
    expect(created.token).toMatch(/^oct_/);
    expect(created.record.tokenHash).not.toBe(created.token);

    await expect(tokens.verifyToken(created.token)).resolves.toBe(true);
    const [listed] = await tokens.listTokens();
    expect(listed).toMatchObject({
      id: created.record.id,
      name: "Claude Desktop",
      allowedActions: ["github.*"],
      blockedActions: ["github.delete_repository"],
    });
    expect(listed?.lastUsedAt).toBeTruthy();

    await expect(
      tokens.updateTokenPolicy(created.record.id, {
        allowedActions: ["github.get_current_user"],
        blockedActions: [],
      }),
    ).resolves.toMatchObject({
      allowedActions: ["github.get_current_user"],
      blockedActions: [],
    });

    await expect(tokens.revokeToken(created.record.id)).resolves.toBe(true);
    await expect(tokens.listTokens()).resolves.toEqual([]);
    await expect(tokens.verifyToken(created.token)).resolves.toBe(false);
    await expect(tokens.revokeToken(created.record.id)).resolves.toBe(false);
  });

  it("persists the singleton runtime policy", async () => {
    const database = new D1RuntimeDatabase(new SqliteD1Database());
    const record = {
      rules: {
        allowedActions: ["github.*"],
        blockedActions: [],
        allowedProxies: ["github"],
        blockedProxies: ["slack"],
      },
      updatedAt: "2026-07-20T00:00:00.000Z",
    };

    await expect(database.runtimePolicyStore.get()).resolves.toBeUndefined();
    await database.runtimePolicyStore.set(record);
    await expect(database.runtimePolicyStore.get()).resolves.toEqual(record);
  });

  it("atomically claims idempotency keys", async () => {
    const database = new D1RuntimeDatabase(new SqliteD1Database());

    const results = await Promise.all([
      database.idempotencyStore.claim({
        keyHash: "key-1",
        requestHash: "request-1",
        claimId: "claim-1",
        now: "2026-06-30T00:00:00.000Z",
        expiresAt: "2026-07-01T00:00:00.000Z",
      }),
      database.idempotencyStore.claim({
        keyHash: "key-1",
        requestHash: "request-1",
        claimId: "claim-2",
        now: "2026-06-30T00:00:00.000Z",
        expiresAt: "2026-07-01T00:00:00.000Z",
      }),
    ]);

    expect(results.map((result) => result.kind).sort()).toEqual(["acquired", "in_progress"]);
  });

  it("detects idempotency conflicts and replays completed responses", async () => {
    const database = new D1RuntimeDatabase(new SqliteD1Database());
    const claim = {
      keyHash: "key-1",
      requestHash: "request-1",
      claimId: "claim-1",
      now: "2026-06-30T00:00:00.000Z",
      expiresAt: "2026-07-01T00:00:00.000Z",
    };

    await expect(database.idempotencyStore.claim(claim)).resolves.toEqual({ kind: "acquired" });
    await expect(
      database.idempotencyStore.claim({ ...claim, requestHash: "request-2", claimId: "claim-2" }),
    ).resolves.toEqual({ kind: "conflict" });

    const response = successResponse({ id: "message-1" });
    await expect(
      database.idempotencyStore.complete({
        keyHash: claim.keyHash,
        requestHash: claim.requestHash,
        claimId: claim.claimId,
        response,
        expiresAt: "2026-07-01T00:01:00.000Z",
      }),
    ).resolves.toBe(true);
    await expect(database.idempotencyStore.claim({ ...claim, claimId: "claim-3" })).resolves.toEqual({
      kind: "completed",
      response,
    });
  });

  it("rejects malformed persisted idempotency responses", async () => {
    const d1 = new SqliteD1Database();
    const database = new D1RuntimeDatabase(d1);
    const claim = {
      keyHash: "key-1",
      requestHash: "request-1",
      claimId: "claim-1",
      now: "2026-06-30T00:00:00.000Z",
      expiresAt: "2026-07-01T00:00:00.000Z",
    };
    await database.idempotencyStore.claim(claim);
    await database.idempotencyStore.complete({
      ...claim,
      response: successResponse({ id: "message-1" }),
    });
    await d1
      .prepare("update idempotency_records set response_value = ? where key_hash = ?")
      .bind(
        JSON.stringify({ status: 500, body: { success: true, message: "OK", data: null, meta: {} } }),
        claim.keyHash,
      )
      .run();

    await expect(database.idempotencyStore.claim({ ...claim, claimId: "claim-2" })).rejects.toThrow(
      "Invalid persisted action response",
    );
  });

  it("expires claims without allowing stale executions to complete their replacements", async () => {
    const database = new D1RuntimeDatabase(new SqliteD1Database());
    const oldClaim = {
      keyHash: "key-1",
      requestHash: "request-1",
      claimId: "claim-old",
      now: "2026-06-30T00:00:00.000Z",
      expiresAt: "2026-06-30T00:01:00.000Z",
    };

    await expect(database.idempotencyStore.claim(oldClaim)).resolves.toEqual({ kind: "acquired" });

    const newClaim = {
      ...oldClaim,
      claimId: "claim-new",
      now: oldClaim.expiresAt,
      expiresAt: "2026-07-01T00:01:00.000Z",
    };
    await expect(database.idempotencyStore.claim(newClaim)).resolves.toEqual({ kind: "acquired" });
    await expect(
      database.idempotencyStore.complete({
        keyHash: oldClaim.keyHash,
        requestHash: oldClaim.requestHash,
        claimId: oldClaim.claimId,
        response: successResponse({ source: "old" }),
        expiresAt: "2026-07-01T00:00:00.000Z",
      }),
    ).resolves.toBe(false);

    const response = successResponse({ source: "new" });
    await expect(
      database.idempotencyStore.complete({
        keyHash: newClaim.keyHash,
        requestHash: newClaim.requestHash,
        claimId: newClaim.claimId,
        response,
        expiresAt: "2026-07-01T00:01:00.000Z",
      }),
    ).resolves.toBe(true);
    await expect(database.idempotencyStore.claim(newClaim)).resolves.toEqual({ kind: "completed", response });
  });

  it("stores completed idempotency responses through the secret codec", async () => {
    const d1 = new SqliteD1Database();
    const database = new D1RuntimeDatabase(d1, {
      secretCodec: new AesGcmSecretCodec("local-test-key"),
    });
    const claim = {
      keyHash: "key-1",
      requestHash: "request-1",
      claimId: "claim-1",
      now: "2026-06-30T00:00:00.000Z",
      expiresAt: "2026-07-01T00:00:00.000Z",
    };
    const response = successResponse({ token: "provider-secret" });

    await database.idempotencyStore.claim(claim);
    await database.idempotencyStore.complete({
      keyHash: claim.keyHash,
      requestHash: claim.requestHash,
      claimId: claim.claimId,
      response,
      expiresAt: claim.expiresAt,
    });

    expect(d1.value("idempotency_records", "key_hash", claim.keyHash, "response_value")).not.toContain(
      "provider-secret",
    );
    await expect(database.idempotencyStore.claim(claim)).resolves.toEqual({ kind: "completed", response });
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

  it("filters recent runs by service before paginating", async () => {
    const database = new D1RuntimeDatabase(new SqliteD1Database(), { runLimit: 5 });

    await database.runLogStore.add(createRun("gmail-1", "2026-06-30T00:00:00.000Z", "mail.search_threads", "gmail"));
    await database.runLogStore.add(createRun("hackernews-1", "2026-06-30T00:00:01.000Z", "news.get_top_stories"));
    await database.runLogStore.add(createRun("gmail-2", "2026-06-30T00:00:02.000Z", "mail.list_threads", "gmail"));

    const first = await database.runLogStore.list({ service: "gmail", limit: 1 });
    expect(first.items.map((run) => run.id)).toEqual(["gmail-2"]);
    expect(first.nextCursor).toBeTruthy();

    const second = await database.runLogStore.list({ service: "gmail", limit: 1, cursor: first.nextCursor });
    expect(second.items.map((run) => run.id)).toEqual(["gmail-1"]);
    expect(second.nextCursor).toBeUndefined();
  });

  it("filters runs by action, caller, and status and reads one run by id", async () => {
    const database = new D1RuntimeDatabase(new SqliteD1Database(), { runLimit: 5 });
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

  it("keeps an inserted run when retention cleanup fails", async () => {
    const d1 = new SqliteD1Database();
    const database = new D1RuntimeDatabase(d1, { runLimit: 1 });
    await database.runLogStore.add(createRun("run-1", "2026-06-30T00:00:00.000Z"));
    d1.exec(`
      create trigger fail_run_retention before delete on runs begin
        select raise(abort, 'retention failed');
      end;
    `);

    await expect(database.runLogStore.add(createRun("run-2", "2026-06-30T00:00:01.000Z"))).resolves.toEqual({
      retentionApplied: false,
    });
    await expect(database.runLogStore.get("run-2")).resolves.toMatchObject({ id: "run-2" });
  });
});

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

class SqliteD1Database implements D1DatabaseBinding {
  private readonly database = new DatabaseSync(":memory:");

  constructor() {
    this.database.exec(readFileSync(new URL("../../../migrations/0001_runtime.sql", import.meta.url), "utf8"));
    this.database.exec(readFileSync(new URL("../../../migrations/0002_run_service.sql", import.meta.url), "utf8"));
    this.database.exec(
      readFileSync(new URL("../../../migrations/0003_action_idempotency.sql", import.meta.url), "utf8"),
    );
    this.database.exec(readFileSync(new URL("../../../migrations/0004_action_run_audit.sql", import.meta.url), "utf8"));
    this.database.exec(readFileSync(new URL("../../../migrations/0005_run_retention.sql", import.meta.url), "utf8"));
    this.database.exec(
      readFileSync(new URL("../../../migrations/0006_connection_identity.sql", import.meta.url), "utf8"),
    );
    this.database.exec(readFileSync(new URL("../../../migrations/0007_runtime_policy.sql", import.meta.url), "utf8"));
    this.database.exec(
      readFileSync(new URL("../../../migrations/0008_runtime_token_policy.sql", import.meta.url), "utf8"),
    );
  }

  prepare(query: string): D1PreparedStatementBinding {
    return new SqliteD1PreparedStatement(this.database, query);
  }

  exec(sql: string): void {
    this.database.exec(sql);
  }

  value(
    table: "connections" | "oauth_client_configs" | "idempotency_records",
    keyColumn: "service" | "key_hash",
    key: string,
    valueColumn: "value" | "response_value" = "value",
  ): string {
    const row = this.database.prepare(`select ${valueColumn} from ${table} where ${keyColumn} = ?`).get(key) as
      | Record<string, string>
      | undefined;
    return row?.[valueColumn] ?? "";
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
