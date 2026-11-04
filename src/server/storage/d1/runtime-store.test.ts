import type { RuntimeActionHttpResult } from "../../api/runtime-api.ts";
import type { D1DatabaseBinding, D1PreparedStatementBinding } from "../../cloudflare/cloudflare-bindings.ts";

import { beforeEach, describe, expect, it } from "vitest";
import { AesGcmSecretCodec } from "../../secrets/secret-codec.ts";
import { connectionRequestStoreTests } from "../connection-request-store.cases.ts";
import { RuntimeTokenService } from "../runtime-token-service.ts";
import { saasProjectStoreTests } from "../saas-project-store.cases.ts";
import { triggerStoreTests } from "../trigger-store.cases.ts";
import { D1RuntimeDatabase } from "./runtime-store.ts";
import { SqliteD1Database } from "./test-database.ts";

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
      requestedScopes: ["gmail.readonly"],
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
      requestedScopes: ["gmail.readonly"],
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

  it("preserves connection identity and rejects stale credential revisions", async () => {
    const database = new D1RuntimeDatabase(new SqliteD1Database(), { secretCodec: new AesGcmSecretCodec("saas-test") });
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
    expect(updated.revision).not.toBe(created.revision);
    await expect(
      database.connectionStore.updateCredential({
        ...created,
        credential: { ...credential, apiKey: "stale-refreshed-token" },
      }),
    ).resolves.toBe(false);
    await expect(
      database.connectionStore.updateCredential({
        ...updated,
        credential: { ...credential, apiKey: "refreshed-token" },
      }),
    ).resolves.toBe(true);
    await expect(
      database.connectionStore.updateCredential({
        ...updated,
        credential: { ...credential, apiKey: "second-refreshed-token" },
      }),
    ).resolves.toBe(false);
    await expect(database.connectionStore.get("github", "default")).resolves.toMatchObject({
      id: updated.id,
      credential: { apiKey: "refreshed-token" },
    });

    await database.connectionStore.delete("github", "default");
    const recreated = await database.connectionStore.set("github", "default", credential);
    expect(recreated.id).not.toBe(updated.id);
    await expect(
      database.connectionStore.updateCredential({
        ...updated,
        credential: { ...credential, apiKey: "stale-refreshed-token" },
      }),
    ).resolves.toBe(false);
    await expect(database.connectionStore.get("github", "default")).resolves.toMatchObject({
      id: recreated.id,
      credential: { apiKey: "github-token" },
    });
  });

  it("takes OAuth state once", async () => {
    const database = new D1RuntimeDatabase(new SqliteD1Database(), { secretCodec: new AesGcmSecretCodec("saas-test") });

    await database.oauthStateStore.set({
      service: "gmail",
      retirementGeneration: await database.connectionStore.getRetirementGeneration("gmail", "default"),
      state: "state-1",
      createdAt: "2026-06-30T00:00:00.000Z",
    });

    await expect(database.oauthStateStore.take("state-1")).resolves.toMatchObject({
      service: "gmail",
      state: "state-1",
    });
    await expect(database.oauthStateStore.take("state-1")).resolves.toBeUndefined();
  });

  it("deletes OAuth states created before a cutoff", async () => {
    const database = new D1RuntimeDatabase(new SqliteD1Database(), { secretCodec: new AesGcmSecretCodec("saas-test") });
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

  it("stores OAuth state through the secret codec", async () => {
    const d1 = new SqliteD1Database();
    const database = new D1RuntimeDatabase(d1, {
      secretCodec: new AesGcmSecretCodec("local-test-key"),
    });
    await database.oauthStateStore.set({
      service: "github",
      retirementGeneration: await database.connectionStore.getRetirementGeneration("github", "default"),
      state: "state-1",
      createdAt: "2026-06-30T00:00:00.000Z",
      clientConfig: {
        service: "github",
        clientId: "client-id",
        clientSecret: "client-secret",
        extra: {},
        secretExtra: {},
      },
    });

    expect(d1.value("oauth_states", "state", "state-1")).not.toContain("client-secret");
    await expect(database.oauthStateStore.take("state-1")).resolves.toMatchObject({
      clientConfig: { clientSecret: "client-secret" },
    });
  });

  it("stores runtime token hashes and supports verification and revocation", async () => {
    const database = new D1RuntimeDatabase(new SqliteD1Database(), { secretCodec: new AesGcmSecretCodec("saas-test") });
    const tokens = new RuntimeTokenService(database.runtimeTokenStore);

    const created = await tokens.createToken("Claude Desktop", {
      allowedActions: ["github.*"],
      blockedActions: ["github.delete_repository"],
      allowedProxies: ["github"],
      allowedConnections: ["example:work"],
    });
    expect(created.token).toMatch(/^oct_/);
    expect(created.record.tokenHash).not.toBe(created.token);
    expect(created.record.allowedConnections).toEqual(["example:work"]);

    await expect(tokens.verifyToken(created.token)).resolves.toBe(true);
    const [listed] = await tokens.listTokens();
    expect(listed).toMatchObject({
      id: created.record.id,
      name: "Claude Desktop",
      allowedActions: ["github.*"],
      blockedActions: ["github.delete_repository"],
      allowedProxies: ["github"],
      allowedConnections: ["example:work"],
    });
    expect(listed?.lastUsedAt).toBeTruthy();
    await expect(tokens.resolveToken(created.token)).resolves.toMatchObject({
      tokenId: created.record.id,
      allowedConnections: ["example:work"],
    });

    await expect(
      tokens.updateTokenPolicy(created.record.id, {
        allowedActions: ["github.get_current_user"],
        blockedActions: [],
        allowedProxies: ["slack"],
        allowedConnections: ["example:personal"],
      }),
    ).resolves.toMatchObject({
      allowedActions: ["github.get_current_user"],
      blockedActions: [],
      allowedProxies: ["slack"],
      allowedConnections: ["example:personal"],
    });
    await expect(tokens.resolveToken(created.token)).resolves.toMatchObject({
      allowedConnections: ["example:personal"],
    });

    await expect(tokens.revokeToken(created.record.id)).resolves.toBe(true);
    await expect(tokens.listTokens()).resolves.toEqual([]);
    await expect(tokens.verifyToken(created.token)).resolves.toBe(false);
    await expect(tokens.revokeToken(created.record.id)).resolves.toBe(false);
  });

  it("defaults omitted allowedConnections to an unrestricted empty list", async () => {
    const database = new D1RuntimeDatabase(new SqliteD1Database(), { secretCodec: new AesGcmSecretCodec("saas-test") });
    const tokens = new RuntimeTokenService(database.runtimeTokenStore);
    const created = await tokens.createToken("Open token");
    expect(created.record.allowedConnections).toEqual([]);
    await expect(tokens.listTokens()).resolves.toMatchObject([{ allowedConnections: [] }]);
    await expect(tokens.resolveToken(created.token)).resolves.toMatchObject({ allowedConnections: [] });
  });

  it("defaults missing allowedConnections to an unrestricted empty list", async () => {
    const d1 = new SqliteD1Database();
    d1.exec(
      `insert into runtime_tokens (id, name, token_hash, created_at) values ('legacy-token', 'Legacy', 'legacy-hash', '2026-06-30T00:00:00.000Z')`,
    );
    const database = new D1RuntimeDatabase(d1);
    await expect(database.runtimeTokenStore.list()).resolves.toMatchObject([
      {
        id: "legacy-token",
        allowedActions: [],
        blockedActions: [],
        allowedProxies: [],
        allowedConnections: [],
      },
    ]);
  });

  it("persists the singleton runtime policy", async () => {
    const database = new D1RuntimeDatabase(new SqliteD1Database(), { secretCodec: new AesGcmSecretCodec("saas-test") });
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
    const database = new D1RuntimeDatabase(new SqliteD1Database(), { secretCodec: new AesGcmSecretCodec("saas-test") });

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

  // The claim used to issue its expiry delete, insert, and select as separate
  // statements, giving a concurrent claim's expiry sweep a window to remove the
  // competing row between the insert conflict and the select. That surfaced the
  // internal "record disappeared" error (a 500) instead of the stored result.
  it("keeps the stored claim when a concurrent expiry sweep removes the competing row", async () => {
    const d1 = new SqliteD1Database();
    await d1
      .prepare(
        `
        insert into idempotency_records (key_hash, claim_id, request_hash, state, response_value, created_at, expires_at)
        values (?, ?, ?, 'in_progress', null, ?, ?)
      `,
      )
      .bind("key-1", "claim-existing", "request-1", "2026-06-29T23:59:59.000Z", "2026-06-30T00:00:01.000Z")
      .run();
    const racing = new SweepingD1Database(d1);
    racing.armSweep("key-1");
    const database = new D1RuntimeDatabase(racing, { secretCodec: new AesGcmSecretCodec("d1-race-test") });

    await expect(
      database.idempotencyStore.claim({
        keyHash: "key-1",
        requestHash: "request-1",
        claimId: "claim-racing",
        now: "2026-06-30T00:00:00.000Z",
        expiresAt: "2026-07-01T00:00:00.000Z",
      }),
    ).resolves.toEqual({ kind: "in_progress" });
  });

  it("detects idempotency conflicts and replays completed responses", async () => {
    const database = new D1RuntimeDatabase(new SqliteD1Database(), { secretCodec: new AesGcmSecretCodec("saas-test") });
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
    const database = new D1RuntimeDatabase(new SqliteD1Database(), { secretCodec: new AesGcmSecretCodec("saas-test") });
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

  it("upserts the marketplace config and provider preferences", async () => {
    const database = new D1RuntimeDatabase(new SqliteD1Database(), { secretCodec: new AesGcmSecretCodec("saas-test") });

    await expect(database.marketplaceStore.getConfig()).resolves.toBeUndefined();

    await database.marketplaceStore.setConfig({
      discoveryUrl: "https://marketplace.example.com/discovery",
      apiKeyEncrypted: "encrypted-one",
      enabled: false,
      createdAt: "2026-06-30T00:00:00.000Z",
      updatedAt: "2026-06-30T00:00:00.000Z",
    });
    await database.marketplaceStore.setConfig({
      discoveryUrl: "https://marketplace.example.com/discovery",
      apiKeyEncrypted: "encrypted-two",
      enabled: true,
      createdAt: "2026-06-30T00:00:00.000Z",
      updatedAt: "2026-06-30T00:00:05.000Z",
    });

    await expect(database.marketplaceStore.getConfig()).resolves.toEqual({
      discoveryUrl: "https://marketplace.example.com/discovery",
      apiKeyEncrypted: "encrypted-two",
      enabled: true,
      createdAt: "2026-06-30T00:00:00.000Z",
      updatedAt: "2026-06-30T00:00:05.000Z",
    });

    await expect(database.marketplaceStore.listProviderPreferences()).resolves.toEqual([]);

    await database.marketplaceStore.setProviderPreference({
      service: "gmail",
      enabled: true,
      createdAt: "2026-06-30T00:00:00.000Z",
      updatedAt: "2026-06-30T00:00:00.000Z",
    });
    await database.marketplaceStore.setProviderPreference({
      service: "gmail",
      enabled: false,
      createdAt: "2026-06-30T00:00:09.000Z",
      updatedAt: "2026-06-30T00:00:09.000Z",
    });
    await database.marketplaceStore.setProviderPreference({
      service: "abuseipdb",
      enabled: true,
      createdAt: "2026-06-30T00:00:02.000Z",
      updatedAt: "2026-06-30T00:00:02.000Z",
    });

    // Ordered by service, and the second gmail write keeps createdAt while replacing enabled/updatedAt.
    await expect(database.marketplaceStore.listProviderPreferences()).resolves.toEqual([
      {
        service: "abuseipdb",
        enabled: true,
        createdAt: "2026-06-30T00:00:02.000Z",
        updatedAt: "2026-06-30T00:00:02.000Z",
      },
      {
        service: "gmail",
        enabled: false,
        createdAt: "2026-06-30T00:00:00.000Z",
        updatedAt: "2026-06-30T00:00:09.000Z",
      },
    ]);

    await database.marketplaceStore.deleteConfig();
    await expect(database.marketplaceStore.getConfig()).resolves.toBeUndefined();
    await expect(database.marketplaceStore.listProviderPreferences()).resolves.toHaveLength(2);
  });

  it("rotates OAuth refresh tokens atomically with their successor", async () => {
    const database = new D1RuntimeDatabase(new SqliteD1Database(), { secretCodec: new AesGcmSecretCodec("saas-test") });
    const now = Date.now();
    const base = {
      clientId: "client-1",
      runtimeTokenId: "grant-1",
      scope: "mcp:access offline_access",
      issuedAt: new Date(now).toISOString(),
      expiresAt: now + 3_600_000,
      refreshExpiresAt: now + 86_400_000,
    };
    await database.oauthTokenStore.add({ ...base, tokenHash: "access-1", refreshTokenHash: "refresh-1" });

    const consumed = await database.oauthTokenStore.rotateRefreshToken("refresh-1", {
      ...base,
      tokenHash: "access-1b",
      refreshTokenHash: "refresh-1b",
    });
    expect(consumed).toMatchObject({
      tokenHash: "access-1",
      clientId: "client-1",
      refreshTokenHash: "refresh-1",
      refreshConsumedAt: expect.any(Number),
    });
    await expect(database.oauthTokenStore.findByAccessTokenHash("access-1b")).resolves.toMatchObject({
      tokenHash: "access-1b",
      refreshTokenHash: "refresh-1b",
    });

    // The consumed row stays findable by hash (with refreshConsumedAt set)
    // so a replayed token maps back to its grant, but a second rotation
    // fails and inserts nothing.
    await expect(
      database.oauthTokenStore.rotateRefreshToken("refresh-1", {
        ...base,
        tokenHash: "access-1c",
        refreshTokenHash: "refresh-1c",
      }),
    ).resolves.toBeUndefined();
    await expect(database.oauthTokenStore.findByAccessTokenHash("access-1c")).resolves.toBeUndefined();
  });

  it("deletes fully expired tokens, including consumed refresh rows", async () => {
    const database = new D1RuntimeDatabase(new SqliteD1Database(), { secretCodec: new AesGcmSecretCodec("saas-test") });
    const now = Date.now();
    await database.oauthTokenStore.add({
      tokenHash: "gone",
      clientId: "client-1",
      runtimeTokenId: "grant-1",
      scope: "mcp:access",
      issuedAt: new Date(now - 120_000).toISOString(),
      expiresAt: now - 60_000,
    });
    await database.oauthTokenStore.add({
      tokenHash: "kept",
      refreshTokenHash: "kept-refresh",
      clientId: "client-1",
      runtimeTokenId: "grant-1",
      scope: "mcp:access offline_access",
      issuedAt: new Date(now - 120_000).toISOString(),
      expiresAt: now - 60_000,
      refreshExpiresAt: now + 60_000,
    });
    // A consumed refresh token is swept on the same refreshExpiresAt clock:
    // once that passes it is cleaned up like any other row.
    await database.oauthTokenStore.add({
      tokenHash: "consumed",
      refreshTokenHash: "consumed-refresh",
      clientId: "client-1",
      runtimeTokenId: "grant-1",
      scope: "mcp:access offline_access",
      issuedAt: new Date(now - 120_000).toISOString(),
      expiresAt: now - 60_000,
      refreshExpiresAt: now - 1_000,
      refreshConsumedAt: now - 90_000,
    });
    await database.oauthTokenStore.deleteExpired(now);
    await expect(database.oauthTokenStore.findByAccessTokenHash("gone")).resolves.toBeUndefined();
    await expect(database.oauthTokenStore.findByAccessTokenHash("kept")).resolves.toMatchObject({
      tokenHash: "kept",
    });
    await expect(database.oauthTokenStore.findByAccessTokenHash("consumed")).resolves.toBeUndefined();
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

describe("D1 connection requests", () => {
  let database: D1RuntimeDatabase;
  beforeEach(() => {
    database = new D1RuntimeDatabase(new SqliteD1Database(), { secretCodec: new AesGcmSecretCodec("saas-test") });
  });
  connectionRequestStoreTests(() => database);
  triggerStoreTests(() => database);
  saasProjectStoreTests(() => database);
});

/**
 * A D1 database double that lets another instance's expiry sweep run between the
 * claim's standalone statements, which is the interleaving a transactional batch
 * removes. The sweep fires only after a conflicting insert on the standalone
 * path; a batched claim has no such window.
 */
class SweepingD1Database implements D1DatabaseBinding {
  private sweepKeyHash: string | undefined;
  private readonly database: SqliteD1Database;

  constructor(database: SqliteD1Database) {
    this.database = database;
  }

  armSweep(keyHash: string): void {
    this.sweepKeyHash = keyHash;
  }

  prepare(query: string): D1PreparedStatementBinding {
    return new SweepingPreparedStatement(this, this.database.prepare(query), query);
  }

  async batch(statements: D1PreparedStatementBinding[]): Promise<{ results: Record<string, unknown>[] | null }[]> {
    // Sweep after a conflicting batched insert too, before the caller can issue
    // any standalone lookup. Otherwise a claim that leaves its select outside
    // the transaction would still pass this test while keeping the race.
    const insertIndex = statements.findIndex(
      (statement) =>
        statement instanceof SweepingPreparedStatement &&
        this.sweepKeyHash !== undefined &&
        statement.insertKeyHash() === this.sweepKeyHash,
    );
    const results = await this.database.batch(statements);
    if (insertIndex !== -1 && (results[insertIndex]?.results?.length ?? 0) === 0) {
      await this.sweepAfterInsertConflict(String(this.sweepKeyHash));
    }
    return results;
  }

  async sweepAfterInsertConflict(keyHash: string): Promise<void> {
    if (this.sweepKeyHash !== keyHash) {
      return;
    }
    this.sweepKeyHash = undefined;
    await this.database.prepare("delete from idempotency_records where key_hash = ?").bind(keyHash).run();
  }
}

class SweepingPreparedStatement implements D1PreparedStatementBinding {
  private readonly owner: SweepingD1Database;
  private readonly statement: D1PreparedStatementBinding & { readRows?(): Record<string, unknown>[] };
  private readonly query: string;
  private readonly values: unknown[];

  constructor(
    owner: SweepingD1Database,
    statement: D1PreparedStatementBinding & { readRows?(): Record<string, unknown>[] },
    query: string,
    values: unknown[] = [],
  ) {
    this.owner = owner;
    this.statement = statement;
    this.query = query;
    this.values = values;
  }

  bind(...values: unknown[]): D1PreparedStatementBinding {
    return new SweepingPreparedStatement(this.owner, this.statement.bind(...values), this.query, values);
  }

  first<T = Record<string, unknown>>(): Promise<T | null> {
    return this.statement.first<T>();
  }

  all<T = Record<string, unknown>>(): Promise<{ results: T[] }> {
    return this.statement.all<T>();
  }

  /** The key this statement would insert, when it is an idempotency insert. */
  insertKeyHash(): string | undefined {
    return this.query.includes("insert into idempotency_records") ? String(this.values[0]) : undefined;
  }

  async run(): Promise<{ success: boolean; meta: { changes?: number } }> {
    const result = await this.statement.run();
    if (this.query.includes("insert into idempotency_records") && (result.meta.changes ?? 0) === 0) {
      await this.owner.sweepAfterInsertConflict(String(this.values[0]));
    }
    return result;
  }

  // The D1 test double executes batch statements through this hook.
  readRows(): Record<string, unknown>[] {
    return this.statement.readRows?.() ?? [];
  }
}
