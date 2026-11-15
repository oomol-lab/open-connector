import type { IConnectionStore } from "../../../connection-store.ts";
import type { TokenPolicy } from "../../../core/action-policy.ts";
import type { RuntimeLogger } from "../../../core/types.ts";
import type {
  IMarketplaceStore,
  ProviderPreference,
  StoredMarketplaceConfig,
} from "../../../marketplace/marketplace-service.ts";
import type { IOAuthClientConfigStore, OAuthClientConfig } from "../../../oauth/oauth-client-config-service.ts";
import type { TenantScope } from "../../../tenant/tenant-scope.ts";
import type { ISecretCodec } from "../../secrets/secret-codec-core.ts";
import type { RequestTransaction } from "../connection-request-store.ts";
import type {
  CompleteIdempotencyInput,
  IdempotencyClaimInput,
  IdempotencyClaimResult,
  IIdempotencyStore,
} from "../idempotency-store.ts";
import type { MigrationSource } from "../migration-source.ts";
import type {
  IOAuthClientStore,
  IOAuthCodeStore,
  IOAuthSigningKeyStore,
  IOAuthTokenStore,
  OAuthAccessTokenRecord,
  OAuthAuthorizationCodeRecord,
  OAuthClientRecord,
  OAuthSigningKeyRecord,
} from "../oauth-as-stores.ts";
import type { RuntimeDatabase } from "../runtime-database.ts";
import type { IRuntimePolicyStore, RuntimePolicyRecord } from "../runtime-policy-store.ts";
import type { RuntimeRow } from "../runtime-sql.ts";
import type { IRunLogStore, RunLog, RunLogListInput, RunLogPage, RunLogWriteResult } from "../runtime-store.ts";
import type { IRuntimeTokenStore, RuntimeTokenRecord } from "../runtime-token-service.ts";
import type { PoolClient } from "pg";

import { Pool } from "pg";
import { instanceScope, tenantForInsert, tenantPredicatePg, tenantScope } from "../../../tenant/tenant-scope.ts";
import { parseRuntimeActionHttpResult } from "../../api/runtime-api.ts";
import { PlainTextSecretCodec } from "../../secrets/secret-codec-core.ts";
import { ConnectionRequestStore } from "../connection-request-store.ts";
import { SqlConnectionStore } from "../connection-store.ts";
import { CustomMcpStore } from "../custom-mcp-store.ts";
import { SqlOAuthStateStore } from "../oauth-state-store.ts";
import {
  listRunLogs,
  parseJson,
  readRunLogRow,
  readRuntimePolicyRow,
  readRuntimeTokenRow,
  readString,
  runtimeTokenColumns,
} from "../runtime-sql.ts";
import { DEFAULT_RUN_LIMIT } from "../runtime-store.ts";
import { SaasProjectStore } from "../saas-project-store.ts";
import { SqlTriggerStore } from "../trigger-store.ts";
import { assertPostgresSchemaReady } from "./migrations.ts";

export interface PostgresRuntimeDatabaseOptions {
  logger?: RuntimeLogger;
  runLimit?: number;
  secretCodec?: ISecretCodec;
  poolMax?: number;
  connectionTimeoutMs?: number;
  migrations?: MigrationSource;
  /** Tenant binding for this instance's stores; omitted binds the default tenant. */
  tenantScope?: TenantScope;
  /** True only for pools created by open(); sibling views never close the shared pool. */
  ownsPool?: boolean;
}

export class PostgresRuntimeDatabase implements RuntimeDatabase {
  readonly customMcpStore: CustomMcpStore;
  readonly saasProjectStore: SaasProjectStore;
  readonly connectionRequestStore: ConnectionRequestStore;
  readonly connectionStore: IConnectionStore;
  readonly triggerStore: SqlTriggerStore;
  readonly oauthClientConfigStore: IOAuthClientConfigStore;
  readonly oauthStateStore: SqlOAuthStateStore;
  readonly runtimeTokenStore: IRuntimeTokenStore;
  readonly runtimePolicyStore: IRuntimePolicyStore;
  readonly runLogStore: IRunLogStore;
  readonly idempotencyStore: IIdempotencyStore;
  readonly marketplaceStore: IMarketplaceStore;
  readonly oauthClientStore: IOAuthClientStore;
  readonly oauthCodeStore: IOAuthCodeStore;
  readonly oauthTokenStore: IOAuthTokenStore;
  readonly oauthSigningKeyStore: IOAuthSigningKeyStore;

  private readonly pool: Pool;
  private readonly secretCodec: ISecretCodec;
  private readonly scope: TenantScope;
  private readonly runLimit: number;
  private readonly ownsPool: boolean;

  private constructor(pool: Pool, options: PostgresRuntimeDatabaseOptions) {
    this.pool = pool;
    this.ownsPool = options.ownsPool === true;
    this.scope = options.tenantScope === undefined ? "local" : options.tenantScope;
    this.runLimit = options.runLimit ?? DEFAULT_RUN_LIMIT;
    this.secretCodec = options.secretCodec ?? new PlainTextSecretCodec();
    const transaction: RequestTransaction = (statements) =>
      runInTransaction(pool, async (client) => {
        // Serialize request transitions across processes, including first requests with no row to lock.
        await client.query("select pg_advisory_xact_lock(1326382671, 2)");
        const results: Record<string, unknown>[][] = [];
        for (const { sql, values } of statements) {
          let index = 0;
          results.push(
            (
              await client.query(
                sql.replaceAll("?", () => `$${++index}`),
                values,
              )
            ).rows,
          );
        }
        return results;
      });
    this.customMcpStore = new CustomMcpStore({
      secretCodec: this.secretCodec,
      transaction,
      read: async (sql, values) => {
        let index = 0;
        return (
          await pool.query(
            sql.replaceAll("?", () => `$${++index}`),
            values,
          )
        ).rows;
      },
      scope: this.scope,
    });
    this.connectionRequestStore = new ConnectionRequestStore(transaction, this.secretCodec, this.scope);
    this.connectionStore = new SqlConnectionStore(transaction, this.secretCodec, this.scope);
    this.triggerStore = new SqlTriggerStore(transaction, this.secretCodec, this.scope);
    this.saasProjectStore = new SaasProjectStore(transaction, this.secretCodec);
    this.oauthClientConfigStore = new PostgresOAuthClientConfigStore(pool, this.secretCodec, this.scope);
    this.oauthStateStore = new SqlOAuthStateStore(transaction, this.secretCodec, this.scope);
    this.runtimeTokenStore = new PostgresRuntimeTokenStore(pool, this.scope);
    this.runtimePolicyStore = new PostgresRuntimePolicyStore(pool);
    this.runLogStore = new PostgresRunLogStore(pool, this.runLimit, this.scope);
    this.idempotencyStore = new PostgresIdempotencyStore(pool, this.secretCodec, this.scope);
    this.marketplaceStore = new PostgresMarketplaceStore(pool, this.scope);
    this.oauthClientStore = new PostgresOAuthClientStore(pool);
    this.oauthCodeStore = new PostgresOAuthCodeStore(pool, this.scope);
    this.oauthTokenStore = new PostgresOAuthTokenStore(pool, this.scope);
    this.oauthSigningKeyStore = new PostgresOAuthSigningKeyStore(pool);
  }

  /** A sibling view whose stores are bound to one tenant; shares the connection pool. */
  forTenant(tenantId: string): PostgresRuntimeDatabase {
    return new PostgresRuntimeDatabase(this.pool, {
      secretCodec: this.secretCodec,
      runLimit: this.runLimit,
      tenantScope: tenantScope(tenantId),
    });
  }

  /** Cross-tenant view for instance jobs (sweepers, rotation); never from request input. */
  forInstance(): PostgresRuntimeDatabase {
    return new PostgresRuntimeDatabase(this.pool, {
      secretCodec: this.secretCodec,
      runLimit: this.runLimit,
      tenantScope: instanceScope(),
    });
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
      await assertPostgresSchemaReady(pool, options.migrations);
      return new PostgresRuntimeDatabase(pool, { ...options, ownsPool: true });
    } catch (error) {
      await pool.end();
      throw error;
    }
  }

  async close(): Promise<void> {
    if (this.ownsPool) {
      await this.pool.end();
    }
  }

  async resetRuntimeData(): Promise<void> {
    await runInTransaction(this.pool, async (client) => {
      await client.query("select pg_advisory_xact_lock(1326382671, 2)");
      await client.query("update connection_retirements set generation = $1", [crypto.randomUUID()]);
      await client.query(`
        delete from oauth_sources;
        delete from saas_cleanup;
        delete from managed_project;
        delete from trigger_source_applications;
        delete from trigger_subscriptions;
      delete from connections;
        delete from oauth_client_configs;
        delete from oauth_states;
        delete from connection_requests;
        delete from runtime_tokens;
        delete from runtime_policy;
        delete from oauth_authorization_codes;
        delete from oauth_tokens;
        delete from runs;
        delete from idempotency_records;
        delete from custom_mcp;
      delete from marketplace_config;
        delete from provider_preferences;
      `);
    });
  }

  async rotateSecretCodec(nextSecretCodec: ISecretCodec): Promise<void> {
    await runInTransaction(this.pool, async (client) => {
      await client.query("select pg_advisory_xact_lock(1326382671, 2)");
      await client.query(
        "lock table connections, oauth_client_configs, oauth_states, connection_requests, idempotency_records, managed_project, oauth_sources, saas_cleanup, instance_identity, trigger_subscriptions, trigger_source_applications in access exclusive mode",
      );

      const project = await client.query<RuntimeRow>("select value from managed_project where id = 1");
      if (project.rows.length && !nextSecretCodec.encrypted)
        throw new Error("SaaS project configuration requires encrypted storage.");
      for (const row of project.rows) {
        const value = await nextSecretCodec.encode(await this.secretCodec.decode(readString(row, "value")));
        await client.query("update managed_project set value = $1 where id = 1", [value]);
      }
      const candidates = await client.query<RuntimeRow>(
        "select id, candidate_value from connection_requests where candidate_value is not null",
      );
      for (const row of candidates.rows) {
        const value = await nextSecretCodec.encode(await this.secretCodec.decode(readString(row, "candidate_value")));
        await client.query("update connection_requests set candidate_value = $1 where id = $2", [
          value,
          readString(row, "id"),
        ]);
      }
      const returnUris = await client.query<RuntimeRow>(
        "select id, return_uri from connection_requests where return_uri is not null",
      );
      for (const row of returnUris.rows) {
        const value = await nextSecretCodec.encode(await this.secretCodec.decode(readString(row, "return_uri")));
        await client.query("update connection_requests set return_uri = $1 where id = $2", [
          value,
          readString(row, "id"),
        ]);
      }
      const triggerRows = await client.query<RuntimeRow>("select id, value from trigger_subscriptions");
      for (const row of triggerRows.rows)
        await client.query("update trigger_subscriptions set value = $1 where id = $2", [
          await nextSecretCodec.encode(await this.secretCodec.decode(readString(row, "value"))),
          readString(row, "id"),
        ]);
      const sourceRows = await client.query<RuntimeRow>("select id, value from trigger_source_applications");
      for (const row of sourceRows.rows)
        await client.query("update trigger_source_applications set value = $1 where id = $2", [
          await nextSecretCodec.encode(await this.secretCodec.decode(readString(row, "value"))),
          readString(row, "id"),
        ]);
      const connectionRows = await client.query<RuntimeRow>(
        "select tenant_id, service, connection_name, value from connections",
      );
      const connections = await Promise.all(
        connectionRows.rows.map(async (row) => ({
          tenantId: readString(row, "tenant_id"),
          service: readString(row, "service"),
          connectionName: readString(row, "connection_name"),
          value: await nextSecretCodec.encode(await this.secretCodec.decode(readString(row, "value"))),
        })),
      );
      for (const connection of connections) {
        await client.query(
          "update connections set value = $1 where tenant_id = $2 and service = $3 and connection_name = $4",
          [connection.value, connection.tenantId, connection.service, connection.connectionName],
        );
      }

      const configRows = await client.query<RuntimeRow>("select tenant_id, service, value from oauth_client_configs");
      const configs = await Promise.all(
        configRows.rows.map(async (row) => ({
          tenantId: readString(row, "tenant_id"),
          service: readString(row, "service"),
          value: await nextSecretCodec.encode(await this.secretCodec.decode(readString(row, "value"))),
        })),
      );
      for (const config of configs) {
        await client.query("update oauth_client_configs set value = $1 where tenant_id = $2 and service = $3", [
          config.value,
          config.tenantId,
          config.service,
        ]);
      }

      const requestRows = await client.query<RuntimeRow>(
        "select id, value from connection_requests where value is not null",
      );
      for (const row of requestRows.rows) {
        const value = await nextSecretCodec.encode(await this.secretCodec.decode(readString(row, "value")));
        await client.query("update connection_requests set value = $1 where id = $2", [value, readString(row, "id")]);
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
        "select tenant_id, key_hash, response_value from idempotency_records where response_value is not null",
      );
      const responses = await Promise.all(
        responseRows.rows.map(async (row) => ({
          tenantId: readString(row, "tenant_id"),
          keyHash: readString(row, "key_hash"),
          value: await nextSecretCodec.encode(await this.secretCodec.decode(readString(row, "response_value"))),
        })),
      );
      for (const response of responses) {
        await client.query(
          "update idempotency_records set response_value = $1 where tenant_id = $2 and key_hash = $3",
          [response.value, response.tenantId, response.keyHash],
        );
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
  private readonly scope: TenantScope;

  constructor(pool: Pool, scope: TenantScope) {
    this.pool = pool;
    this.scope = scope;
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
    const t = tenantPredicatePg(this.scope, 1);
    const result = await this.pool.query<RuntimeRow>(
      `select service, enabled, created_at, updated_at from provider_preferences where ${t.sql} order by service`,
      t.values,
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
      "insert into provider_preferences (tenant_id, service, enabled, created_at, updated_at) values ($1, $2, $3, $4, $5) on conflict(tenant_id, service) do update set enabled = excluded.enabled, updated_at = excluded.updated_at",
      [tenantForInsert(this.scope), preference.service, preference.enabled, preference.createdAt, preference.updatedAt],
    );
  }
}

class PostgresOAuthClientConfigStore implements IOAuthClientConfigStore {
  private readonly pool: Pool;
  private readonly secretCodec: ISecretCodec;
  private readonly scope: TenantScope;

  constructor(pool: Pool, secretCodec: ISecretCodec, scope: TenantScope) {
    this.pool = pool;
    this.secretCodec = secretCodec;
    this.scope = scope;
  }

  async get(service: string): Promise<OAuthClientConfig | undefined> {
    const t = tenantPredicatePg(this.scope, 2);
    const result = await this.pool.query<RuntimeRow>(
      `select value from oauth_client_configs where service = $1 and ${t.sql}`,
      [service, ...t.values],
    );
    const row = result.rows[0];
    return row ? parseJson<OAuthClientConfig>(await this.secretCodec.decode(readString(row, "value"))) : undefined;
  }

  async set(config: OAuthClientConfig): Promise<void> {
    await this.pool.query(
      `
        insert into oauth_client_configs (tenant_id, service, value, updated_at)
        values ($1, $2, $3, $4)
        on conflict(tenant_id, service) do update set value = excluded.value, updated_at = excluded.updated_at
      `,
      [
        tenantForInsert(this.scope),
        config.service,
        await this.secretCodec.encode(JSON.stringify(config)),
        new Date().toISOString(),
      ],
    );
  }

  async delete(service: string): Promise<void> {
    const t = tenantPredicatePg(this.scope, 2);
    await this.pool.query(`delete from oauth_client_configs where service = $1 and ${t.sql}`, [service, ...t.values]);
  }

  async list(): Promise<OAuthClientConfig[]> {
    const t = tenantPredicatePg(this.scope, 1);
    const result = await this.pool.query<RuntimeRow>(
      `select value from oauth_client_configs where ${t.sql} order by service`,
      t.values,
    );
    return await Promise.all(
      result.rows.map(async (row) =>
        parseJson<OAuthClientConfig>(await this.secretCodec.decode(readString(row, "value"))),
      ),
    );
  }
}

class PostgresRuntimeTokenStore implements IRuntimeTokenStore {
  private readonly pool: Pool;
  private readonly scope: TenantScope;

  constructor(pool: Pool, scope: TenantScope) {
    this.pool = pool;
    this.scope = scope;
  }

  async add(record: RuntimeTokenRecord): Promise<void> {
    await this.pool.query(
      `
        insert into runtime_tokens (
          tenant_id, ${runtimeTokenColumns}
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      `,
      [
        tenantForInsert(this.scope),
        record.id,
        record.name,
        record.tokenHash,
        JSON.stringify(record.allowedActions),
        JSON.stringify(record.blockedActions),
        JSON.stringify(record.allowedProxies),
        JSON.stringify(record.allowedConnections ?? []),
        JSON.stringify(record.allowedTriggers ?? []),
        record.createdAt,
        record.lastUsedAt ?? null,
      ],
    );
  }

  async list(): Promise<RuntimeTokenRecord[]> {
    const t = tenantPredicatePg(this.scope, 1);
    const result = await this.pool.query<RuntimeRow>(
      `
      select tenant_id, ${runtimeTokenColumns}
      from runtime_tokens
      where ${t.sql}
      order by created_at desc, id desc
    `,
      t.values,
    );
    return result.rows.map(readRuntimeTokenRow);
  }

  async hasAny(): Promise<boolean> {
    const t = tenantPredicatePg(this.scope, 1);
    const result = await this.pool.query(`select 1 from runtime_tokens where ${t.sql} limit 1`, t.values);
    return result.rows.length > 0;
  }

  async findByHash(tokenHash: string): Promise<RuntimeTokenRecord | undefined> {
    const result = await this.pool.query<RuntimeRow>(
      `
        select tenant_id, ${runtimeTokenColumns}
        from runtime_tokens
        where token_hash = $1 and ${tenantPredicatePg(this.scope, 2).sql}
      `,
      [tokenHash, ...tenantPredicatePg(this.scope, 2).values],
    );
    const row = result.rows[0];
    return row ? readRuntimeTokenRow(row) : undefined;
  }

  async findById(id: string): Promise<RuntimeTokenRecord | undefined> {
    const result = await this.pool.query<RuntimeRow>(
      `
        select tenant_id, ${runtimeTokenColumns}
        from runtime_tokens
        where id = $1 and ${tenantPredicatePg(this.scope, 2).sql}
      `,
      [id, ...tenantPredicatePg(this.scope, 2).values],
    );
    const row = result.rows[0];
    return row ? readRuntimeTokenRow(row) : undefined;
  }

  async updatePolicy(id: string, policy: TokenPolicy): Promise<RuntimeTokenRecord | undefined> {
    const result = await this.pool.query<RuntimeRow>(
      `
        update runtime_tokens
        set allowed_actions = $1, blocked_actions = $2, allowed_proxies = $3, allowed_connections = $4, allowed_triggers = $5
        where id = $6 and ${tenantPredicatePg(this.scope, 7).sql}
        returning tenant_id, ${runtimeTokenColumns}
      `,
      [
        JSON.stringify(policy.allowedActions),
        JSON.stringify(policy.blockedActions),
        JSON.stringify(policy.allowedProxies),
        JSON.stringify(policy.allowedConnections ?? []),
        JSON.stringify(policy.allowedTriggers ?? []),
        id,
        ...tenantPredicatePg(this.scope, 7).values,
      ],
    );
    const row = result.rows[0];
    return row ? readRuntimeTokenRow(row) : undefined;
  }

  async revoke(id: string): Promise<boolean> {
    const t = tenantPredicatePg(this.scope, 2);
    const result = await this.pool.query(`delete from runtime_tokens where id = $1 and ${t.sql}`, [id, ...t.values]);
    return (result.rowCount ?? 0) > 0;
  }

  async markUsed(id: string, usedAt: string): Promise<void> {
    const t = tenantPredicatePg(this.scope, 3);
    await this.pool.query(`update runtime_tokens set last_used_at = $1 where id = $2 and ${t.sql}`, [
      usedAt,
      id,
      ...t.values,
    ]);
  }
}

class PostgresOAuthClientStore implements IOAuthClientStore {
  private readonly pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  async add(record: OAuthClientRecord): Promise<void> {
    await this.pool.query(
      `
        insert into oauth_clients (
          client_id, client_name, registration_type, redirect_uris, scopes,
          token_endpoint_auth_method, client_secret_hash, metadata_document_url, created_at, rotated_at
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `,
      [
        record.clientId,
        record.clientName,
        record.registrationType,
        JSON.stringify(record.redirectUris),
        JSON.stringify(record.scopes),
        record.tokenEndpointAuthMethod,
        record.clientSecretHash ?? null,
        record.metadataDocumentUrl ?? null,
        record.createdAt,
        record.rotatedAt ?? null,
      ],
    );
  }

  async get(clientId: string): Promise<OAuthClientRecord | undefined> {
    const result = await this.pool.query<RuntimeRow>("select * from oauth_clients where client_id = $1", [clientId]);
    const row = result.rows[0];
    return row ? readOAuthClientRow(row) : undefined;
  }

  async list(): Promise<OAuthClientRecord[]> {
    const result = await this.pool.query<RuntimeRow>(
      "select * from oauth_clients order by created_at desc, client_id desc",
    );
    return result.rows.map(readOAuthClientRow);
  }

  async update(record: OAuthClientRecord): Promise<void> {
    await this.pool.query(
      `
        update oauth_clients
        set client_name = $1, registration_type = $2, redirect_uris = $3, scopes = $4,
          token_endpoint_auth_method = $5, client_secret_hash = $6, metadata_document_url = $7, rotated_at = $8
        where client_id = $9
      `,
      [
        record.clientName,
        record.registrationType,
        JSON.stringify(record.redirectUris),
        JSON.stringify(record.scopes),
        record.tokenEndpointAuthMethod,
        record.clientSecretHash ?? null,
        record.metadataDocumentUrl ?? null,
        record.rotatedAt ?? null,
        record.clientId,
      ],
    );
  }

  async delete(clientId: string): Promise<boolean> {
    const result = await this.pool.query("delete from oauth_clients where client_id = $1", [clientId]);
    return (result.rowCount ?? 0) > 0;
  }
}

class PostgresOAuthCodeStore implements IOAuthCodeStore {
  private readonly pool: Pool;
  private readonly scope: TenantScope;

  constructor(pool: Pool, scope: TenantScope) {
    this.pool = pool;
    this.scope = scope;
  }

  async add(record: OAuthAuthorizationCodeRecord): Promise<void> {
    await this.pool.query(
      `
        insert into oauth_authorization_codes (
          tenant_id, code_hash, client_id, redirect_uri, scope, code_challenge, resource,
          runtime_token_id, issued_at, expires_at, consumed_at
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      `,
      [
        tenantForInsert(this.scope),
        record.codeHash,
        record.clientId,
        record.redirectUri,
        record.scope,
        record.codeChallenge ?? null,
        record.resource ?? null,
        record.runtimeTokenId,
        record.issuedAt,
        record.expiresAt,
        record.consumedAt ?? null,
      ],
    );
  }

  async consume(codeHash: string): Promise<OAuthAuthorizationCodeRecord | undefined> {
    // Single conditional UPDATE: atomic single-use even under concurrent exchanges.
    const result = await this.pool.query<RuntimeRow>(
      `
        update oauth_authorization_codes
        set consumed_at = $1
        where code_hash = $2
          and consumed_at is null
          and expires_at > $1
          and ${tenantPredicatePg(this.scope, 3).sql}
        returning *
      `,
      [Date.now(), codeHash, ...tenantPredicatePg(this.scope, 3).values],
    );
    const row = result.rows[0];
    return row ? readOAuthCodeRow(row) : undefined;
  }

  async listByClient(clientId: string): Promise<OAuthAuthorizationCodeRecord[]> {
    const t = tenantPredicatePg(this.scope, 2);
    const result = await this.pool.query(`select * from oauth_authorization_codes where client_id = $1 and ${t.sql}`, [
      clientId,
      ...t.values,
    ]);
    return result.rows.map((row) => readOAuthCodeRow(row));
  }

  async deleteByClient(clientId: string): Promise<void> {
    const t = tenantPredicatePg(this.scope, 2);
    await this.pool.query(`delete from oauth_authorization_codes where client_id = $1 and ${t.sql}`, [
      clientId,
      ...t.values,
    ]);
  }

  async deleteExpired(nowMs: number): Promise<void> {
    const t = tenantPredicatePg(this.scope, 2);
    await this.pool.query(`delete from oauth_authorization_codes where expires_at <= $1 and ${t.sql}`, [
      nowMs,
      ...t.values,
    ]);
  }
}

class PostgresOAuthTokenStore implements IOAuthTokenStore {
  private readonly pool: Pool;
  private readonly scope: TenantScope;

  constructor(pool: Pool, scope: TenantScope) {
    this.pool = pool;
    this.scope = scope;
  }

  async add(record: OAuthAccessTokenRecord): Promise<void> {
    await this.insert(record);
  }

  private async insert(record: OAuthAccessTokenRecord): Promise<void> {
    await this.pool.query(
      `
        insert into oauth_tokens (
          tenant_id, token_hash, refresh_token_hash, client_id, runtime_token_id, scope, resource,
          issued_at, expires_at, refresh_expires_at, revoked_at, refresh_consumed_at
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      `,
      [
        tenantForInsert(this.scope),
        record.tokenHash,
        record.refreshTokenHash ?? null,
        record.clientId,
        record.runtimeTokenId,
        record.scope,
        record.resource ?? null,
        record.issuedAt,
        record.expiresAt,
        record.refreshExpiresAt ?? null,
        record.revokedAt ?? null,
        record.refreshConsumedAt ?? null,
      ],
    );
  }

  async findByAccessTokenHash(tokenHash: string): Promise<OAuthAccessTokenRecord | undefined> {
    const t = tenantPredicatePg(this.scope, 2);
    const result = await this.pool.query<RuntimeRow>(`select * from oauth_tokens where token_hash = $1 and ${t.sql}`, [
      tokenHash,
      ...t.values,
    ]);
    const row = result.rows[0];
    return row ? readOAuthTokenRow(row) : undefined;
  }

  async findByRefreshTokenHash(tokenHash: string): Promise<OAuthAccessTokenRecord | undefined> {
    const t = tenantPredicatePg(this.scope, 2);
    const result = await this.pool.query<RuntimeRow>(
      `select * from oauth_tokens where refresh_token_hash = $1 and ${t.sql}`,
      [tokenHash, ...t.values],
    );
    const row = result.rows[0];
    return row ? readOAuthTokenRow(row) : undefined;
  }

  async rotateRefreshToken(
    oldRefreshTokenHash: string,
    successor: OAuthAccessTokenRecord,
  ): Promise<OAuthAccessTokenRecord | undefined> {
    // One transaction: the successor is inserted only when the old refresh
    // token is still redeemable, and a failed insert rolls the consumption
    // back so the old token stays redeemable. The hash is retained (only
    // refresh_consumed_at is stamped) so a replayed token stays mapped to
    // its grant for revocation.
    return runInTransaction(this.pool, async (client) => {
      const result = await client.query<RuntimeRow>(
        `
          update oauth_tokens
          set refresh_consumed_at = $1
          where refresh_token_hash = $2
            and revoked_at is null
            and refresh_consumed_at is null
            and refresh_expires_at is not null
            and refresh_expires_at > $3
            and ${tenantPredicatePg(this.scope, 4).sql}
          returning *
        `,
        [Date.now(), oldRefreshTokenHash, Date.now(), ...tenantPredicatePg(this.scope, 4).values],
      );
      const row = result.rows[0];
      if (!row) {
        return undefined;
      }
      await client.query(
        `
          insert into oauth_tokens (
            tenant_id, token_hash, refresh_token_hash, client_id, runtime_token_id, scope, resource,
            issued_at, expires_at, refresh_expires_at, revoked_at
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        `,
        [
          tenantForInsert(this.scope),
          successor.tokenHash,
          successor.refreshTokenHash ?? null,
          successor.clientId,
          successor.runtimeTokenId,
          successor.scope,
          successor.resource ?? null,
          successor.issuedAt,
          successor.expiresAt,
          successor.refreshExpiresAt ?? null,
          successor.revokedAt ?? null,
        ],
      );
      return readOAuthTokenRow(row);
    });
  }

  async listByClient(clientId: string): Promise<OAuthAccessTokenRecord[]> {
    const result = await this.pool.query<RuntimeRow>(
      `select * from oauth_tokens where client_id = $1 and ${tenantPredicatePg(this.scope, 2).sql} order by issued_at, token_hash`,
      [clientId, ...tenantPredicatePg(this.scope, 2).values],
    );
    return result.rows.map(readOAuthTokenRow);
  }

  async revokeByGrant(clientId: string, runtimeTokenId: string): Promise<number> {
    const result = await this.pool.query(
      `
        update oauth_tokens
        set revoked_at = $1
        where client_id = $2 and runtime_token_id = $3 and revoked_at is null and ${tenantPredicatePg(this.scope, 4).sql}
      `,
      [Date.now(), clientId, runtimeTokenId, ...tenantPredicatePg(this.scope, 4).values],
    );
    return result.rowCount ?? 0;
  }

  async deleteExpired(nowMs: number): Promise<void> {
    await this.pool.query(
      `
        delete from oauth_tokens
        where expires_at <= $1
          and (refresh_expires_at is null or refresh_expires_at <= $1)
          and ${tenantPredicatePg(this.scope, 2).sql}
      `,
      [nowMs, ...tenantPredicatePg(this.scope, 2).values],
    );
  }
}

class PostgresOAuthSigningKeyStore implements IOAuthSigningKeyStore {
  private readonly pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  async add(record: OAuthSigningKeyRecord): Promise<void> {
    await this.pool.query(
      `
        insert into oauth_signing_keys (kid, private_key, public_key, created_at, retired_at)
        values ($1, $2, $3, $4, $5)
      `,
      [
        record.kid,
        JSON.stringify(record.privateKeyJwk),
        JSON.stringify(record.publicKeyJwk),
        record.createdAt,
        record.retiredAt ?? null,
      ],
    );
  }

  async active(): Promise<OAuthSigningKeyRecord> {
    const existing = await this.readActive();
    if (existing) {
      return existing;
    }
    const record = await generateSigningKeyRecord();
    try {
      await this.add(record);
    } catch {
      // A concurrent process inserted a key with the same primary key first; use theirs.
      const raced = await this.readActive();
      if (raced) {
        return raced;
      }
      throw new Error("Failed to persist a new OAuth signing key.");
    }
    return record;
  }

  async all(): Promise<OAuthSigningKeyRecord[]> {
    const result = await this.pool.query<RuntimeRow>(
      "select * from oauth_signing_keys where retired_at is null order by created_at desc, kid desc",
    );
    return result.rows.map(readOAuthSigningKeyRow);
  }

  async retire(kid: string): Promise<void> {
    await this.pool.query("update oauth_signing_keys set retired_at = $1 where kid = $2 and retired_at is null", [
      new Date().toISOString(),
      kid,
    ]);
  }

  private async readActive(): Promise<OAuthSigningKeyRecord | undefined> {
    const result = await this.pool.query<RuntimeRow>(
      "select * from oauth_signing_keys where retired_at is null order by created_at desc, kid desc limit 1",
    );
    const row = result.rows[0];
    return row ? readOAuthSigningKeyRow(row) : undefined;
  }
}

async function generateSigningKeyRecord(): Promise<OAuthSigningKeyRecord> {
  // `jose` is a lazy-only package (see eager-imports.test.ts): dynamic import only.
  const { exportJWK, generateKeyPair } = await import("jose");
  const { publicKey, privateKey } = await generateKeyPair("ES256", { extractable: true });
  return {
    kid: crypto.randomUUID(),
    privateKeyJwk: await exportJWK(privateKey),
    publicKeyJwk: await exportJWK(publicKey),
    createdAt: new Date().toISOString(),
  };
}

function readOAuthClientRow(row: RuntimeRow): OAuthClientRecord {
  return {
    clientId: readString(row, "client_id"),
    clientName: readString(row, "client_name"),
    registrationType: readString(row, "registration_type") as OAuthClientRecord["registrationType"],
    redirectUris: parseJson<string[]>(readString(row, "redirect_uris")),
    scopes: parseJson<string[]>(readString(row, "scopes")),
    tokenEndpointAuthMethod: readString(
      row,
      "token_endpoint_auth_method",
    ) as OAuthClientRecord["tokenEndpointAuthMethod"],
    clientSecretHash: readOptionalString(row, "client_secret_hash"),
    metadataDocumentUrl: readOptionalString(row, "metadata_document_url"),
    createdAt: readString(row, "created_at"),
    rotatedAt: readOptionalString(row, "rotated_at"),
  };
}

function readOAuthCodeRow(row: RuntimeRow): OAuthAuthorizationCodeRecord {
  return {
    tenantId: readString(row, "tenant_id"),
    codeHash: readString(row, "code_hash"),
    clientId: readString(row, "client_id"),
    redirectUri: readString(row, "redirect_uri"),
    scope: readString(row, "scope"),
    codeChallenge: readOptionalString(row, "code_challenge"),
    resource: readOptionalString(row, "resource"),
    runtimeTokenId: readString(row, "runtime_token_id"),
    issuedAt: readString(row, "issued_at"),
    expiresAt: readOptionalNumber(row, "expires_at")!,
    consumedAt: readOptionalNumber(row, "consumed_at"),
  };
}

function readOAuthTokenRow(row: RuntimeRow): OAuthAccessTokenRecord {
  return {
    tenantId: readString(row, "tenant_id"),
    tokenHash: readString(row, "token_hash"),
    refreshTokenHash: readOptionalString(row, "refresh_token_hash"),
    clientId: readString(row, "client_id"),
    runtimeTokenId: readString(row, "runtime_token_id"),
    scope: readString(row, "scope"),
    resource: readOptionalString(row, "resource"),
    issuedAt: readString(row, "issued_at"),
    expiresAt: readOptionalNumber(row, "expires_at")!,
    refreshExpiresAt: readOptionalNumber(row, "refresh_expires_at"),
    revokedAt: readOptionalNumber(row, "revoked_at"),
    refreshConsumedAt: readOptionalNumber(row, "refresh_consumed_at"),
  };
}

function readOAuthSigningKeyRow(row: RuntimeRow): OAuthSigningKeyRecord {
  return {
    kid: readString(row, "kid"),
    privateKeyJwk: parseJson<JsonWebKey>(readString(row, "private_key")),
    publicKeyJwk: parseJson<JsonWebKey>(readString(row, "public_key")),
    createdAt: readString(row, "created_at"),
    retiredAt: readOptionalString(row, "retired_at"),
  };
}

function readOptionalString(row: RuntimeRow, key: string): string | undefined {
  const value = row[key];
  return value === null || value === undefined ? undefined : String(value);
}

// node-pg returns bigint (int8) columns as strings; epoch-ms values are numbers in TS.
function readOptionalNumber(row: RuntimeRow, key: string): number | undefined {
  const value = row[key];
  if (value === null || value === undefined) {
    return undefined;
  }
  return typeof value === "number" ? value : Number(value);
}

class PostgresRuntimePolicyStore implements IRuntimePolicyStore {
  private readonly pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  async get(): Promise<RuntimePolicyRecord | undefined> {
    const result = await this.pool.query<RuntimeRow>("select value, updated_at from runtime_policy where id = 1");
    const row = result.rows[0];
    return row ? readRuntimePolicyRow(row) : undefined;
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
  private readonly scope: TenantScope;

  constructor(pool: Pool, secretCodec: ISecretCodec, scope: TenantScope) {
    this.pool = pool;
    this.secretCodec = secretCodec;
    this.scope = scope;
  }

  async claim(input: IdempotencyClaimInput): Promise<IdempotencyClaimResult> {
    const claim = await runInTransaction(this.pool, async (client) => {
      const sweep = tenantPredicatePg(this.scope, 2);
      await client.query(`delete from idempotency_records where expires_at <= $1 and ${sweep.sql}`, [
        input.now,
        ...sweep.values,
      ]);
      const inserted = await client.query(
        `
          insert into idempotency_records (
            tenant_id, key_hash, claim_id, request_hash, state, response_value, created_at, expires_at
          )
          values ($1, $2, $3, $4, 'in_progress', null, $5, $6)
          on conflict(tenant_id, key_hash) do nothing
          returning key_hash
        `,
        [tenantForInsert(this.scope), input.keyHash, input.claimId, input.requestHash, input.now, input.expiresAt],
      );
      if ((inserted.rowCount ?? 0) > 0) {
        return { kind: "acquired" } as const;
      }

      const t = tenantPredicatePg(this.scope, 2);
      const existing = await client.query<RuntimeRow>(
        `select request_hash, state, response_value from idempotency_records where key_hash = $1 and ${t.sql}`,
        [input.keyHash, ...t.values],
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
          and ${tenantPredicatePg(this.scope, 6).sql}
      `,
      [
        await this.secretCodec.encode(JSON.stringify(input.response)),
        input.expiresAt,
        input.keyHash,
        input.claimId,
        input.requestHash,
        ...tenantPredicatePg(this.scope, 6).values,
      ],
    );
    return (result.rowCount ?? 0) > 0;
  }
}

class PostgresRunLogStore implements IRunLogStore {
  private readonly pool: Pool;
  private readonly limit: number;
  private readonly scope: TenantScope;

  constructor(pool: Pool, limit: number, scope: TenantScope) {
    this.pool = pool;
    this.limit = limit;
    this.scope = scope;
  }

  async add(run: RunLog): Promise<RunLogWriteResult> {
    await this.pool.query(
      `
        insert into runs (id, tenant_id, service, action_id, caller, started_at, completed_at, ok, value)
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
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
        tenantForInsert(this.scope),
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
            where ${tenantPredicatePg(this.scope, 2).sql}
            order by started_at desc, id desc
            offset $1
          )
        `,
        [this.limit, ...tenantPredicatePg(this.scope, 2).values],
      );
      return { retentionApplied: true };
    } catch {
      return { retentionApplied: false };
    }
  }

  async get(id: string): Promise<RunLog | undefined> {
    const t = tenantPredicatePg(this.scope, 2);
    const result = await this.pool.query<RuntimeRow>(`select service, value from runs where id = $1 and ${t.sql}`, [
      id,
      ...t.values,
    ]);
    const row = result.rows[0];
    return row ? readRunLogRow(row) : undefined;
  }

  async list(input: RunLogListInput = {}): Promise<RunLogPage> {
    return listRunLogs(
      input,
      this.limit,
      this.scope,
      (position) => `$${position}`,
      async (sql, values) => (await this.pool.query<RuntimeRow>(sql, values)).rows,
    );
  }
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
