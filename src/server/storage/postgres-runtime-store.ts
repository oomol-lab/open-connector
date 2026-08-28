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
import type { IRunLogStore, RunLog, RunLogListInput, RunLogPage, RunLogWriteResult } from "./runtime-store.ts";
import type { IRuntimeTokenStore, RuntimeTokenRecord } from "./runtime-token-service.ts";
import type { PoolClient } from "pg";

import { Pool } from "pg";
import { parseRuntimeActionHttpResult } from "../api/runtime-api.ts";
import { PlainTextSecretCodec } from "../secrets/secret-codec-core.ts";
import { assertPostgresSchemaReady } from "./postgres-migrations.ts";
import { DEFAULT_RUN_LIMIT, decodeRunLogCursor, encodeRunLogCursor } from "./runtime-store.ts";

type RuntimeRow = Record<string, unknown>;

export interface PostgresRuntimeDatabaseOptions {
  logger?: RuntimeLogger;
  runLimit?: number;
  secretCodec?: ISecretCodec;
  poolMax?: number;
  connectionTimeoutMs?: number;
}

export class PostgresRuntimeDatabase implements RuntimeDatabase {
  readonly connectionStore: IConnectionStore;
  readonly oauthClientConfigStore: IOAuthClientConfigStore;
  readonly oauthStateStore: IOAuthStateStore;
  readonly runtimeTokenStore: IRuntimeTokenStore;
  readonly runtimePolicyStore: IRuntimePolicyStore;
  readonly runLogStore: IRunLogStore;
  readonly idempotencyStore: IIdempotencyStore;
  readonly marketplaceStore: IMarketplaceStore;

  private readonly pool: Pool;
  private readonly secretCodec: ISecretCodec;

  private constructor(pool: Pool, options: PostgresRuntimeDatabaseOptions) {
    this.pool = pool;
    this.secretCodec = options.secretCodec ?? new PlainTextSecretCodec();
    this.connectionStore = new PostgresConnectionStore(pool, this.secretCodec);
    this.oauthClientConfigStore = new PostgresOAuthClientConfigStore(pool, this.secretCodec);
    this.oauthStateStore = new PostgresOAuthStateStore(pool, this.secretCodec);
    this.runtimeTokenStore = new PostgresRuntimeTokenStore(pool);
    this.runtimePolicyStore = new PostgresRuntimePolicyStore(pool);
    this.runLogStore = new PostgresRunLogStore(pool, options.runLimit ?? DEFAULT_RUN_LIMIT);
    this.idempotencyStore = new PostgresIdempotencyStore(pool, this.secretCodec);
    this.marketplaceStore = new PostgresMarketplaceStore(pool);
  }

  static async open(
    connectionString: string,
    options: PostgresRuntimeDatabaseOptions = {},
  ): Promise<PostgresRuntimeDatabase> {
    const pool = new Pool({
      application_name: "open-connector",
      connectionString,
      connectionTimeoutMillis: options.connectionTimeoutMs ?? 10_000,
      max: options.poolMax ?? 10,
    });
    pool.on("error", (error) => {
      options.logger?.error({ err: error }, "postgres idle client error");
    });

    try {
      await assertPostgresSchemaReady(pool);
      return new PostgresRuntimeDatabase(pool, options);
    } catch (error) {
      await pool.end();
      throw error;
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async resetRuntimeData(): Promise<void> {
    await runInTransaction(this.pool, async (client) => {
      await client.query(`
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
    });
  }

  async rotateSecretCodec(nextSecretCodec: ISecretCodec): Promise<void> {
    await runInTransaction(this.pool, async (client) => {
      await client.query(
        "lock table connections, oauth_client_configs, oauth_states, idempotency_records in access exclusive mode",
      );

      const connectionRows = await client.query<RuntimeRow>("select service, connection_name, value from connections");
      const connections = await Promise.all(
        connectionRows.rows.map(async (row) => ({
          service: readString(row, "service"),
          connectionName: readString(row, "connection_name"),
          value: await nextSecretCodec.encode(await this.secretCodec.decode(readString(row, "value"))),
        })),
      );
      for (const connection of connections) {
        await client.query("update connections set value = $1 where service = $2 and connection_name = $3", [
          connection.value,
          connection.service,
          connection.connectionName,
        ]);
      }

      const configRows = await client.query<RuntimeRow>("select service, value from oauth_client_configs");
      const configs = await Promise.all(
        configRows.rows.map(async (row) => ({
          service: readString(row, "service"),
          value: await nextSecretCodec.encode(await this.secretCodec.decode(readString(row, "value"))),
        })),
      );
      for (const config of configs) {
        await client.query("update oauth_client_configs set value = $1 where service = $2", [
          config.value,
          config.service,
        ]);
      }

      const stateRows = await client.query<RuntimeRow>("select state, value from oauth_states");
      const states = await Promise.all(
        stateRows.rows.map(async (row) => ({
          state: readString(row, "state"),
          value: await nextSecretCodec.encode(await this.secretCodec.decode(readString(row, "value"))),
        })),
      );
      for (const state of states) {
        await client.query("update oauth_states set value = $1 where state = $2", [state.value, state.state]);
      }

      const responseRows = await client.query<RuntimeRow>(
        "select key_hash, response_value from idempotency_records where response_value is not null",
      );
      const responses = await Promise.all(
        responseRows.rows.map(async (row) => ({
          keyHash: readString(row, "key_hash"),
          value: await nextSecretCodec.encode(await this.secretCodec.decode(readString(row, "response_value"))),
        })),
      );
      for (const response of responses) {
        await client.query("update idempotency_records set response_value = $1 where key_hash = $2", [
          response.value,
          response.keyHash,
        ]);
      }

      const marketplaceRows = await client.query<RuntimeRow>("select value from marketplace_config where id = 1");
      const marketplaceRow = marketplaceRows.rows[0];
      if (marketplaceRow) {
        const config = parseJson<StoredMarketplaceConfig>(readString(marketplaceRow, "value"));
        config.apiKeyEncrypted = await nextSecretCodec.encode(await this.secretCodec.decode(config.apiKeyEncrypted));
        await client.query("update marketplace_config set value = $1 where id = 1", [JSON.stringify(config)]);
      }
    });
  }
}

class PostgresMarketplaceStore implements IMarketplaceStore {
  private readonly pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  async getConfig(): Promise<StoredMarketplaceConfig | undefined> {
    const result = await this.pool.query<RuntimeRow>("select value from marketplace_config where id = 1");
    const row = result.rows[0];
    return row ? parseJson<StoredMarketplaceConfig>(readString(row, "value")) : undefined;
  }

  async setConfig(config: StoredMarketplaceConfig): Promise<void> {
    await this.pool.query(
      "insert into marketplace_config (id, value) values (1, $1) on conflict(id) do update set value = excluded.value",
      [JSON.stringify(config)],
    );
  }

  async deleteConfig(): Promise<void> {
    await this.pool.query("delete from marketplace_config where id = 1");
  }

  async listProviderPreferences(): Promise<ProviderPreference[]> {
    const result = await this.pool.query<RuntimeRow>(
      "select service, enabled, created_at, updated_at from provider_preferences order by service",
    );
    return result.rows.map((row) => ({
      service: readString(row, "service"),
      enabled: row.enabled === true,
      createdAt: readString(row, "created_at"),
      updatedAt: readString(row, "updated_at"),
    }));
  }

  async setProviderPreference(preference: ProviderPreference): Promise<void> {
    await this.pool.query(
      "insert into provider_preferences (service, enabled, created_at, updated_at) values ($1, $2, $3, $4) on conflict(service) do update set enabled = excluded.enabled, updated_at = excluded.updated_at",
      [preference.service, preference.enabled, preference.createdAt, preference.updatedAt],
    );
  }
}

class PostgresConnectionStore implements IConnectionStore {
  private readonly pool: Pool;
  private readonly secretCodec: ISecretCodec;

  constructor(pool: Pool, secretCodec: ISecretCodec) {
    this.pool = pool;
    this.secretCodec = secretCodec;
  }

  async get(service: string, connectionName: string): Promise<StoredConnection | undefined> {
    const result = await this.pool.query<RuntimeRow>(
      "select id, revision, value from connections where service = $1 and connection_name = $2",
      [service, connectionName],
    );
    const row = result.rows[0];
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
    const result = await this.pool.query<RuntimeRow>(
      `
        insert into connections (id, revision, service, connection_name, value, updated_at)
        values ($1, $2, $3, $4, $5, $6)
        on conflict(service, connection_name) do update set
          revision = excluded.revision,
          value = excluded.value,
          updated_at = excluded.updated_at
        returning id, revision
      `,
      [
        crypto.randomUUID(),
        crypto.randomUUID(),
        service,
        connectionName,
        await this.secretCodec.encode(JSON.stringify(credential)),
        new Date().toISOString(),
      ],
    );
    const row = result.rows[0]!;
    return {
      id: readString(row, "id"),
      revision: readString(row, "revision"),
      service,
      connectionName,
      credential,
    };
  }

  async updateCredential(input: StoredConnection): Promise<boolean> {
    const result = await this.pool.query(
      `
        update connections
        set revision = $1, value = $2, updated_at = $3
        where service = $4 and connection_name = $5 and id = $6 and revision = $7
        returning id
      `,
      [
        crypto.randomUUID(),
        await this.secretCodec.encode(JSON.stringify(input.credential)),
        new Date().toISOString(),
        input.service,
        input.connectionName,
        input.id,
        input.revision,
      ],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async delete(service: string, connectionName: string): Promise<void> {
    await this.pool.query("delete from connections where service = $1 and connection_name = $2", [
      service,
      connectionName,
    ]);
  }

  async list(): Promise<StoredConnection[]> {
    const result = await this.pool.query<RuntimeRow>(
      "select id, revision, service, connection_name, value from connections order by service, connection_name",
    );
    return await Promise.all(
      result.rows.map(async (row) => ({
        id: readString(row, "id"),
        revision: readString(row, "revision"),
        service: readString(row, "service"),
        connectionName: readString(row, "connection_name"),
        credential: parseJson<ResolvedCredential>(await this.secretCodec.decode(readString(row, "value"))),
      })),
    );
  }
}

class PostgresOAuthClientConfigStore implements IOAuthClientConfigStore {
  private readonly pool: Pool;
  private readonly secretCodec: ISecretCodec;

  constructor(pool: Pool, secretCodec: ISecretCodec) {
    this.pool = pool;
    this.secretCodec = secretCodec;
  }

  async get(service: string): Promise<OAuthClientConfig | undefined> {
    const result = await this.pool.query<RuntimeRow>("select value from oauth_client_configs where service = $1", [
      service,
    ]);
    const row = result.rows[0];
    return row ? parseJson<OAuthClientConfig>(await this.secretCodec.decode(readString(row, "value"))) : undefined;
  }

  async set(config: OAuthClientConfig): Promise<void> {
    await this.pool.query(
      `
        insert into oauth_client_configs (service, value, updated_at)
        values ($1, $2, $3)
        on conflict(service) do update set value = excluded.value, updated_at = excluded.updated_at
      `,
      [config.service, await this.secretCodec.encode(JSON.stringify(config)), new Date().toISOString()],
    );
  }

  async delete(service: string): Promise<void> {
    await this.pool.query("delete from oauth_client_configs where service = $1", [service]);
  }

  async list(): Promise<OAuthClientConfig[]> {
    const result = await this.pool.query<RuntimeRow>("select value from oauth_client_configs order by service");
    return await Promise.all(
      result.rows.map(async (row) =>
        parseJson<OAuthClientConfig>(await this.secretCodec.decode(readString(row, "value"))),
      ),
    );
  }
}

class PostgresOAuthStateStore implements IOAuthStateStore {
  private readonly pool: Pool;
  private readonly secretCodec: ISecretCodec;

  constructor(pool: Pool, secretCodec: ISecretCodec) {
    this.pool = pool;
    this.secretCodec = secretCodec;
  }

  async deleteCreatedBefore(cutoff: string): Promise<void> {
    await this.pool.query("delete from oauth_states where created_at < $1", [cutoff]);
  }

  async set(state: OAuthAuthorizationState): Promise<void> {
    await this.pool.query(
      `
        insert into oauth_states (state, value, created_at)
        values ($1, $2, $3)
        on conflict(state) do update set value = excluded.value, created_at = excluded.created_at
      `,
      [state.state, await this.secretCodec.encode(JSON.stringify(state)), state.createdAt],
    );
  }

  async take(state: string): Promise<OAuthAuthorizationState | undefined> {
    const result = await this.pool.query<RuntimeRow>("delete from oauth_states where state = $1 returning value", [
      state,
    ]);
    const row = result.rows[0];
    return row
      ? parseJson<OAuthAuthorizationState>(await this.secretCodec.decode(readString(row, "value")))
      : undefined;
  }
}

class PostgresRuntimeTokenStore implements IRuntimeTokenStore {
  private readonly pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  async add(record: RuntimeTokenRecord): Promise<void> {
    await this.pool.query(
      `
        insert into runtime_tokens (
          id, name, token_hash, allowed_actions, blocked_actions, allowed_proxies, allowed_connections, created_at, last_used_at
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `,
      [
        record.id,
        record.name,
        record.tokenHash,
        JSON.stringify(record.allowedActions),
        JSON.stringify(record.blockedActions),
        JSON.stringify(record.allowedProxies),
        JSON.stringify(record.allowedConnections ?? []),
        record.createdAt,
        record.lastUsedAt ?? null,
      ],
    );
  }

  async list(): Promise<RuntimeTokenRecord[]> {
    const result = await this.pool.query<RuntimeRow>(`
      select id, name, token_hash, allowed_actions, blocked_actions, allowed_proxies, allowed_connections, created_at, last_used_at
      from runtime_tokens
      where revoked_at is null
      order by created_at desc, id desc
    `);
    return result.rows.map(readRuntimeTokenRow);
  }

  async findByHash(tokenHash: string): Promise<RuntimeTokenRecord | undefined> {
    const result = await this.pool.query<RuntimeRow>(
      `
        select id, name, token_hash, allowed_actions, blocked_actions, allowed_proxies, allowed_connections, created_at, last_used_at
        from runtime_tokens
        where token_hash = $1 and revoked_at is null
      `,
      [tokenHash],
    );
    const row = result.rows[0];
    return row ? readRuntimeTokenRow(row) : undefined;
  }

  async updatePolicy(id: string, policy: TokenPolicy): Promise<RuntimeTokenRecord | undefined> {
    const result = await this.pool.query<RuntimeRow>(
      `
        update runtime_tokens
        set allowed_actions = $1, blocked_actions = $2, allowed_proxies = $3, allowed_connections = $4
        where id = $5 and revoked_at is null
        returning id, name, token_hash, allowed_actions, blocked_actions, allowed_proxies, allowed_connections, created_at, last_used_at
      `,
      [
        JSON.stringify(policy.allowedActions),
        JSON.stringify(policy.blockedActions),
        JSON.stringify(policy.allowedProxies),
        JSON.stringify(policy.allowedConnections ?? []),
        id,
      ],
    );
    const row = result.rows[0];
    return row ? readRuntimeTokenRow(row) : undefined;
  }

  async revoke(id: string): Promise<boolean> {
    const result = await this.pool.query("delete from runtime_tokens where id = $1", [id]);
    return (result.rowCount ?? 0) > 0;
  }

  async markUsed(id: string, usedAt: string): Promise<void> {
    await this.pool.query("update runtime_tokens set last_used_at = $1 where id = $2 and revoked_at is null", [
      usedAt,
      id,
    ]);
  }
}

class PostgresRuntimePolicyStore implements IRuntimePolicyStore {
  private readonly pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  async get(): Promise<RuntimePolicyRecord | undefined> {
    const result = await this.pool.query<RuntimeRow>("select value, updated_at from runtime_policy where id = 1");
    const row = result.rows[0];
    return row
      ? {
          rules: parseJson(readString(row, "value")),
          updatedAt: readString(row, "updated_at"),
        }
      : undefined;
  }

  async set(record: RuntimePolicyRecord): Promise<void> {
    await this.pool.query(
      `
        insert into runtime_policy (id, value, updated_at)
        values (1, $1, $2)
        on conflict(id) do update set value = excluded.value, updated_at = excluded.updated_at
      `,
      [JSON.stringify(record.rules), record.updatedAt],
    );
  }
}

class PostgresIdempotencyStore implements IIdempotencyStore {
  private readonly pool: Pool;
  private readonly secretCodec: ISecretCodec;

  constructor(pool: Pool, secretCodec: ISecretCodec) {
    this.pool = pool;
    this.secretCodec = secretCodec;
  }

  async claim(input: IdempotencyClaimInput): Promise<IdempotencyClaimResult> {
    const claim = await runInTransaction(this.pool, async (client) => {
      await client.query("delete from idempotency_records where expires_at <= $1", [input.now]);
      const inserted = await client.query(
        `
          insert into idempotency_records (
            key_hash, claim_id, request_hash, state, response_value, created_at, expires_at
          )
          values ($1, $2, $3, 'in_progress', null, $4, $5)
          on conflict(key_hash) do nothing
          returning key_hash
        `,
        [input.keyHash, input.claimId, input.requestHash, input.now, input.expiresAt],
      );
      if ((inserted.rowCount ?? 0) > 0) {
        return { kind: "acquired" } as const;
      }

      const existing = await client.query<RuntimeRow>(
        "select request_hash, state, response_value from idempotency_records where key_hash = $1",
        [input.keyHash],
      );
      return { kind: "existing", row: existing.rows[0]! } as const;
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
    const result = await this.pool.query(
      `
        update idempotency_records
        set state = 'completed', response_value = $1, expires_at = $2
        where key_hash = $3
          and claim_id = $4
          and request_hash = $5
          and state = 'in_progress'
      `,
      [
        await this.secretCodec.encode(JSON.stringify(input.response)),
        input.expiresAt,
        input.keyHash,
        input.claimId,
        input.requestHash,
      ],
    );
    return (result.rowCount ?? 0) > 0;
  }
}

class PostgresRunLogStore implements IRunLogStore {
  private readonly pool: Pool;
  private readonly limit: number;

  constructor(pool: Pool, limit: number) {
    this.pool = pool;
    this.limit = limit;
  }

  async add(run: RunLog): Promise<RunLogWriteResult> {
    await this.pool.query(
      `
        insert into runs (id, service, action_id, caller, started_at, completed_at, ok, value)
        values ($1, $2, $3, $4, $5, $6, $7, $8)
        on conflict(id) do update set
          service = excluded.service,
          action_id = excluded.action_id,
          caller = excluded.caller,
          started_at = excluded.started_at,
          completed_at = excluded.completed_at,
          ok = excluded.ok,
          value = excluded.value
      `,
      [
        run.id,
        run.service,
        run.actionId,
        run.caller,
        run.startedAt,
        run.completedAt,
        run.ok ? 1 : 0,
        JSON.stringify(run),
      ],
    );

    try {
      await this.pool.query(
        `
          delete from runs
          where id in (
            select id from runs
            order by started_at desc, id desc
            offset $1
          )
        `,
        [this.limit],
      );
      return { retentionApplied: true };
    } catch {
      return { retentionApplied: false };
    }
  }

  async get(id: string): Promise<RunLog | undefined> {
    const result = await this.pool.query<RuntimeRow>("select service, value from runs where id = $1", [id]);
    const row = result.rows[0];
    return row ? readRunLogRow(row) : undefined;
  }

  async list(input: RunLogListInput = {}): Promise<RunLogPage> {
    const limit = Math.max(1, Math.min(input.limit ?? this.limit, this.limit));
    const cursor = decodeRunLogCursor(input.cursor);
    const conditions: string[] = [];
    const values: Array<string | number> = [];
    if (cursor) {
      const startedAtParameter = values.push(cursor.startedAt);
      const repeatedStartedAtParameter = values.push(cursor.startedAt);
      const idParameter = values.push(cursor.id);
      conditions.push(
        `(started_at < $${startedAtParameter} or (started_at = $${repeatedStartedAtParameter} and id < $${idParameter}))`,
      );
    }
    if (input.service) {
      conditions.push(`service = $${values.push(input.service)}`);
    }
    if (input.actionId) {
      conditions.push(`action_id = $${values.push(input.actionId)}`);
    }
    if (input.caller) {
      conditions.push(`caller = $${values.push(input.caller)}`);
    }
    if (input.ok !== undefined) {
      conditions.push(`ok = $${values.push(input.ok ? 1 : 0)}`);
    }
    const where = conditions.length > 0 ? `where ${conditions.join(" and ")}` : "";
    const limitParameter = values.push(limit + 1);
    const result = await this.pool.query<RuntimeRow>(
      `select service, value from runs ${where} order by started_at desc, id desc limit $${limitParameter}`,
      values,
    );
    const runs = result.rows.map(readRunLogRow);
    const items = runs.slice(0, limit);

    return {
      items,
      nextCursor: runs.length > limit && items.length > 0 ? encodeRunLogCursor(items[items.length - 1]) : undefined,
    };
  }
}

function readRuntimeTokenRow(row: RuntimeRow): RuntimeTokenRecord {
  return {
    id: readString(row, "id"),
    name: readString(row, "name"),
    tokenHash: readString(row, "token_hash"),
    allowedActions: parseJson(readString(row, "allowed_actions")),
    blockedActions: parseJson(readString(row, "blocked_actions")),
    allowedProxies: parseJson(readString(row, "allowed_proxies")),
    allowedConnections: parseJson(readOptionalString(row, "allowed_connections") ?? "[]"),
    createdAt: readString(row, "created_at"),
    lastUsedAt: readOptionalString(row, "last_used_at"),
  };
}

function readRunLogRow(row: RuntimeRow): RunLog {
  const run = parseJson<RunLog>(readString(row, "value"));
  return { ...run, service: readString(row, "service") };
}

function readString(row: RuntimeRow, key: string): string {
  const value = row[key];
  if (typeof value !== "string") {
    throw new Error(`Expected PostgreSQL column ${key} to be a string.`);
  }
  return value;
}

function readOptionalString(row: RuntimeRow, key: string): string | undefined {
  const value = row[key];
  if (value == null) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new Error(`Expected PostgreSQL column ${key} to be a string.`);
  }
  return value;
}

function parseJson<T>(value: string): T {
  return JSON.parse(value) as T;
}

async function runInTransaction<T>(pool: Pool, work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const result = await work(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
