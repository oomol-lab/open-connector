import type { RuntimeLogger } from "../../core/types.ts";
import type { ISecretCodec } from "../secrets/secret-codec-core.ts";
import type { RuntimeDatabase } from "./runtime-database.ts";

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

export async function createNodeRuntimeDatabase(options: NodeRuntimeDatabaseOptions): Promise<NodeRuntimeDatabase> {
  if (options.backend === "sqlite") {
    return new SqliteRuntimeDatabase(options.path, options);
  }

  const connectionString = options.connectionString.trim();
  assertPostgresDatabaseUrl(connectionString);
  return await PostgresRuntimeDatabase.open(connectionString, options);
}

export function assertPostgresDatabaseUrl(value: string): void {
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
