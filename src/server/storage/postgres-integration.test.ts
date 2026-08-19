import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { migratePostgresDatabase } from "./postgres-migrations.ts";
import { PostgresRuntimeDatabase } from "./postgres-runtime-store.ts";

const testPostgresUrl = process.env.TEST_POSTGRES_URL;

describe.skipIf(!testPostgresUrl)("PostgreSQL runtime integration", () => {
  const schemas: string[] = [];
  let adminPool: Pool;
  let runtimeUrl: string;
  let first: PostgresRuntimeDatabase;
  let second: PostgresRuntimeDatabase;

  beforeAll(async () => {
    adminPool = new Pool({ connectionString: testPostgresUrl });
    runtimeUrl = await createTestSchema("runtime");
    const pool = new Pool({ connectionString: runtimeUrl, max: 1 });
    try {
      await migratePostgresDatabase({ pool });
    } finally {
      await pool.end();
    }
  });

  beforeEach(async () => {
    first = await PostgresRuntimeDatabase.open(runtimeUrl, { poolMax: 2 });
    second = await PostgresRuntimeDatabase.open(runtimeUrl, { poolMax: 2 });
    await first.resetRuntimeData();
  });

  afterEach(async () => {
    await first.close();
    await second.close();
  });

  afterAll(async () => {
    for (const schema of schemas) {
      await adminPool.query(`drop schema ${schema} cascade`);
    }
    await adminPool.end();
  });

  it("serializes concurrent migration runners across PostgreSQL sessions", async () => {
    const url = await createTestSchema("migrations");
    const firstPool = new Pool({ connectionString: url, max: 1 });
    const secondPool = new Pool({ connectionString: url, max: 1 });
    try {
      await Promise.all([migratePostgresDatabase({ pool: firstPool }), migratePostgresDatabase({ pool: secondPool })]);
      const result = await firstPool.query<{ count: string }>("select count(*)::text as count from runtime_migrations");
      expect(result.rows[0]?.count).toBe("1");
    } finally {
      await firstPool.end();
      await secondPool.end();
    }
  });

  it("atomically consumes OAuth state across database instances", async () => {
    await first.oauthStateStore.set({
      service: "gmail",
      state: "state-1",
      createdAt: "2026-06-30T00:00:00.000Z",
    });

    const results = await Promise.all([first.oauthStateStore.take("state-1"), second.oauthStateStore.take("state-1")]);
    expect(results.filter((result) => result !== undefined)).toHaveLength(1);
  });

  it("atomically claims idempotency keys across database instances", async () => {
    const claim = {
      keyHash: "key-hash",
      requestHash: "request-hash",
      now: "2026-06-30T00:00:00.000Z",
      expiresAt: "2026-07-01T00:00:00.000Z",
    };
    const results = await Promise.all([
      first.idempotencyStore.claim({ ...claim, claimId: "claim-1" }),
      second.idempotencyStore.claim({ ...claim, claimId: "claim-2" }),
    ]);
    expect(results.map((result) => result.kind).sort()).toEqual(["acquired", "in_progress"]);
  });

  it("rejects stale connection revisions across database instances", async () => {
    const credential = {
      authType: "api_key" as const,
      apiKey: "github-token",
      values: { apiKey: "github-token" },
      profile: {
        accountId: "github:octocat",
        displayName: "octocat",
        grantedScopes: [],
      },
      metadata: {},
    };
    const created = await first.connectionStore.set("github", "default", credential);
    const updated = await second.connectionStore.set("github", "default", {
      ...credential,
      apiKey: "updated-token",
    });

    await expect(
      first.connectionStore.updateCredential({
        ...created,
        credential: { ...credential, apiKey: "stale-token" },
      }),
    ).resolves.toBe(false);
    expect(updated.id).toBe(created.id);
  });

  async function createTestSchema(label: string): Promise<string> {
    const schema = `open_connector_${label}_${randomUUID().replaceAll("-", "")}`;
    await adminPool.query(`create schema ${schema}`);
    schemas.push(schema);
    const url = new URL(testPostgresUrl!);
    url.searchParams.set("options", `-c search_path=${schema}`);
    return url.toString();
  }
});
