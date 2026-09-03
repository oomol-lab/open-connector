import type { RuntimeLogger } from "../../core/types.ts";
import type { ISecretCodec } from "../secrets/secret-codec-core.ts";
import type { MigrationSource } from "./migration-source.ts";
import type { RuntimeDatabase } from "./runtime-database.ts";

import { Pool } from "pg";
import { migratePostgresDatabase } from "./postgres-migrations.ts";
import { PostgresRuntimeDatabase } from "./postgres-runtime-store.ts";
import { SqliteRuntimeDatabase } from "./sqlite-runtime-store.ts";

export interface NodeRuntimeDatabase extends RuntimeDatabase {
  close(): void | Promise<void>;
  resetRuntimeData(): void | Promise<void>;
  rotateSecretCodec(nextSecretCodec: ISecretCodec): Promise<void>;
}

interface CommonOptions {
  logger?: RuntimeLogger;
  runLimit?: number;
  secretCodec?: ISecretCodec;
  migrations?: MigrationSource;
}

interface SqliteOptions extends CommonOptions {
  backend: "sqlite";
  path: string;
}

interface PostgresOptions extends CommonOptions {
  backend: "postgresql";
  connectionString: string;
  poolMax?: number;
  connectionTimeoutMs?: number;
}

export type NodeRuntimeDatabaseOptions = SqliteOptions | PostgresOptions;

export interface MigratePostgresRuntimeDatabaseOptions {
  connectionString: string;
  connectionTimeoutMs: number;
  logger?: RuntimeLogger;
  migrations?: MigrationSource;
}

export async function createNodeRuntimeDatabase(options: NodeRuntimeDatabaseOptions): Promise<NodeRuntimeDatabase> {
  if (options.backend === "sqlite") {
    return new SqliteRuntimeDatabase(options.path, options);
  }

  const connectionString = options.connectionString.trim();
  assertPostgresDatabaseUrl(connectionString);
  return await PostgresRuntimeDatabase.open(connectionString, options);
}

/** What `migrate` entry points print without OOMOL_CONNECT_DATABASE_URL: SQLite has no explicit migrate step. */
export const sqliteMigrationsNotice =
  "SQLite migrations are applied automatically when the local runtime database opens.";

/** Validate the URL, open a single-connection pool named open-connector-migrate, apply pending migrations, and close the pool. */
export async function migratePostgresRuntimeDatabase(options: MigratePostgresRuntimeDatabaseOptions): Promise<void> {
  assertPostgresDatabaseUrl(options.connectionString);
  const pool = new Pool({
    application_name: "open-connector-migrate",
    connectionString: options.connectionString,
    connectionTimeoutMillis: options.connectionTimeoutMs,
    max: 1,
  });
  try {
    await migratePostgresDatabase({ pool, logger: options.logger, migrations: options.migrations });
  } finally {
    await pool.end();
  }
}

function assertPostgresDatabaseUrl(value: string): void {
  let protocol: string;
  try {
    protocol = new URL(value).protocol;
  } catch {
    throw new Error("OOMOL_CONNECT_DATABASE_URL must be a valid PostgreSQL connection URL.");
  }
  if (protocol !== "postgres:" && protocol !== "postgresql:") {
    throw new Error("OOMOL_CONNECT_DATABASE_URL must use the postgres: or postgresql: scheme.");
  }
}
