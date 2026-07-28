import type { RuntimeLogger } from "../../core/types.ts";
import type { D1DatabaseBinding, D1PreparedStatementBinding } from "../cloudflare/cloudflare-bindings.ts";
import type { ISecretCodec } from "../secrets/secret-codec-core.ts";
import type { RuntimeDatabase } from "./runtime-database.ts";
import type { Pool } from "pg";

import { readFileSync, readdirSync } from "node:fs";
import {
  D1ConnectionStore,
  D1IdempotencyStore,
  D1OAuthClientConfigStore,
  D1OAuthStateStore,
  D1RunLogStore,
  D1RuntimeDatabase,
  D1RuntimePolicyStore,
  D1RuntimeTokenStore,
} from "./d1-runtime-store.ts";
import { DEFAULT_RUN_LIMIT } from "./runtime-store.ts";

const migrationDirectory = new URL("../../../migrations/postgres/", import.meta.url);

export interface PostgresRuntimeDatabaseOptions {
  logger?: RuntimeLogger;
  runLimit?: number;
  secretCodec?: ISecretCodec;
}

/**
 * Postgres-backed runtime state, for deployments that cannot keep a SQLite file — a
 * container with no persistent volume, or more than one runtime process.
 *
 * It reuses the D1 store implementations rather than duplicating them. `D1DatabaseBinding`
 * is a four-method, promise-based contract, and every query the stores issue is ordinary
 * portable SQL: `insert … on conflict … do update`, `returning`, `limit`. The only
 * genuine dialect gap is the placeholder syntax, which `PostgresD1Adapter` rewrites. That
 * keeps one implementation of the seven stores serving three backends, so a fix to
 * connection handling cannot land in one and be forgotten in another.
 */
export class PostgresRuntimeDatabase implements RuntimeDatabase {
  readonly connectionStore: D1ConnectionStore;
  readonly oauthClientConfigStore: D1OAuthClientConfigStore;
  readonly oauthStateStore: D1OAuthStateStore;
  readonly runtimeTokenStore: D1RuntimeTokenStore;
  readonly runtimePolicyStore: D1RuntimePolicyStore;
  readonly runLogStore: D1RunLogStore;
  readonly idempotencyStore: D1IdempotencyStore;

  private readonly pool: Pool;

  private constructor(pool: Pool, options: PostgresRuntimeDatabaseOptions) {
    this.pool = pool;
    const inner = new D1RuntimeDatabase(new PostgresD1Adapter(pool), {
      runLimit: options.runLimit ?? DEFAULT_RUN_LIMIT,
      secretCodec: options.secretCodec,
    });
    this.connectionStore = inner.connectionStore;
    this.oauthClientConfigStore = inner.oauthClientConfigStore;
    this.oauthStateStore = inner.oauthStateStore;
    this.runtimeTokenStore = inner.runtimeTokenStore;
    this.runtimePolicyStore = inner.runtimePolicyStore;
    this.runLogStore = inner.runLogStore;
    this.idempotencyStore = inner.idempotencyStore;
  }

  /**
   * Connect and bring the schema up to date.
   *
   * Async because migrations must complete before the first query — unlike the SQLite
   * database, which can migrate synchronously in its constructor.
   */
  static async create(pool: Pool, options: PostgresRuntimeDatabaseOptions = {}): Promise<PostgresRuntimeDatabase> {
    await runPostgresMigrations(pool, options.logger);
    return new PostgresRuntimeDatabase(pool, options);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async resetRuntimeData(): Promise<void> {
    await this.pool.query(`
      delete from connections;
      delete from oauth_client_configs;
      delete from oauth_states;
      delete from runtime_tokens;
      delete from runtime_policy;
      delete from runs;
      delete from idempotency_records;
    `);
  }
}

/**
 * Presents a `pg` pool through the D1 binding contract.
 */
export class PostgresD1Adapter implements D1DatabaseBinding {
  private readonly pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  prepare(query: string): D1PreparedStatementBinding {
    return new PostgresD1Statement(this.pool, toPostgresPlaceholders(query), []);
  }
}

class PostgresD1Statement implements D1PreparedStatementBinding {
  private readonly pool: Pool;
  private readonly query: string;
  private readonly values: unknown[];

  constructor(pool: Pool, query: string, values: unknown[]) {
    this.pool = pool;
    this.query = query;
    this.values = values;
  }

  bind(...values: unknown[]): D1PreparedStatementBinding {
    return new PostgresD1Statement(this.pool, this.query, values);
  }

  async first<T = Record<string, unknown>>(): Promise<T | null> {
    const result = await this.pool.query(this.query, this.values);
    return (result.rows[0] as T | undefined) ?? null;
  }

  async all<T = Record<string, unknown>>(): Promise<{ results: T[] }> {
    const result = await this.pool.query(this.query, this.values);
    return { results: result.rows as T[] };
  }

  async run(): Promise<{ success: boolean; meta: { changes?: number } }> {
    const result = await this.pool.query(this.query, this.values);
    return { success: true, meta: { changes: result.rowCount ?? 0 } };
  }
}

/**
 * Rewrite SQLite/D1 `?` placeholders as Postgres `$1`, `$2`, …
 *
 * Quoted text is skipped so a literal question mark inside a string is never mistaken for
 * a parameter. Postgres treats `''` inside a single-quoted string as an escaped quote, so
 * the scanner does not close on it.
 */
export function toPostgresPlaceholders(query: string): string {
  let out = "";
  let index = 0;
  let quote: string | undefined;

  for (let position = 0; position < query.length; position += 1) {
    const character = query[position]!;

    if (quote) {
      out += character;
      if (character === quote) {
        if (quote === "'" && query[position + 1] === "'") {
          out += query[position + 1]!;
          position += 1;
          continue;
        }
        quote = undefined;
      }
      continue;
    }

    if (character === "'" || character === '"') {
      quote = character;
      out += character;
      continue;
    }

    if (character === "?") {
      index += 1;
      out += `$${index}`;
      continue;
    }

    out += character;
  }

  return out;
}

/**
 * Apply pending schema files, recording each in `runtime_migrations`.
 *
 * Mirrors the SQLite runner: filename-ordered, applied once, each inside a transaction so
 * a failure cannot leave the schema half-built.
 */
export async function runPostgresMigrations(pool: Pool, logger?: RuntimeLogger): Promise<void> {
  const startedAt = Date.now();
  await pool.query(`
    create table if not exists runtime_migrations (
      name text primary key,
      applied_at text not null
    );
  `);

  const appliedResult = await pool.query<{ name: string }>("select name from runtime_migrations");
  const applied = new Set(appliedResult.rows.map((row) => row.name));
  const migrationFiles = readdirSync(migrationDirectory)
    .filter((name) => /^\d+_.*\.sql$/.test(name))
    .sort();
  let newlyAppliedCount = 0;

  for (const file of migrationFiles) {
    if (applied.has(file)) {
      continue;
    }

    const migrationStartedAt = Date.now();
    logger?.info({ migration: file }, "postgres migration started");
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query(readFileSync(new URL(file, migrationDirectory), "utf8"));
      await client.query("insert into runtime_migrations (name, applied_at) values ($1, $2)", [
        file,
        new Date().toISOString(),
      ]);
      await client.query("commit");
    } catch (error) {
      await client.query("rollback").catch(() => {});
      logger?.error(
        { migration: file, durationMs: Date.now() - migrationStartedAt, err: error },
        "postgres migration failed",
      );
      throw error;
    } finally {
      client.release();
    }

    applied.add(file);
    newlyAppliedCount += 1;
    logger?.info({ migration: file, durationMs: Date.now() - migrationStartedAt }, "postgres migration completed");
  }

  logger?.info(
    {
      migrationCount: migrationFiles.length,
      appliedCount: migrationFiles.filter((file) => applied.has(file)).length,
      newlyAppliedCount,
      durationMs: Date.now() - startedAt,
    },
    "postgres migrations ready",
  );
}
