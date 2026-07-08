import type { IConnectionStore } from "../../connection-service.ts";
import type { ResolvedCredential } from "../../core/types.ts";
import type { IOAuthClientConfigStore, OAuthClientConfig } from "../../oauth/oauth-client-config-service.ts";
import type { IOAuthStateStore, OAuthAuthorizationState } from "../../oauth/oauth-flow-service.ts";
import type { ISecretCodec } from "../secrets/secret-codec-core.ts";
import type { RuntimeDatabase } from "./runtime-database.ts";
import type { IRunLogStore, RunLog, RunLogListInput, RunLogPage } from "./runtime-store.ts";
import type { IRuntimeTokenStore, RuntimeTokenRecord } from "./runtime-token-service.ts";

import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { PlainTextSecretCodec } from "../secrets/secret-codec-core.ts";
import { decodeRunLogCursor, encodeRunLogCursor } from "./runtime-store.ts";

type RuntimeRow = Record<string, unknown>;
type SecretJsonTable = "oauth_client_configs";
const migrationDirectory = new URL("../../../migrations/", import.meta.url);

export interface SqliteRuntimeDatabaseOptions {
  runLimit?: number;
  secretCodec?: ISecretCodec;
}

interface ConnectionJsonInput {
  database: DatabaseSync;
  secretCodec: ISecretCodec;
  service: string;
  connectionName: string;
}

interface SetConnectionJsonInput extends ConnectionJsonInput {
  value: unknown;
}

interface SecretJsonInput {
  database: DatabaseSync;
  secretCodec: ISecretCodec;
  table: SecretJsonTable;
  service: string;
}

interface SetServiceJsonInput extends SecretJsonInput {
  value: unknown;
}

interface RotatedConnectionSecret {
  service: string;
  connectionName: string;
  value: string;
}

interface RotatedServiceSecret {
  service: string;
  value: string;
}

/**
 * Shared SQLite connection for local runtime state.
 */
export class SqliteRuntimeDatabase implements RuntimeDatabase {
  readonly connectionStore: SqliteConnectionStore;
  readonly oauthClientConfigStore: SqliteOAuthClientConfigStore;
  readonly oauthStateStore: SqliteOAuthStateStore;
  readonly runtimeTokenStore: SqliteRuntimeTokenStore;
  readonly runLogStore: SqliteRunLogStore;

  private readonly database: DatabaseSync;
  private readonly secretCodec: ISecretCodec;

  constructor(filename: string, options: SqliteRuntimeDatabaseOptions = {}) {
    this.database = new DatabaseSync(filename);
    this.secretCodec = options.secretCodec ?? new PlainTextSecretCodec();
    this.initialize();
    this.connectionStore = new SqliteConnectionStore(this.database, this.secretCodec);
    this.oauthClientConfigStore = new SqliteOAuthClientConfigStore(this.database, this.secretCodec);
    this.oauthStateStore = new SqliteOAuthStateStore(this.database);
    this.runtimeTokenStore = new SqliteRuntimeTokenStore(this.database);
    this.runLogStore = new SqliteRunLogStore(this.database, options.runLimit ?? 100);
  }

  close(): void {
    this.database.close();
  }

  async rotateSecretCodec(nextSecretCodec: ISecretCodec): Promise<void> {
    const connections = await readRotatedConnectionSecrets(this.database, this.secretCodec, nextSecretCodec);
    const oauthConfigs = await readRotatedServiceSecrets(
      this.database,
      this.secretCodec,
      nextSecretCodec,
      "oauth_client_configs",
    );
    runInTransaction(this.database, () => {
      writeRotatedConnectionSecrets(this.database, connections);
      writeRotatedServiceSecrets(this.database, "oauth_client_configs", oauthConfigs);
    });
  }

  resetRuntimeData(): void {
    this.database.exec(`
      delete from connections;
      delete from oauth_client_configs;
      delete from oauth_states;
      delete from runtime_tokens;
      delete from runs;
    `);
  }

  private initialize(): void {
    this.database.exec("pragma journal_mode = wal;");
    runSqliteMigrations(this.database);
  }
}

export class SqliteConnectionStore implements IConnectionStore {
  private readonly database: DatabaseSync;
  private readonly secretCodec: ISecretCodec;

  constructor(database: DatabaseSync, secretCodec: ISecretCodec) {
    this.database = database;
    this.secretCodec = secretCodec;
  }

  async get(service: string, connectionName: string): Promise<ResolvedCredential | undefined> {
    return await getConnectionJson<ResolvedCredential>({
      database: this.database,
      secretCodec: this.secretCodec,
      service,
      connectionName,
    });
  }

  async set(service: string, connectionName: string, credential: ResolvedCredential): Promise<void> {
    await setConnectionJson({
      database: this.database,
      secretCodec: this.secretCodec,
      service,
      connectionName,
      value: credential,
    });
  }

  async delete(service: string, connectionName: string): Promise<void> {
    this.database
      .prepare("delete from connections where service = ? and connection_name = ?")
      .run(service, connectionName);
  }

  async list(): Promise<Array<{ service: string; connectionName: string; credential: ResolvedCredential }>> {
    const rows = this.database
      .prepare("select service, connection_name, value from connections order by service, connection_name")
      .all();
    return await Promise.all(
      rows.map(async (row) => ({
        service: readString(row, "service"),
        connectionName: readString(row, "connection_name"),
        credential: parseJson<ResolvedCredential>(await this.secretCodec.decode(readString(row, "value"))),
      })),
    );
  }
}

export class SqliteOAuthClientConfigStore implements IOAuthClientConfigStore {
  private readonly database: DatabaseSync;
  private readonly secretCodec: ISecretCodec;

  constructor(database: DatabaseSync, secretCodec: ISecretCodec) {
    this.database = database;
    this.secretCodec = secretCodec;
  }

  async get(service: string): Promise<OAuthClientConfig | undefined> {
    return await getSecretJson<OAuthClientConfig>({
      database: this.database,
      secretCodec: this.secretCodec,
      table: "oauth_client_configs",
      service,
    });
  }

  async set(config: OAuthClientConfig): Promise<void> {
    await setServiceJson({
      database: this.database,
      secretCodec: this.secretCodec,
      table: "oauth_client_configs",
      service: config.service,
      value: config,
    });
  }

  async delete(service: string): Promise<void> {
    this.database.prepare("delete from oauth_client_configs where service = ?").run(service);
  }

  async list(): Promise<OAuthClientConfig[]> {
    const rows = this.database.prepare("select value from oauth_client_configs order by service").all();
    return await Promise.all(
      rows.map(async (row) => parseJson<OAuthClientConfig>(await this.secretCodec.decode(readString(row, "value")))),
    );
  }
}

export class SqliteOAuthStateStore implements IOAuthStateStore {
  private readonly database: DatabaseSync;

  constructor(database: DatabaseSync) {
    this.database = database;
  }

  async set(state: OAuthAuthorizationState): Promise<void> {
    this.database
      .prepare(
        `
        insert into oauth_states (state, value, created_at)
        values (?, ?, ?)
        on conflict(state) do update set value = excluded.value, created_at = excluded.created_at
      `,
      )
      .run(state.state, JSON.stringify(state), state.createdAt);
  }

  async take(state: string): Promise<OAuthAuthorizationState | undefined> {
    const pending = getJson<OAuthAuthorizationState>(this.database, "oauth_states", "state", state);
    this.database.prepare("delete from oauth_states where state = ?").run(state);
    return pending;
  }
}

export class SqliteRuntimeTokenStore implements IRuntimeTokenStore {
  private readonly database: DatabaseSync;

  constructor(database: DatabaseSync) {
    this.database = database;
  }

  async add(record: RuntimeTokenRecord): Promise<void> {
    this.database
      .prepare(
        `
        insert into runtime_tokens (id, name, token_hash, created_at, last_used_at)
        values (?, ?, ?, ?, ?)
      `,
      )
      .run(record.id, record.name, record.tokenHash, record.createdAt, record.lastUsedAt ?? null);
  }

  async list(): Promise<RuntimeTokenRecord[]> {
    return this.database
      .prepare(
        `
        select id, name, token_hash, created_at, last_used_at
        from runtime_tokens
        where revoked_at is null
        order by created_at desc, id desc
      `,
      )
      .all()
      .map((row) => ({
        id: readString(row, "id"),
        name: readString(row, "name"),
        tokenHash: readString(row, "token_hash"),
        createdAt: readString(row, "created_at"),
        lastUsedAt: readOptionalString(row, "last_used_at"),
      }));
  }

  async revoke(id: string): Promise<boolean> {
    const result = this.database.prepare("delete from runtime_tokens where id = ?").run(id);
    return result.changes > 0;
  }

  async markUsed(id: string, usedAt: string): Promise<void> {
    this.database
      .prepare("update runtime_tokens set last_used_at = ? where id = ? and revoked_at is null")
      .run(usedAt, id);
  }
}

export class SqliteRunLogStore implements IRunLogStore {
  private readonly database: DatabaseSync;
  private readonly limit: number;

  constructor(database: DatabaseSync, limit: number) {
    this.database = database;
    this.limit = limit;
  }

  async add(run: RunLog): Promise<void> {
    insertRun(this.database, run);

    this.database
      .prepare(
        `
        delete from runs
        where id in (
          select id from runs
          order by started_at desc, id desc
          limit -1 offset ?
        )
      `,
      )
      .run(this.limit);
  }

  async list(input: RunLogListInput = {}): Promise<RunLogPage> {
    const limit = Math.max(1, Math.min(input.limit ?? this.limit, this.limit));
    const cursor = decodeRunLogCursor(input.cursor);
    const rows =
      cursor && input.service
        ? this.database
            .prepare(
              `
              select service, value from runs
              where (started_at < ? or (started_at = ? and id < ?))
                and service = ?
              order by started_at desc, id desc
              limit ?
            `,
            )
            .all(cursor.startedAt, cursor.startedAt, cursor.id, input.service, limit + 1)
        : cursor
          ? this.database
              .prepare(
                `
                select service, value from runs
                where started_at < ? or (started_at = ? and id < ?)
                order by started_at desc, id desc
                limit ?
              `,
              )
              .all(cursor.startedAt, cursor.startedAt, cursor.id, limit + 1)
          : input.service
            ? this.database
                .prepare(
                  `
                  select service, value from runs
                  where service = ?
                  order by started_at desc, id desc
                  limit ?
                `,
                )
                .all(input.service, limit + 1)
            : this.database
                .prepare("select service, value from runs order by started_at desc, id desc limit ?")
                .all(limit + 1);
    const runs = rows.map(readRunLogRow);
    const items = runs.slice(0, limit);

    return {
      items,
      nextCursor: runs.length > limit && items.length > 0 ? encodeRunLogCursor(items[items.length - 1]) : undefined,
    };
  }
}

function insertRun(database: DatabaseSync, run: RunLog): void {
  database
    .prepare(
      `
      insert into runs (id, service, action_id, started_at, completed_at, ok, value)
      values (?, ?, ?, ?, ?, ?, ?)
      on conflict(id) do update set
        service = excluded.service,
        action_id = excluded.action_id,
        started_at = excluded.started_at,
        completed_at = excluded.completed_at,
        ok = excluded.ok,
        value = excluded.value
    `,
    )
    .run(run.id, run.service, run.actionId, run.startedAt, run.completedAt, run.ok ? 1 : 0, JSON.stringify(run));
}

function readRunLogRow(row: unknown): RunLog {
  const run = parseJson<RunLog>(readString(row, "value"));
  return { ...run, service: readString(row, "service") };
}

function runSqliteMigrations(database: DatabaseSync): void {
  database.exec(`
    create table if not exists runtime_migrations (
      name text primary key,
      applied_at text not null
    );
  `);
  const applied = new Set(
    database
      .prepare("select name from runtime_migrations")
      .all()
      .map((row) => readString(row, "name")),
  );
  const migrationFiles = readdirSync(migrationDirectory)
    .filter((name) => /^\d+_.*\.sql$/.test(name))
    .sort();

  for (const file of migrationFiles) {
    if (applied.has(file)) {
      continue;
    }

    database.exec(readFileSync(new URL(file, migrationDirectory), "utf8"));
    database
      .prepare("insert into runtime_migrations (name, applied_at) values (?, ?)")
      .run(file, new Date().toISOString());
  }
}

async function readRotatedConnectionSecrets(
  database: DatabaseSync,
  currentCodec: ISecretCodec,
  nextCodec: ISecretCodec,
): Promise<RotatedConnectionSecret[]> {
  const rows = database.prepare("select service, connection_name, value from connections").all();
  return await Promise.all(
    rows.map(async (row) => ({
      service: readString(row, "service"),
      connectionName: readString(row, "connection_name"),
      value: await nextCodec.encode(await currentCodec.decode(readString(row, "value"))),
    })),
  );
}

function writeRotatedConnectionSecrets(database: DatabaseSync, connections: RotatedConnectionSecret[]): void {
  const statement = database.prepare("update connections set value = ? where service = ? and connection_name = ?");
  for (const connection of connections) {
    statement.run(connection.value, connection.service, connection.connectionName);
  }
}

async function readRotatedServiceSecrets(
  database: DatabaseSync,
  currentCodec: ISecretCodec,
  nextCodec: ISecretCodec,
  table: SecretJsonTable,
): Promise<RotatedServiceSecret[]> {
  const rows = database.prepare(`select service, value from ${table}`).all();
  return await Promise.all(
    rows.map(async (row) => ({
      service: readString(row, "service"),
      value: await nextCodec.encode(await currentCodec.decode(readString(row, "value"))),
    })),
  );
}

function writeRotatedServiceSecrets(
  database: DatabaseSync,
  table: SecretJsonTable,
  services: RotatedServiceSecret[],
): void {
  const statement = database.prepare(`update ${table} set value = ? where service = ?`);
  for (const service of services) {
    statement.run(service.value, service.service);
  }
}

function runInTransaction(database: DatabaseSync, work: () => void): void {
  database.exec("begin immediate");
  try {
    work();
    database.exec("commit");
  } catch (error) {
    database.exec("rollback");
    throw error;
  }
}

function getJson<T>(database: DatabaseSync, table: "oauth_states", keyColumn: "state", key: string): T | undefined {
  const row = database.prepare(`select value from ${table} where ${keyColumn} = ?`).get(key) as RuntimeRow | undefined;
  return row ? parseJson<T>(readString(row, "value")) : undefined;
}

async function getSecretJson<T>(input: SecretJsonInput): Promise<T | undefined> {
  const stored = getStoredValue(input.database, input.table, "service", input.service);
  return stored ? parseJson<T>(await input.secretCodec.decode(stored)) : undefined;
}

async function getConnectionJson<T>(input: ConnectionJsonInput): Promise<T | undefined> {
  const row = input.database
    .prepare("select value from connections where service = ? and connection_name = ?")
    .get(input.service, input.connectionName) as RuntimeRow | undefined;
  return row ? parseJson<T>(await input.secretCodec.decode(readString(row, "value"))) : undefined;
}

function getStoredValue(
  database: DatabaseSync,
  table: SecretJsonTable,
  keyColumn: "service",
  key: string,
): string | undefined {
  const row = database.prepare(`select value from ${table} where ${keyColumn} = ?`).get(key) as RuntimeRow | undefined;
  return row ? readString(row, "value") : undefined;
}

async function setConnectionJson(input: SetConnectionJsonInput): Promise<void> {
  input.database
    .prepare(
      `
      insert into connections (service, connection_name, value, updated_at)
      values (?, ?, ?, ?)
      on conflict(service, connection_name) do update set
        value = excluded.value,
        updated_at = excluded.updated_at
    `,
    )
    .run(
      input.service,
      input.connectionName,
      await input.secretCodec.encode(JSON.stringify(input.value)),
      new Date().toISOString(),
    );
}

async function setServiceJson(input: SetServiceJsonInput): Promise<void> {
  input.database
    .prepare(
      `
      insert into ${input.table} (service, value, updated_at)
      values (?, ?, ?)
      on conflict(service) do update set value = excluded.value, updated_at = excluded.updated_at
    `,
    )
    .run(input.service, await input.secretCodec.encode(JSON.stringify(input.value)), new Date().toISOString());
}

function readString(row: unknown, key: string): string {
  if (typeof row !== "object" || row == null) {
    throw new Error(`Expected SQLite row for ${key}.`);
  }

  const value = (row as Record<string, unknown>)[key];
  if (typeof value !== "string") {
    throw new Error(`Expected SQLite column ${key} to be a string.`);
  }

  return value;
}

function readOptionalString(row: unknown, key: string): string | undefined {
  if (typeof row !== "object" || row == null) {
    throw new Error(`Expected SQLite row for ${key}.`);
  }

  const value = (row as Record<string, unknown>)[key];
  if (value == null) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new Error(`Expected SQLite column ${key} to be a string.`);
  }

  return value;
}

function parseJson<T>(value: string): T {
  return JSON.parse(value) as T;
}
