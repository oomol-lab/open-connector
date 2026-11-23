import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { afterEach, expect, it } from "vitest";
import { AesGcmSecretCodec } from "../src/server/secrets/secret-codec.ts";
import { SqliteRuntimeDatabase } from "../src/server/storage/sqlite/runtime-store.ts";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});
it("runs the offline SQLite reset-instance command while retaining local encrypted data", async () => {
  const directory = await mkdtemp(join(tmpdir(), "connect-reset-instance-"));
  directories.push(directory);
  const codec = new AesGcmSecretCodec("old-key");
  let database = new SqliteRuntimeDatabase(join(directory, "connect.sqlite"), { secretCodec: codec });
  const oldId = await database.saasProjectStore.getInstanceId();
  await database.saasProjectStore.saveProject({
    id: "managed",
    projectId: "project",
    baseUrl: "https://saas.example",
    apiKey: "remote-secret",
  });
  const local = await database.connectionStore.set("local", "default", {
    authType: "api_key",
    apiKey: "local-secret",
    values: {},
    metadata: {},
    profile: { accountId: "local", displayName: "Local", grantedScopes: [] },
  });
  database.close();
  const { stdout } = await promisify(execFile)(
    process.execPath,
    [resolve("scripts/runtime-data.ts"), "reset-instance", "--yes", "--data-dir", directory],
    {
      env: { ...process.env, OOMOL_CONNECT_DATABASE_URL: "", OOMOL_CONNECT_ENCRYPTION_KEY: "old-key" },
    },
  );
  expect(stdout).toContain(oldId);
  expect(stdout).not.toContain("remote-secret");
  expect(stdout).not.toContain("local-secret");
  database = new SqliteRuntimeDatabase(join(directory, "connect.sqlite"), { secretCodec: codec });
  try {
    expect(await database.saasProjectStore.getInstanceId()).not.toBe(oldId);
    expect(await database.saasProjectStore.getProject()).toBeUndefined();
    expect(await database.connectionStore.get("local", "default")).toEqual(local);
  } finally {
    database.close();
  }
});
