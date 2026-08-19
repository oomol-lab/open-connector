import type { RuntimeLogger } from "../../core/types.ts";
import type { Pool, PoolClient } from "pg";

import { readFileSync, readdirSync } from "node:fs";

const migrationDirectory = new URL("../../../migrations/postgresql/", import.meta.url);
const migrationLockNamespace = 1_326_382_671;
const migrationLockId = 1;

interface PostgresMigration {
  name: string;
  sql: string;
}

export interface PostgresMigrationOptions {
  pool: Pool;
  logger?: RuntimeLogger;
}

export async function migratePostgresDatabase(options: PostgresMigrationOptions): Promise<void> {
  const client = await options.pool.connect();
  let destroyClient = false;

  try {
    await client.query("select pg_advisory_lock($1, $2)", [migrationLockNamespace, migrationLockId]);
    await client.query(`
      create table if not exists runtime_migrations (
        name text primary key,
        applied_at text not null
      )
    `);

    const startedAt = Date.now();
    const migrations = readPostgresMigrations();
    const applied = await readAppliedMigrations(client);
    let newlyAppliedCount = 0;

    for (const migration of migrations) {
      if (applied.has(migration.name)) {
        continue;
      }

      const migrationStartedAt = Date.now();
      options.logger?.info({ migration: migration.name }, "postgres migration started");
      await client.query("begin");
      try {
        await client.query(migration.sql);
        await client.query("insert into runtime_migrations (name, applied_at) values ($1, $2)", [
          migration.name,
          new Date().toISOString(),
        ]);
        await client.query("commit");
      } catch (error) {
        await client.query("rollback");
        options.logger?.error(
          { migration: migration.name, durationMs: Date.now() - migrationStartedAt, err: error },
          "postgres migration failed",
        );
        throw error;
      }

      applied.add(migration.name);
      newlyAppliedCount += 1;
      options.logger?.info(
        { migration: migration.name, durationMs: Date.now() - migrationStartedAt },
        "postgres migration completed",
      );
    }

    options.logger?.info(
      {
        migrationCount: migrations.length,
        appliedCount: migrations.filter((migration) => applied.has(migration.name)).length,
        newlyAppliedCount,
        durationMs: Date.now() - startedAt,
      },
      "postgres migrations ready",
    );
  } finally {
    try {
      await client.query("select pg_advisory_unlock($1, $2)", [migrationLockNamespace, migrationLockId]);
    } catch {
      destroyClient = true;
    }
    client.release(destroyClient);
  }
}

export async function assertPostgresSchemaReady(pool: Pool): Promise<void> {
  const migrations = readPostgresMigrations();
  const relation = await pool.query<{ name: string | null }>("select to_regclass($1) as name", ["runtime_migrations"]);
  if (!relation.rows[0]?.name) {
    throw new Error(
      "PostgreSQL runtime schema is not initialized. Run `npm run runtime:migrate` before starting the server.",
    );
  }

  const applied = await readAppliedMigrations(pool);
  const missing = migrations.filter((migration) => !applied.has(migration.name)).map((migration) => migration.name);
  if (missing.length > 0) {
    throw new Error(
      `PostgreSQL runtime schema is not ready. Missing migrations: ${missing.join(", ")}. Run \`npm run runtime:migrate\` before starting the server.`,
    );
  }
}

function readPostgresMigrations(): PostgresMigration[] {
  return readdirSync(migrationDirectory)
    .filter((name) => /^\d+_.*\.sql$/.test(name))
    .sort()
    .map((name) => ({
      name,
      sql: readFileSync(new URL(name, migrationDirectory), "utf8"),
    }));
}

async function readAppliedMigrations(queryable: Pool | PoolClient): Promise<Set<string>> {
  const result = await queryable.query<{ name: string }>("select name from runtime_migrations");
  return new Set(result.rows.map((row) => row.name));
}
