import type { RuntimeActionHttpResult } from "../api/runtime-api.ts";

import { readFileSync } from "node:fs";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { AesGcmSecretCodec } from "../secrets/secret-codec.ts";
import { RuntimeTokenService } from "./runtime-token-service.ts";
import { SqliteRuntimeDatabase } from "./sqlite-runtime-store.ts";

const tempDirs: string[] = [];
const githubProfile = {
  accountId: "github:octocat",
  displayName: "octocat",
  grantedScopes: [],
};

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("SqliteRuntimeDatabase", () => {
  it("persists local runtime state across database instances", async () => {
    const databasePath = await createDatabasePath();
    const first = new SqliteRuntimeDatabase(databasePath, { runLimit: 2 });

    await first.connectionStore.set("github", "default", {
      authType: "api_key",
      apiKey: "github-token",
      values: { apiKey: "github-token" },
      profile: githubProfile,
      metadata: { login: "octocat" },
    });
    await first.oauthClientConfigStore.set({
      service: "gmail",
      clientId: "client-id",
      clientSecret: "client-secret",
      extra: { tenant: "default" },
      secretExtra: {},
    });
    await first.oauthStateStore.set({
      service: "gmail",
      state: "state-1",
      createdAt: "2026-06-30T00:00:00.000Z",
    });
    await first.runLogStore.add({
      id: "run-1",
      service: "hackernews",
      actionId: "hackernews.get_top_stories",
      caller: "http",
      startedAt: "2026-06-30T00:00:00.000Z",
      completedAt: "2026-06-30T00:00:01.000Z",
      durationMs: 1000,
      ok: true,
    });
    first.close();

    const second = new SqliteRuntimeDatabase(databasePath, { runLimit: 2 });
    await expect(second.connectionStore.get("github", "default")).resolves.toMatchObject({
      authType: "api_key",
      apiKey: "github-token",
      metadata: { login: "octocat" },
    });
    await expect(second.oauthClientConfigStore.get("gmail")).resolves.toMatchObject({
      clientId: "client-id",
      clientSecret: "client-secret",
      extra: { tenant: "default" },
    });
    await expect(second.oauthStateStore.take("state-1")).resolves.toMatchObject({
      service: "gmail",
      state: "state-1",
    });
    await expect(second.oauthStateStore.take("state-1")).resolves.toBeUndefined();
    await expect(second.runLogStore.list()).resolves.toEqual({
      items: [
        {
          id: "run-1",
          service: "hackernews",
          actionId: "hackernews.get_top_stories",
          caller: "http",
          startedAt: "2026-06-30T00:00:00.000Z",
          completedAt: "2026-06-30T00:00:01.000Z",
          durationMs: 1000,
          ok: true,
        },
      ],
    });
    second.close();
  });

  it("claims, completes, and replays idempotent responses across database instances", async () => {
    const databasePath = await createDatabasePath();
    const first = new SqliteRuntimeDatabase(databasePath);
    const claim = {
      keyHash: "key-hash",
      requestHash: "request-hash",
      claimId: "claim-1",
      now: "2026-06-30T00:00:00.000Z",
      expiresAt: "2026-07-01T00:00:00.000Z",
    };

    await expect(first.idempotencyStore.claim(claim)).resolves.toEqual({ kind: "acquired" });
    await expect(first.idempotencyStore.claim({ ...claim, claimId: "claim-2" })).resolves.toEqual({
      kind: "in_progress",
    });
    await expect(
      first.idempotencyStore.claim({ ...claim, requestHash: "different-request", claimId: "claim-3" }),
    ).resolves.toEqual({ kind: "conflict" });
    const response = successResponse({ executionId: "execution-1" });
    await expect(
      first.idempotencyStore.complete({
        keyHash: claim.keyHash,
        requestHash: claim.requestHash,
        claimId: claim.claimId,
        response,
        expiresAt: "2026-07-01T00:00:01.000Z",
      }),
    ).resolves.toBe(true);
    await expect(
      first.idempotencyStore.complete({
        keyHash: claim.keyHash,
        requestHash: claim.requestHash,
        claimId: claim.claimId,
        response,
        expiresAt: "2026-07-01T00:00:02.000Z",
      }),
    ).resolves.toBe(false);
    first.close();

    const second = new SqliteRuntimeDatabase(databasePath);
    await expect(second.idempotencyStore.claim({ ...claim, claimId: "claim-4" })).resolves.toEqual({
      kind: "completed",
      response,
    });
    second.close();
  });

  it("rejects malformed persisted idempotency responses", async () => {
    const databasePath = await createDatabasePath();
    const claim = {
      keyHash: "key-hash",
      requestHash: "request-hash",
      claimId: "claim-1",
      now: "2026-06-30T00:00:00.000Z",
      expiresAt: "2026-07-01T00:00:00.000Z",
    };
    const database = new SqliteRuntimeDatabase(databasePath);
    await database.idempotencyStore.claim(claim);
    await database.idempotencyStore.complete({
      ...claim,
      response: successResponse({ executionId: "execution-1" }),
    });
    database.close();

    const raw = new DatabaseSync(databasePath);
    raw
      .prepare("update idempotency_records set response_value = ? where key_hash = ?")
      .run(
        JSON.stringify({ status: 201, body: { success: true, message: "OK", data: null, meta: {} } }),
        claim.keyHash,
      );
    raw.close();

    const reopened = new SqliteRuntimeDatabase(databasePath);
    await expect(reopened.idempotencyStore.claim({ ...claim, claimId: "claim-2" })).rejects.toThrow(
      "Invalid persisted action response",
    );
    reopened.close();
  });

  it("shares in-progress idempotency claims across database instances", async () => {
    const databasePath = await createDatabasePath();
    const first = new SqliteRuntimeDatabase(databasePath);
    const second = new SqliteRuntimeDatabase(databasePath);
    const claim = {
      keyHash: "key-hash",
      requestHash: "request-hash",
      now: "2026-06-30T00:00:00.000Z",
      expiresAt: "2026-07-01T00:00:00.000Z",
    };

    await expect(first.idempotencyStore.claim({ ...claim, claimId: "claim-1" })).resolves.toEqual({
      kind: "acquired",
    });
    await expect(second.idempotencyStore.claim({ ...claim, claimId: "claim-2" })).resolves.toEqual({
      kind: "in_progress",
    });
    first.close();
    second.close();
  });

  it("reclaims expired keys without allowing stale claims to complete", async () => {
    const databasePath = await createDatabasePath();
    const database = new SqliteRuntimeDatabase(databasePath);
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
    const staleResponse = successResponse({ claim: "stale" });
    const response = successResponse({ claim: "current" });

    await expect(database.idempotencyStore.claim(first)).resolves.toEqual({ kind: "acquired" });
    await expect(database.idempotencyStore.claim(second)).resolves.toEqual({ kind: "acquired" });
    await expect(
      database.idempotencyStore.complete({
        keyHash: first.keyHash,
        requestHash: first.requestHash,
        claimId: first.claimId,
        response: staleResponse,
        expiresAt: "2026-06-30T03:00:00.000Z",
      }),
    ).resolves.toBe(false);
    await expect(
      database.idempotencyStore.complete({
        keyHash: second.keyHash,
        requestHash: second.requestHash,
        claimId: second.claimId,
        response,
        expiresAt: "2026-06-30T03:00:00.000Z",
      }),
    ).resolves.toBe(true);
    await expect(
      database.idempotencyStore.claim({
        ...second,
        claimId: "claim-3",
        now: "2026-06-30T02:30:00.000Z",
      }),
    ).resolves.toEqual({
      kind: "completed",
      response,
    });
    database.close();
  });

  it("keeps only the configured number of recent runs", async () => {
    const databasePath = await createDatabasePath();
    const database = new SqliteRuntimeDatabase(databasePath, { runLimit: 2 });

    await database.runLogStore.add(createRun("run-1", "2026-06-30T00:00:00.000Z"));
    await database.runLogStore.add(createRun("run-2", "2026-06-30T00:00:01.000Z"));
    await database.runLogStore.add(createRun("run-3", "2026-06-30T00:00:02.000Z"));

    await expect(database.runLogStore.list()).resolves.toMatchObject({
      items: [{ id: "run-3" }, { id: "run-2" }],
    });
    database.close();
  });

  it("paginates recent runs with a cursor", async () => {
    const databasePath = await createDatabasePath();
    const database = new SqliteRuntimeDatabase(databasePath, { runLimit: 4 });

    await database.runLogStore.add(createRun("run-1", "2026-06-30T00:00:00.000Z"));
    await database.runLogStore.add(createRun("run-2", "2026-06-30T00:00:01.000Z"));
    await database.runLogStore.add(createRun("run-3", "2026-06-30T00:00:02.000Z"));

    const first = await database.runLogStore.list({ limit: 2 });
    expect(first.items.map((run) => run.id)).toEqual(["run-3", "run-2"]);
    expect(first.nextCursor).toBeTruthy();

    const second = await database.runLogStore.list({ limit: 2, cursor: first.nextCursor });
    expect(second.items.map((run) => run.id)).toEqual(["run-1"]);
    expect(second.nextCursor).toBeUndefined();
    database.close();
  });

  it("filters recent runs by service before paginating", async () => {
    const databasePath = await createDatabasePath();
    const database = new SqliteRuntimeDatabase(databasePath, { runLimit: 5 });

    await database.runLogStore.add(createRun("gmail-1", "2026-06-30T00:00:00.000Z", "mail.search_threads", "gmail"));
    await database.runLogStore.add(createRun("hackernews-1", "2026-06-30T00:00:01.000Z", "news.get_top_stories"));
    await database.runLogStore.add(createRun("gmail-2", "2026-06-30T00:00:02.000Z", "mail.list_threads", "gmail"));

    const first = await database.runLogStore.list({ service: "gmail", limit: 1 });
    expect(first.items.map((run) => run.id)).toEqual(["gmail-2"]);
    expect(first.nextCursor).toBeTruthy();

    const second = await database.runLogStore.list({ service: "gmail", limit: 1, cursor: first.nextCursor });
    expect(second.items.map((run) => run.id)).toEqual(["gmail-1"]);
    expect(second.nextCursor).toBeUndefined();
    database.close();
  });

  it("applies pending runtime migrations to existing local databases", async () => {
    const databasePath = await createDatabasePath();
    const legacy = new DatabaseSync(databasePath);
    legacy.exec(readFileSync(new URL("../../../migrations/0001_runtime.sql", import.meta.url), "utf8"));
    legacy
      .prepare(
        `
        insert into runs (id, action_id, started_at, completed_at, ok, value)
        values (?, ?, ?, ?, ?, ?)
      `,
      )
      .run(
        "legacy-gmail",
        "gmail.search_threads",
        "2026-06-30T00:00:00.000Z",
        "2026-06-30T00:00:01.000Z",
        1,
        JSON.stringify({
          id: "legacy-gmail",
          actionId: "gmail.search_threads",
          caller: "http",
          startedAt: "2026-06-30T00:00:00.000Z",
          completedAt: "2026-06-30T00:00:01.000Z",
          durationMs: 1000,
          ok: true,
        }),
      );
    legacy.close();

    const migrated = new SqliteRuntimeDatabase(databasePath, { runLimit: 5 });
    await expect(migrated.runLogStore.list({ service: "gmail" })).resolves.toMatchObject({
      items: [{ id: "legacy-gmail", service: "gmail" }],
    });
    await expect(
      migrated.idempotencyStore.claim({
        keyHash: "key-hash",
        requestHash: "request-hash",
        claimId: "claim-1",
        now: "2026-06-30T00:00:00.000Z",
        expiresAt: "2026-07-01T00:00:00.000Z",
      }),
    ).resolves.toEqual({ kind: "acquired" });
    migrated.close();
  });

  it("encrypts stored credentials when a secret codec is configured", async () => {
    const databasePath = await createDatabasePath();
    const first = new SqliteRuntimeDatabase(databasePath, {
      secretCodec: new AesGcmSecretCodec("local-test-key"),
    });

    await first.connectionStore.set("github", "default", {
      authType: "api_key",
      apiKey: "github-token",
      values: { apiKey: "github-token" },
      profile: githubProfile,
      metadata: {},
    });
    const claim = {
      keyHash: "key-hash",
      requestHash: "request-hash",
      claimId: "claim-1",
      now: "2026-06-30T00:00:00.000Z",
      expiresAt: "2026-07-01T00:00:00.000Z",
    };
    await first.idempotencyStore.claim(claim);
    await first.idempotencyStore.complete({
      keyHash: claim.keyHash,
      requestHash: claim.requestHash,
      claimId: claim.claimId,
      response: successResponse({ token: "idempotency-secret" }),
      expiresAt: claim.expiresAt,
    });
    first.close();

    await expectDatabaseDirectoryNotToContain(databasePath, "github-token");
    await expectDatabaseDirectoryNotToContain(databasePath, "idempotency-secret");

    const second = new SqliteRuntimeDatabase(databasePath, {
      secretCodec: new AesGcmSecretCodec("local-test-key"),
    });
    await expect(second.connectionStore.get("github", "default")).resolves.toMatchObject({
      authType: "api_key",
      apiKey: "github-token",
    });
    await expect(second.idempotencyStore.claim({ ...claim, claimId: "claim-2" })).resolves.toEqual({
      kind: "completed",
      response: successResponse({ token: "idempotency-secret" }),
    });
    second.close();
  });

  it("stores runtime token hashes and supports verification and revocation", async () => {
    const databasePath = await createDatabasePath();
    const database = new SqliteRuntimeDatabase(databasePath);
    const tokens = new RuntimeTokenService(database.runtimeTokenStore);

    const created = await tokens.createToken("Claude Desktop");
    expect(created.token).toMatch(/^oct_/);
    expect(created.record.name).toBe("Claude Desktop");
    expect(created.record.tokenHash).not.toBe(created.token);
    await expectDatabaseDirectoryNotToContain(databasePath, created.token);

    await expect(tokens.verifyToken(created.token)).resolves.toBe(true);
    const [listed] = await tokens.listTokens();
    expect(listed).toMatchObject({
      id: created.record.id,
      name: "Claude Desktop",
    });
    expect(listed?.lastUsedAt).toBeTruthy();
    expect(JSON.stringify(listed)).not.toContain(created.token);

    await expect(tokens.revokeToken(created.record.id)).resolves.toBe(true);
    await expect(tokens.listTokens()).resolves.toEqual([]);
    await expect(tokens.verifyToken(created.token)).resolves.toBe(false);
    await expect(tokens.revokeToken(created.record.id)).resolves.toBe(false);
    database.close();
  });

  it("resets runtime data", async () => {
    const databasePath = await createDatabasePath();
    const database = new SqliteRuntimeDatabase(databasePath);
    await database.connectionStore.set("github", "default", {
      authType: "api_key",
      apiKey: "github-token",
      values: { apiKey: "github-token" },
      profile: githubProfile,
      metadata: {},
    });
    await database.runLogStore.add(createRun("run-1", "2026-06-30T00:00:00.000Z"));
    await database.idempotencyStore.claim({
      keyHash: "key-hash",
      requestHash: "request-hash",
      claimId: "claim-1",
      now: "2026-06-30T00:00:00.000Z",
      expiresAt: "2026-07-01T00:00:00.000Z",
    });

    database.resetRuntimeData();

    await expect(database.connectionStore.get("github", "default")).resolves.toBeUndefined();
    await expect(database.runLogStore.list()).resolves.toEqual({ items: [] });
    await expect(
      database.idempotencyStore.claim({
        keyHash: "key-hash",
        requestHash: "request-hash",
        claimId: "claim-2",
        now: "2026-06-30T00:01:00.000Z",
        expiresAt: "2026-07-01T00:01:00.000Z",
      }),
    ).resolves.toEqual({ kind: "acquired" });
    database.close();
  });

  it("rotates stored secret encryption without resetting other runtime data", async () => {
    const databasePath = await createDatabasePath();
    const database = new SqliteRuntimeDatabase(databasePath, {
      secretCodec: new AesGcmSecretCodec("old-key"),
    });
    const tokens = new RuntimeTokenService(database.runtimeTokenStore);
    const token = await tokens.createToken("Claude Desktop");
    await database.connectionStore.set("github", "default", {
      authType: "api_key",
      apiKey: "github-token",
      values: { apiKey: "github-token" },
      profile: githubProfile,
      metadata: {},
    });
    await database.oauthClientConfigStore.set({
      service: "gmail",
      clientId: "client-id",
      clientSecret: "client-secret",
      extra: {},
      secretExtra: {},
    });
    const claim = {
      keyHash: "key-hash",
      requestHash: "request-hash",
      claimId: "claim-1",
      now: "2026-06-30T00:00:00.000Z",
      expiresAt: "2026-07-01T00:00:00.000Z",
    };
    await database.idempotencyStore.claim(claim);
    await database.idempotencyStore.complete({
      keyHash: claim.keyHash,
      requestHash: claim.requestHash,
      claimId: claim.claimId,
      response: successResponse({ token: "rotated-idempotency-secret" }),
      expiresAt: claim.expiresAt,
    });
    await database.runLogStore.add(createRun("run-1", "2026-06-30T00:00:00.000Z"));
    await database.rotateSecretCodec(new AesGcmSecretCodec("new-key"));
    database.close();

    const withOldKey = new SqliteRuntimeDatabase(databasePath, {
      secretCodec: new AesGcmSecretCodec("old-key"),
    });
    await expect(withOldKey.connectionStore.get("github", "default")).rejects.toThrow();
    await expect(withOldKey.idempotencyStore.claim({ ...claim, claimId: "claim-2" })).rejects.toThrow();
    withOldKey.close();

    const withNewKey = new SqliteRuntimeDatabase(databasePath, {
      secretCodec: new AesGcmSecretCodec("new-key"),
    });
    await expect(withNewKey.connectionStore.get("github", "default")).resolves.toMatchObject({
      authType: "api_key",
      apiKey: "github-token",
    });
    await expect(withNewKey.oauthClientConfigStore.get("gmail")).resolves.toMatchObject({
      clientSecret: "client-secret",
    });
    await expect(withNewKey.runtimeTokenStore.list()).resolves.toMatchObject([{ id: token.record.id }]);
    await expect(withNewKey.runLogStore.list()).resolves.toMatchObject({ items: [{ id: "run-1" }] });
    await expect(withNewKey.idempotencyStore.claim({ ...claim, claimId: "claim-3" })).resolves.toEqual({
      kind: "completed",
      response: successResponse({ token: "rotated-idempotency-secret" }),
    });
    withNewKey.close();
  });
});

async function createDatabasePath(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "oomol-connect-"));
  tempDirs.push(dir);
  return join(dir, "connect.sqlite");
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

async function expectDatabaseDirectoryNotToContain(databasePath: string, needle: string): Promise<void> {
  const dir = dirname(databasePath);
  const entries = await readdir(dir);
  for (const entry of entries) {
    const bytes = await readFile(join(dir, entry), "utf8");
    expect(bytes).not.toContain(needle);
  }
}
