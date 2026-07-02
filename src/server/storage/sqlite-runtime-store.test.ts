import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
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
    first.close();

    await expectDatabaseDirectoryNotToContain(databasePath, "github-token");

    const second = new SqliteRuntimeDatabase(databasePath, {
      secretCodec: new AesGcmSecretCodec("local-test-key"),
    });
    await expect(second.connectionStore.get("github", "default")).resolves.toMatchObject({
      authType: "api_key",
      apiKey: "github-token",
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

    database.resetRuntimeData();

    await expect(database.connectionStore.get("github", "default")).resolves.toBeUndefined();
    await expect(database.runLogStore.list()).resolves.toEqual({ items: [] });
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
    await database.runLogStore.add(createRun("run-1", "2026-06-30T00:00:00.000Z"));
    await database.rotateSecretCodec(new AesGcmSecretCodec("new-key"));
    database.close();

    const withOldKey = new SqliteRuntimeDatabase(databasePath, {
      secretCodec: new AesGcmSecretCodec("old-key"),
    });
    await expect(withOldKey.connectionStore.get("github", "default")).rejects.toThrow();
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
    withNewKey.close();
  });
});

async function createDatabasePath(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "oomol-connect-"));
  tempDirs.push(dir);
  return join(dir, "connect.sqlite");
}

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

async function expectDatabaseDirectoryNotToContain(databasePath: string, needle: string): Promise<void> {
  const dir = dirname(databasePath);
  const entries = await readdir(dir);
  for (const entry of entries) {
    const bytes = await readFile(join(dir, entry), "utf8");
    expect(bytes).not.toContain(needle);
  }
}
