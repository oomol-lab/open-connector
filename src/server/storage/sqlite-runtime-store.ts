import type { IConnectionStore, StoredConnection } from "../../connection-service.ts";
import type { TokenPolicy } from "../../core/action-policy.ts";
import type { ResolvedCredential, RuntimeLogger } from "../../core/types.ts";
import type {
  IMarketplaceStore,
  ProviderPreference,
  StoredMarketplaceConfig,
} from "../../marketplace/marketplace-service.ts";
import type { IOAuthClientConfigStore, OAuthClientConfig } from "../../oauth/oauth-client-config-service.ts";
import type { IOAuthStateStore, OAuthAuthorizationState } from "../../oauth/oauth-flow-service.ts";
import type { ISecretCodec } from "../secrets/secret-codec-core.ts";
import type {
  CompleteIdempotencyInput,
  IdempotencyClaimInput,
  IdempotencyClaimResult,
  IIdempotencyStore,
} from "./idempotency-store.ts";
import type { RuntimeDatabase } from "./runtime-database.ts";
import type { IRuntimePolicyStore, RuntimePolicyRecord } from "./runtime-policy-store.ts";
import type {
  IRunLogStore,
  RunLog,
  RunLogListInput,
  RunLogPage,
  RunLogWriteResult,
  RuntimeRow,
  SecretJsonTable,
} from "./runtime-store.ts";
import type { IRuntimeTokenStore, RuntimeTokenRecord } from "./runtime-token-service.ts";

import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { parseRuntimeActionHttpResult } from "../api/runtime-api.ts";
import { PlainTextSecretCodec } from "../secrets/secret-codec-core.ts";
import {
  buildRunLogQuery,
  DEFAULT_RUN_LIMIT,
  parseJson,
  readRunLogRow,
  readRuntimeTokenRow,
  readString,
  toRunLogPage,
} from "./runtime-store.ts";

const migrationDirectory = new URL("../../../migrations/", import.meta.url);

export interface SqliteRuntimeDatabaseOptions {
  logger?: RuntimeLogger;
  runLimit?: number;
  secretCodec?: ISecretCodec;
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

interface RotatedIdempotencySecret {
  keyHash: string;
  value: string;
}

interface RotatedStateSecret {
  state: string;
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
  readonly runtimePolicyStore: SqliteRuntimePolicyStore;
  readonly runLogStore: SqliteRunLogStore;
  readonly idempotencyStore: SqliteIdempotencyStore;
  readonly marketplaceStore: SqliteMarketplaceStore;

  private readonly database: DatabaseSync;
  private readonly secretCodec: ISecretCodec;

  constructor(filename: string, options: SqliteRuntimeDatabaseOptions = {}) {
    this.database = new DatabaseSync(filename);
    this.secretCodec = options.secretCodec ?? new PlainTextSecretCodec();
    this.initialize(options.logger);
    this.connectionStore = new SqliteConnectionStore(this.database, this.secretCodec);
    this.oauthClientConfigStore = new SqliteOAuthClientConfigStore(this.database, this.secretCodec);
    this.oauthStateStore = new SqliteOAuthStateStore(this.database, this.secretCodec);
    this.runtimeTokenStore = new SqliteRuntimeTokenStore(this.database);
    this.runtimePolicyStore = new SqliteRuntimePolicyStore(this.database);
    this.runLogStore = new SqliteRunLogStore(this.database, options.runLimit ?? DEFAULT_RUN_LIMIT);
    this.idempotencyStore = new SqliteIdempotencyStore(this.database, this.secretCodec);
    this.marketplaceStore = new SqliteMarketplaceStore(this.database);
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
    const oauthStates = await readRotatedStateSecrets(this.database, this.secretCodec, nextSecretCodec);
    const idempotencyResponses = await readRotatedIdempotencySecrets(this.database, this.secretCodec, nextSecretCodec);
    const marketplaceConfig = await this.marketplaceStore.getConfig();
    const rotatedMarketplaceConfig = marketplaceConfig
      ? {
          ...marketplaceConfig,
          apiKeyEncrypted: await nextSecretCodec.encode(
            await this.secretCodec.decode(marketplaceConfig.apiKeyEncrypted),
          ),
        }
      : undefined;
    runInTransaction(this.database, () => {
      writeRotatedConnectionSecrets(this.database, connections);
      writeRotatedServiceSecrets(this.database, "oauth_client_configs", oauthConfigs);
      writeRotatedStateSecrets(this.database, oauthStates);
      writeRotatedIdempotencySecrets(this.database, idempotencyResponses);
      if (rotatedMarketplaceConfig) {
        this.database
          .prepare("update marketplace_config set value = ? where id = 1")
          .run(JSON.stringify(rotatedMarketplaceConfig));
      }
    });
  }

  resetRuntimeData(): void {
    this.database.exec(`
      delete from connections;
      delete from oauth_client_configs;
      delete from oauth_states;
      delete from runtime_tokens;
      delete from runtime_policy;
      delete from runs;
      delete from idempotency_records;
      delete from marketplace_config;
      delete from provider_preferences;
    `);
  }

  private initialize(logger?: RuntimeLogger): void {
    this.database.exec("pragma journal_mode = wal;");
    runSqliteMigrations(this.database, logger);
  }
}

export class SqliteMarketplaceStore implements IMarketplaceStore {
  private readonly database: DatabaseSync;

  constructor(database: DatabaseSync) {
    this.database = database;
  }

  async getConfig(): Promise<StoredMarketplaceConfig | undefined> {
    const row = this.database.prepare("select value from marketplace_config where id = 1").get();
    return row ? parseJson<StoredMarketplaceConfig>(readString(row, "value")) : undefined;
  }

  async setConfig(config: StoredMarketplaceConfig): Promise<void> {
    this.database
      .prepare(
        "insert into marketplace_config (id, value) values (1, ?) on conflict(id) do update set value = excluded.value",
      )
      .run(JSON.stringify(config));
  }

  async deleteConfig(): Promise<void> {
    this.database.prepare("delete from marketplace_config where id = 1").run();
  }

  async listProviderPreferences(): Promise<ProviderPreference[]> {
    return this.database
      .prepare("select service, enabled, created_at, updated_at from provider_preferences order by service")
      .all()
      .map((row) => ({
        service: readString(row, "service"),
        enabled: (row as Record<string, unknown>).enabled === 1,
        createdAt: readString(row, "created_at"),
        updatedAt: readString(row, "updated_at"),
      }));
  }

  async setProviderPreference(preference: ProviderPreference): Promise<void> {
    this.database
      .prepare(
        "insert into provider_preferences (service, enabled, created_at, updated_at) values (?, ?, ?, ?) on conflict(service) do update set enabled = excluded.enabled, updated_at = excluded.updated_at",
      )
      .run(preference.service, preference.enabled ? 1 : 0, preference.createdAt, preference.updatedAt);
  }
}

export class SqliteConnectionStore implements IConnectionStore {
  private readonly database: DatabaseSync;
  private readonly secretCodec: ISecretCodec;

  constructor(database: DatabaseSync, secretCodec: ISecretCodec) {
    this.database = database;
    this.secretCodec = secretCodec;
  }

  async get(service: string, connectionName: string): Promise<StoredConnection | undefined> {
    const row = this.database
      .prepare("select id, revision, value from connections where service = ? and connection_name = ?")
      .get(service, connectionName);
    return row
      ? {
          id: readString(row, "id"),
          revision: readString(row, "revision"),
          service,
          connectionName,
          credential: parseJson<ResolvedCredential>(await this.secretCodec.decode(readString(row, "value"))),
        }
      : undefined;
  }

  async set(service: string, connectionName: string, credential: ResolvedCredential): Promise<StoredConnection> {
    const row = this.database
      .prepare(
        `
        insert into connections (id, revision, service, connection_name, value, updated_at)
        values (?, ?, ?, ?, ?, ?)
        on conflict(service, connection_name) do update set
          revision = excluded.revision,
          value = excluded.value,
          updated_at = excluded.updated_at
        returning id, revision
      `,
      )
      .get(
        crypto.randomUUID(),
        crypto.randomUUID(),
        service,
        connectionName,
        await this.secretCodec.encode(JSON.stringify(credential)),
        new Date().toISOString(),
      );
    return {
      id: readString(row, "id"),
      revision: readString(row, "revision"),
      service,
      connectionName,
      credential,
    };
  }

  async updateCredential(input: StoredConnection): Promise<boolean> {
    const row = this.database
      .prepare(
        `
        update connections
        set revision = ?, value = ?, updated_at = ?
        where service = ? and connection_name = ? and id = ? and revision = ?
        returning id
      `,
      )
      .get(
        crypto.randomUUID(),
        await this.secretCodec.encode(JSON.stringify(input.credential)),
        new Date().toISOString(),
        input.service,
        input.connectionName,
        input.id,
        input.revision,
      );
    return row !== undefined;
  }

  async delete(service: string, connectionName: string): Promise<void> {
    this.database
      .prepare("delete from connections where service = ? and connection_name = ?")
      .run(service, connectionName);
  }

  async list(): Promise<StoredConnection[]> {
    const rows = this.database
      .prepare(
        "select id, revision, service, connection_name, value from connections order by service, connection_name",
      )
      .all();
    return await Promise.all(
      rows.map(async (row) => ({
        id: readString(row, "id"),
        revision: readString(row, "revision"),
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
  private readonly secretCodec: ISecretCodec;

  constructor(database: DatabaseSync, secretCodec: ISecretCodec) {
    this.database = database;
    this.secretCodec = secretCodec;
  }

  async deleteCreatedBefore(cutoff: string): Promise<void> {
    this.database.prepare("delete from oauth_states where created_at < ?").run(cutoff);
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
      .run(state.state, await this.secretCodec.encode(JSON.stringify(state)), state.createdAt);
  }

  async take(state: string): Promise<OAuthAuthorizationState | undefined> {
    const row = this.database.prepare("select value from oauth_states where state = ?").get(state);
    this.database.prepare("delete from oauth_states where state = ?").run(state);
    return row
      ? parseJson<OAuthAuthorizationState>(await this.secretCodec.decode(readString(row, "value")))
      : undefined;
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
        insert into runtime_tokens (
          id, name, token_hash, allowed_actions, blocked_actions, allowed_proxies, allowed_connections, created_at, last_used_at
        )
        values (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      )
      .run(
        record.id,
        record.name,
        record.tokenHash,
        JSON.stringify(record.allowedActions),
        JSON.stringify(record.blockedActions),
        JSON.stringify(record.allowedProxies),
        JSON.stringify(record.allowedConnections ?? []),
        record.createdAt,
        record.lastUsedAt ?? null,
      );
  }

  async list(): Promise<RuntimeTokenRecord[]> {
    return this.database
      .prepare(
        `
        select id, name, token_hash, allowed_actions, blocked_actions, allowed_proxies, allowed_connections, created_at, last_used_at
        from runtime_tokens
        order by created_at desc, id desc
      `,
      )
      .all()
      .map(readRuntimeTokenRow);
  }

  async findByHash(tokenHash: string): Promise<RuntimeTokenRecord | undefined> {
    const row = this.database
      .prepare(
        `
        select id, name, token_hash, allowed_actions, blocked_actions, allowed_proxies, allowed_connections, created_at, last_used_at
        from runtime_tokens
        where token_hash = ?
      `,
      )
      .get(tokenHash);
    return row ? readRuntimeTokenRow(row) : undefined;
  }

  async updatePolicy(id: string, policy: TokenPolicy): Promise<RuntimeTokenRecord | undefined> {
    const row = this.database
      .prepare(
        `
        update runtime_tokens
        set allowed_actions = ?, blocked_actions = ?, allowed_proxies = ?, allowed_connections = ?
        where id = ?
        returning id, name, token_hash, allowed_actions, blocked_actions, allowed_proxies, allowed_connections, created_at, last_used_at
      `,
      )
      .get(
        JSON.stringify(policy.allowedActions),
        JSON.stringify(policy.blockedActions),
        JSON.stringify(policy.allowedProxies),
        JSON.stringify(policy.allowedConnections ?? []),
        id,
      );
    return row ? readRuntimeTokenRow(row) : undefined;
  }

  async revoke(id: string): Promise<boolean> {
    const result = this.database.prepare("delete from runtime_tokens where id = ?").run(id);
    return result.changes > 0;
  }

  async markUsed(id: string, usedAt: string): Promise<void> {
    this.database.prepare("update runtime_tokens set last_used_at = ? where id = ?").run(usedAt, id);
  }
}

export class SqliteRuntimePolicyStore implements IRuntimePolicyStore {
  private readonly database: DatabaseSync;

  constructor(database: DatabaseSync) {
    this.database = database;
  }

  async get(): Promise<RuntimePolicyRecord | undefined> {
    const row = this.database.prepare("select value, updated_at from runtime_policy where id = 1").get();
    return row
      ? {
          rules: parseJson(readString(row, "value")),
          updatedAt: readString(row, "updated_at"),
        }
      : undefined;
  }

  async set(record: RuntimePolicyRecord): Promise<void> {
    this.database
      .prepare(
        `
        insert into runtime_policy (id, value, updated_at)
        values (1, ?, ?)
        on conflict(id) do update set value = excluded.value, updated_at = excluded.updated_at
      `,
      )
      .run(JSON.stringify(record.rules), record.updatedAt);
  }
}

export class SqliteIdempotencyStore implements IIdempotencyStore {
  private readonly database: DatabaseSync;
  private readonly secretCodec: ISecretCodec;

  constructor(database: DatabaseSync, secretCodec: ISecretCodec) {
    this.database = database;
    this.secretCodec = secretCodec;
  }

  async claim(input: IdempotencyClaimInput): Promise<IdempotencyClaimResult> {
    const claim = runInTransaction(this.database, () => {
      this.database.prepare("delete from idempotency_records where expires_at <= ?").run(input.now);
      const inserted = this.database
        .prepare(
          `
          insert into idempotency_records (
            key_hash, claim_id, request_hash, state, response_value, created_at, expires_at
          )
          values (?, ?, ?, 'in_progress', null, ?, ?)
          on conflict(key_hash) do nothing
        `,
        )
        .run(input.keyHash, input.claimId, input.requestHash, input.now, input.expiresAt);

      if (inserted.changes > 0) {
        return { kind: "acquired" } as const;
      }

      const row = this.database
        .prepare(
          `
          select request_hash, state, response_value
          from idempotency_records
          where key_hash = ?
        `,
        )
        .get(input.keyHash) as RuntimeRow;
      return { kind: "existing", row } as const;
    });

    if (claim.kind === "acquired") {
      return claim;
    }
    if (readString(claim.row, "request_hash") !== input.requestHash) {
      return { kind: "conflict" };
    }
    if (readString(claim.row, "state") === "in_progress") {
      return { kind: "in_progress" };
    }

    return {
      kind: "completed",
      response: parseRuntimeActionHttpResult(
        parseJson(await this.secretCodec.decode(readString(claim.row, "response_value"))),
      ),
    };
  }

  async complete(input: CompleteIdempotencyInput): Promise<boolean> {
    const responseValue = await this.secretCodec.encode(JSON.stringify(input.response));
    const result = this.database
      .prepare(
        `
        update idempotency_records
        set state = 'completed', response_value = ?, expires_at = ?
        where key_hash = ?
          and claim_id = ?
          and request_hash = ?
          and state = 'in_progress'
      `,
      )
      .run(responseValue, input.expiresAt, input.keyHash, input.claimId, input.requestHash);
    return result.changes > 0;
  }
}

export class SqliteRunLogStore implements IRunLogStore {
  private readonly database: DatabaseSync;
  private readonly limit: number;

  constructor(database: DatabaseSync, limit: number) {
    this.database = database;
    this.limit = limit;
  }

  async add(run: RunLog): Promise<RunLogWriteResult> {
    insertRun(this.database, run);

    try {
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
      return { retentionApplied: true };
    } catch {
      return { retentionApplied: false };
    }
  }

  async get(id: string): Promise<RunLog | undefined> {
    const row = this.database.prepare("select service, value from runs where id = ?").get(id);
    return row ? readRunLogRow(row) : undefined;
  }

  async list(input: RunLogListInput = {}): Promise<RunLogPage> {
    const query = buildRunLogQuery(input, this.limit, () => "?");
    const rows = this.database.prepare(query.sql).all(...query.values);
    return toRunLogPage(rows, query.limit);
  }
}

function insertRun(database: DatabaseSync, run: RunLog): void {
  database
    .prepare(
      `
      insert into runs (id, service, action_id, caller, started_at, completed_at, ok, value)
      values (?, ?, ?, ?, ?, ?, ?, ?)
      on conflict(id) do update set
        service = excluded.service,
        action_id = excluded.action_id,
        caller = excluded.caller,
        started_at = excluded.started_at,
        completed_at = excluded.completed_at,
        ok = excluded.ok,
        value = excluded.value
    `,
    )
    .run(
      run.id,
      run.service,
      run.actionId,
      run.caller,
      run.startedAt,
      run.completedAt,
      run.ok ? 1 : 0,
      JSON.stringify(run),
    );
}

function runSqliteMigrations(database: DatabaseSync, logger?: RuntimeLogger): void {
  const startedAt = Date.now();
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
  let newlyAppliedCount = 0;

  for (const file of migrationFiles) {
    if (applied.has(file)) {
      continue;
    }

    const migrationStartedAt = Date.now();
    logger?.info({ migration: file }, "sqlite migration started");
    try {
      const sql = readFileSync(new URL(file, migrationDirectory), "utf8");
      runInTransaction(database, () => {
        database.exec(sql);
        database
          .prepare("insert into runtime_migrations (name, applied_at) values (?, ?)")
          .run(file, new Date().toISOString());
      });
    } catch (error) {
      logger?.error(
        { migration: file, durationMs: Date.now() - migrationStartedAt, err: error },
        "sqlite migration failed",
      );
      throw error;
    }
    applied.add(file);
    newlyAppliedCount += 1;
    logger?.info({ migration: file, durationMs: Date.now() - migrationStartedAt }, "sqlite migration completed");
  }

  logger?.info(
    {
      migrationCount: migrationFiles.length,
      appliedCount: migrationFiles.filter((file) => applied.has(file)).length,
      newlyAppliedCount,
      durationMs: Date.now() - startedAt,
    },
    "sqlite migrations ready",
  );
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

async function readRotatedStateSecrets(
  database: DatabaseSync,
  currentCodec: ISecretCodec,
  nextCodec: ISecretCodec,
): Promise<RotatedStateSecret[]> {
  const rows = database.prepare("select state, value from oauth_states").all();
  return await Promise.all(
    rows.map(async (row) => ({
      state: readString(row, "state"),
      value: await nextCodec.encode(await currentCodec.decode(readString(row, "value"))),
    })),
  );
}

function writeRotatedStateSecrets(database: DatabaseSync, states: RotatedStateSecret[]): void {
  const statement = database.prepare("update oauth_states set value = ? where state = ?");
  for (const state of states) {
    statement.run(state.value, state.state);
  }
}

async function readRotatedIdempotencySecrets(
  database: DatabaseSync,
  currentCodec: ISecretCodec,
  nextCodec: ISecretCodec,
): Promise<RotatedIdempotencySecret[]> {
  const rows = database
    .prepare("select key_hash, response_value from idempotency_records where response_value is not null")
    .all();
  return await Promise.all(
    rows.map(async (row) => ({
      keyHash: readString(row, "key_hash"),
      value: await nextCodec.encode(await currentCodec.decode(readString(row, "response_value"))),
    })),
  );
}

function writeRotatedIdempotencySecrets(database: DatabaseSync, responses: RotatedIdempotencySecret[]): void {
  const statement = database.prepare("update idempotency_records set response_value = ? where key_hash = ?");
  for (const response of responses) {
    statement.run(response.value, response.keyHash);
  }
}

function runInTransaction<T>(database: DatabaseSync, work: () => T): T {
  database.exec("begin immediate");
  try {
    const result = work();
    database.exec("commit");
    return result;
  } catch (error) {
    database.exec("rollback");
    throw error;
  }
}

async function getSecretJson<T>(input: SecretJsonInput): Promise<T | undefined> {
  const stored = getStoredValue(input.database, input.table, "service", input.service);
  return stored ? parseJson<T>(await input.secretCodec.decode(stored)) : undefined;
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
