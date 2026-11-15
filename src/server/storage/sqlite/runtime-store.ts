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
import type { StatementSync } from "node:sqlite";

import { DatabaseSync } from "node:sqlite";
import { instanceScope, tenantForInsert, tenantPredicate, tenantScope } from "../../../tenant/tenant-scope.ts";
import { parseRuntimeActionHttpResult } from "../../api/runtime-api.ts";
import { PlainTextSecretCodec } from "../../secrets/secret-codec-core.ts";
import { ConnectionRequestStore } from "../connection-request-store.ts";
import { SqlConnectionStore } from "../connection-store.ts";
import { CustomMcpStore } from "../custom-mcp-store.ts";
import { defaultMigrationSource } from "../migration-source.ts";
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

type SecretJsonTable = "oauth_client_configs";

export interface SqliteRuntimeDatabaseOptions {
  logger?: RuntimeLogger;
  runLimit?: number;
  secretCodec?: ISecretCodec;
  migrations?: MigrationSource;
  /** Tenant binding for this instance's stores; omitted binds the default tenant. */
  tenantScope?: TenantScope;
  /** Shared handle for sibling tenant views; skips opening and migrating a new file. */
  database?: DatabaseSync;
}

interface RotatedConnectionSecret {
  tenantId: string;
  service: string;
  connectionName: string;
  value: string;
}

interface RotatedServiceSecret {
  tenantId: string;
  service: string;
  value: string;
}

interface RotatedIdempotencySecret {
  tenantId: string;
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
  readonly customMcpStore: CustomMcpStore;
  readonly saasProjectStore: SaasProjectStore;
  readonly connectionRequestStore: ConnectionRequestStore;
  readonly connectionStore: SqlConnectionStore;
  readonly triggerStore: SqlTriggerStore;
  readonly oauthClientConfigStore: SqliteOAuthClientConfigStore;
  readonly oauthStateStore: SqlOAuthStateStore;
  readonly runtimeTokenStore: SqliteRuntimeTokenStore;
  readonly runtimePolicyStore: SqliteRuntimePolicyStore;
  readonly runLogStore: SqliteRunLogStore;
  readonly idempotencyStore: SqliteIdempotencyStore;
  readonly marketplaceStore: SqliteMarketplaceStore;
  readonly oauthClientStore: SqliteOAuthClientStore;
  readonly oauthCodeStore: SqliteOAuthCodeStore;
  readonly oauthTokenStore: SqliteOAuthTokenStore;
  readonly oauthSigningKeyStore: SqliteOAuthSigningKeyStore;

  private readonly database: DatabaseSync;
  private readonly secretCodec: ISecretCodec;
  private readonly filename: string;
  private readonly scope: TenantScope;
  private readonly runLimit: number;
  private readonly ownsDatabase: boolean;

  constructor(filename: string, options: SqliteRuntimeDatabaseOptions = {}) {
    this.filename = filename;
    this.scope = options.tenantScope === undefined ? "local" : options.tenantScope;
    this.runLimit = options.runLimit ?? DEFAULT_RUN_LIMIT;
    this.ownsDatabase = options.database === undefined;
    this.database = options.database ?? new DatabaseSync(filename);
    this.secretCodec = options.secretCodec ?? new PlainTextSecretCodec();
    if (this.ownsDatabase) {
      this.initialize(options.migrations ?? defaultMigrationSource, options.logger);
    }
    const transaction: RequestTransaction = async (statements) =>
      runInTransaction(this.database, () =>
        statements.map(({ sql, values }) => this.database.prepare(sql).all(...values)),
      );
    this.customMcpStore = new CustomMcpStore({
      secretCodec: this.secretCodec,
      transaction,
      read: async (sql, values) => this.database.prepare(sql).all(...(values ?? [])),
      scope: this.scope,
    });
    this.connectionRequestStore = new ConnectionRequestStore(transaction, this.secretCodec, this.scope);
    this.connectionStore = new SqlConnectionStore(transaction, this.secretCodec, this.scope);
    this.triggerStore = new SqlTriggerStore(transaction, this.secretCodec, this.scope);
    this.saasProjectStore = new SaasProjectStore(transaction, this.secretCodec);
    this.oauthClientConfigStore = new SqliteOAuthClientConfigStore(this.database, this.secretCodec, this.scope);
    this.oauthStateStore = new SqlOAuthStateStore(transaction, this.secretCodec, this.scope);
    this.runtimeTokenStore = new SqliteRuntimeTokenStore(this.database, this.scope);
    this.runtimePolicyStore = new SqliteRuntimePolicyStore(this.database);
    this.runLogStore = new SqliteRunLogStore(this.database, this.runLimit, this.scope);
    this.idempotencyStore = new SqliteIdempotencyStore(this.database, this.secretCodec, this.scope);
    this.marketplaceStore = new SqliteMarketplaceStore(this.database, this.scope);
    this.oauthClientStore = new SqliteOAuthClientStore(this.database);
    this.oauthCodeStore = new SqliteOAuthCodeStore(this.database, this.scope);
    this.oauthTokenStore = new SqliteOAuthTokenStore(this.database, this.scope);
    this.oauthSigningKeyStore = new SqliteOAuthSigningKeyStore(this.database);
  }

  /** A sibling view whose stores are bound to one tenant; shares the underlying database file. */
  forTenant(tenantId: string): SqliteRuntimeDatabase {
    return new SqliteRuntimeDatabase(this.filename, {
      secretCodec: this.secretCodec,
      runLimit: this.runLimit,
      tenantScope: tenantScope(tenantId),
      database: this.database,
    });
  }

  /** Cross-tenant view for instance jobs (sweepers, rotation); never from request input. */
  forInstance(): SqliteRuntimeDatabase {
    return new SqliteRuntimeDatabase(this.filename, {
      secretCodec: this.secretCodec,
      runLimit: this.runLimit,
      tenantScope: instanceScope(),
      database: this.database,
    });
  }

  close(): void {
    if (this.ownsDatabase) {
      this.database.close();
    }
  }

  async rotateSecretCodec(nextSecretCodec: ISecretCodec): Promise<void> {
    this.database.exec("begin immediate");
    try {
      const project = this.database.prepare("select value from managed_project where id = 1").get();
      if (project && !nextSecretCodec.encrypted)
        throw new Error("SaaS project configuration requires encrypted storage.");
      const projectValue = project
        ? await nextSecretCodec.encode(await this.secretCodec.decode(readString(project, "value")))
        : undefined;
      const candidates = await Promise.all(
        this.database
          .prepare("select id, candidate_value from connection_requests where candidate_value is not null")
          .all()
          .map(async (row) => ({
            id: readString(row, "id"),
            value: await nextSecretCodec.encode(await this.secretCodec.decode(readString(row, "candidate_value"))),
          })),
      );
      const returnUris = await Promise.all(
        this.database
          .prepare("select id, return_uri from connection_requests where return_uri is not null")
          .all()
          .map(async (row) => ({
            id: readString(row, "id"),
            value: await nextSecretCodec.encode(await this.secretCodec.decode(readString(row, "return_uri"))),
          })),
      );
      const triggerSecrets = await Promise.all(
        this.database
          .prepare("select id, value from trigger_subscriptions")
          .all()
          .map(async (row) => ({
            id: readString(row, "id"),
            value: await nextSecretCodec.encode(await this.secretCodec.decode(readString(row, "value"))),
          })),
      );
      const sourceSecrets = await Promise.all(
        this.database
          .prepare("select tenant_id, id, value from trigger_source_applications")
          .all()
          .map(async (row) => ({
            tenantId: readString(row, "tenant_id"),
            id: readString(row, "id"),
            value: await nextSecretCodec.encode(await this.secretCodec.decode(readString(row, "value"))),
          })),
      );
      const connections = await readRotatedConnectionSecrets(this.database, this.secretCodec, nextSecretCodec);
      const oauthConfigs = await readRotatedServiceSecrets(
        this.database,
        this.secretCodec,
        nextSecretCodec,
        "oauth_client_configs",
      );
      const requestSecrets = await Promise.all(
        this.database
          .prepare("select id, value from connection_requests where value is not null")
          .all()
          .map(async (row) => ({
            id: readString(row, "id"),
            value: await nextSecretCodec.encode(await this.secretCodec.decode(readString(row, "value"))),
          })),
      );
      const oauthStates = await readRotatedStateSecrets(this.database, this.secretCodec, nextSecretCodec);
      const idempotencyResponses = await readRotatedIdempotencySecrets(
        this.database,
        this.secretCodec,
        nextSecretCodec,
      );
      const marketplaceConfig = await this.marketplaceStore.getConfig();
      const rotatedMarketplaceConfig = marketplaceConfig
        ? {
            ...marketplaceConfig,
            apiKeyEncrypted: await nextSecretCodec.encode(
              await this.secretCodec.decode(marketplaceConfig.apiKeyEncrypted),
            ),
          }
        : undefined;
      if (projectValue) this.database.prepare("update managed_project set value = ? where id = 1").run(projectValue);
      for (const candidate of candidates)
        this.database
          .prepare("update connection_requests set candidate_value = ? where id = ?")
          .run(candidate.value, candidate.id);
      for (const uri of returnUris)
        this.database.prepare("update connection_requests set return_uri = ? where id = ?").run(uri.value, uri.id);
      for (const record of triggerSecrets)
        this.database.prepare("update trigger_subscriptions set value = ? where id = ?").run(record.value, record.id);
      for (const record of sourceSecrets)
        this.database
          .prepare("update trigger_source_applications set value = ? where tenant_id = ? and id = ?")
          .run(record.value, record.tenantId, record.id);
      writeRotatedConnectionSecrets(this.database, connections);
      writeRotatedServiceSecrets(this.database, "oauth_client_configs", oauthConfigs);
      writeRotatedStateSecrets(this.database, oauthStates);
      for (const request of requestSecrets)
        this.database
          .prepare("update connection_requests set value = ? where id = ? and value is not null")
          .run(request.value, request.id);
      writeRotatedIdempotencySecrets(this.database, idempotencyResponses);
      if (rotatedMarketplaceConfig) {
        this.database
          .prepare("update marketplace_config set value = ? where id = 1")
          .run(JSON.stringify(rotatedMarketplaceConfig));
      }
      this.database.exec("commit");
    } catch (error) {
      this.database.exec("rollback");
      throw error;
    }
  }

  resetRuntimeData(): void {
    runInTransaction(this.database, () => {
      this.database.prepare("update connection_retirements set generation = ?").run(crypto.randomUUID());
      this.database.exec(`
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

  private initialize(migrations: MigrationSource, logger?: RuntimeLogger): void {
    this.database.exec("pragma journal_mode = wal;");
    runSqliteMigrations(this.database, migrations, logger);
  }
}

export class SqliteMarketplaceStore implements IMarketplaceStore {
  private readonly database: DatabaseSync;
  private readonly scope: TenantScope;

  constructor(database: DatabaseSync, scope: TenantScope) {
    this.database = database;
    this.scope = scope;
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
    const t = tenantPredicate(this.scope);
    return this.database
      .prepare(
        `select service, enabled, created_at, updated_at from provider_preferences where ${t.sql} order by service`,
      )
      .all(...t.values)
      .map((row) => ({
        service: readString(row, "service"),
        enabled: row.enabled === 1,
        createdAt: readString(row, "created_at"),
        updatedAt: readString(row, "updated_at"),
      }));
  }

  async setProviderPreference(preference: ProviderPreference): Promise<void> {
    this.database
      .prepare(
        "insert into provider_preferences (tenant_id, service, enabled, created_at, updated_at) values (?, ?, ?, ?, ?) on conflict(tenant_id, service) do update set enabled = excluded.enabled, updated_at = excluded.updated_at",
      )
      .run(
        tenantForInsert(this.scope),
        preference.service,
        preference.enabled ? 1 : 0,
        preference.createdAt,
        preference.updatedAt,
      );
  }
}

export class SqliteOAuthClientConfigStore implements IOAuthClientConfigStore {
  private readonly database: DatabaseSync;
  private readonly secretCodec: ISecretCodec;
  private readonly scope: TenantScope;

  constructor(database: DatabaseSync, secretCodec: ISecretCodec, scope: TenantScope) {
    this.database = database;
    this.secretCodec = secretCodec;
    this.scope = scope;
  }

  async get(service: string): Promise<OAuthClientConfig | undefined> {
    const t = tenantPredicate(this.scope);
    const row = this.database
      .prepare(`select value from oauth_client_configs where service = ? and ${t.sql}`)
      .get(service, ...t.values);
    return row ? parseJson<OAuthClientConfig>(await this.secretCodec.decode(readString(row, "value"))) : undefined;
  }

  async set(config: OAuthClientConfig): Promise<void> {
    const value = await this.secretCodec.encode(JSON.stringify(config));
    this.database
      .prepare(
        `insert into oauth_client_configs (tenant_id, service, value, updated_at)
        values (?, ?, ?, ?)
        on conflict(tenant_id, service) do update set value = excluded.value, updated_at = excluded.updated_at`,
      )
      .run(tenantForInsert(this.scope), config.service, value, new Date().toISOString());
  }

  async delete(service: string): Promise<void> {
    const t = tenantPredicate(this.scope);
    this.database.prepare(`delete from oauth_client_configs where service = ? and ${t.sql}`).run(service, ...t.values);
  }

  async list(): Promise<OAuthClientConfig[]> {
    const t = tenantPredicate(this.scope);
    const rows = this.database
      .prepare(`select value from oauth_client_configs where ${t.sql} order by service`)
      .all(...t.values);
    return await Promise.all(
      rows.map(async (row) => parseJson<OAuthClientConfig>(await this.secretCodec.decode(readString(row, "value")))),
    );
  }
}

export class SqliteRuntimeTokenStore implements IRuntimeTokenStore {
  private readonly database: DatabaseSync;
  private readonly scope: TenantScope;
  private hasAnyStatement?: StatementSync;
  private findByHashStatement?: StatementSync;
  private markUsedStatement?: StatementSync;

  constructor(database: DatabaseSync, scope: TenantScope) {
    this.database = database;
    this.scope = scope;
  }

  async add(record: RuntimeTokenRecord): Promise<void> {
    this.database
      .prepare(
        `
        insert into runtime_tokens (
          tenant_id, ${runtimeTokenColumns}
        )
        values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      )
      .run(
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
      );
  }

  async list(): Promise<RuntimeTokenRecord[]> {
    return this.database
      .prepare(
        `
        select tenant_id, ${runtimeTokenColumns}
        from runtime_tokens
        where ${tenantPredicate(this.scope).sql}
        order by created_at desc, id desc
      `,
      )
      .all(...tenantPredicate(this.scope).values)
      .map(readRuntimeTokenRow);
  }

  async hasAny(): Promise<boolean> {
    this.hasAnyStatement ??= this.database.prepare(
      `select 1 from runtime_tokens where ${tenantPredicate(this.scope).sql} limit 1`,
    );
    return this.hasAnyStatement.get(...tenantPredicate(this.scope).values) !== undefined;
  }

  async findByHash(tokenHash: string): Promise<RuntimeTokenRecord | undefined> {
    // Custom migration sources may omit this table until the store is actually used.
    this.findByHashStatement ??= this.database.prepare(`
      select tenant_id, ${runtimeTokenColumns}
      from runtime_tokens
      where token_hash = ? and ${tenantPredicate(this.scope).sql}
    `);
    const row = this.findByHashStatement.get(tokenHash, ...tenantPredicate(this.scope).values);
    return row ? readRuntimeTokenRow(row) : undefined;
  }

  async findById(id: string): Promise<RuntimeTokenRecord | undefined> {
    const row = this.database
      .prepare(
        `
        select tenant_id, ${runtimeTokenColumns}
        from runtime_tokens
        where id = ? and ${tenantPredicate(this.scope).sql}
      `,
      )
      .get(id, ...tenantPredicate(this.scope).values);
    return row ? readRuntimeTokenRow(row) : undefined;
  }

  async updatePolicy(id: string, policy: TokenPolicy): Promise<RuntimeTokenRecord | undefined> {
    const row = this.database
      .prepare(
        `
        update runtime_tokens
        set allowed_actions = ?, blocked_actions = ?, allowed_proxies = ?, allowed_connections = ?, allowed_triggers = ?
        where id = ? and ${tenantPredicate(this.scope).sql}
        returning tenant_id, ${runtimeTokenColumns}
      `,
      )
      .get(
        JSON.stringify(policy.allowedActions),
        JSON.stringify(policy.blockedActions),
        JSON.stringify(policy.allowedProxies),
        JSON.stringify(policy.allowedConnections ?? []),
        JSON.stringify(policy.allowedTriggers ?? []),
        id,
        ...tenantPredicate(this.scope).values,
      );
    return row ? readRuntimeTokenRow(row) : undefined;
  }

  async revoke(id: string): Promise<boolean> {
    const t = tenantPredicate(this.scope);
    const result = this.database.prepare(`delete from runtime_tokens where id = ? and ${t.sql}`).run(id, ...t.values);
    return result.changes > 0;
  }

  async markUsed(id: string, usedAt: string): Promise<void> {
    this.markUsedStatement ??= this.database.prepare(
      `update runtime_tokens set last_used_at = ? where id = ? and ${tenantPredicate(this.scope).sql}`,
    );
    this.markUsedStatement.run(usedAt, id, ...tenantPredicate(this.scope).values);
  }
}

export class SqliteOAuthClientStore implements IOAuthClientStore {
  private readonly database: DatabaseSync;

  constructor(database: DatabaseSync) {
    this.database = database;
  }

  async add(record: OAuthClientRecord): Promise<void> {
    this.database
      .prepare(
        `
        insert into oauth_clients (
          client_id, client_name, registration_type, redirect_uris, scopes,
          token_endpoint_auth_method, client_secret_hash, metadata_document_url, created_at, rotated_at
        )
        values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      )
      .run(
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
      );
  }

  async get(clientId: string): Promise<OAuthClientRecord | undefined> {
    const row = this.database.prepare("select * from oauth_clients where client_id = ?").get(clientId);
    return row ? readOAuthClientRow(row) : undefined;
  }

  async list(): Promise<OAuthClientRecord[]> {
    return this.database
      .prepare("select * from oauth_clients order by created_at desc, client_id desc")
      .all()
      .map(readOAuthClientRow);
  }

  async update(record: OAuthClientRecord): Promise<void> {
    this.database
      .prepare(
        `
        update oauth_clients
        set client_name = ?, registration_type = ?, redirect_uris = ?, scopes = ?,
          token_endpoint_auth_method = ?, client_secret_hash = ?, metadata_document_url = ?, rotated_at = ?
        where client_id = ?
      `,
      )
      .run(
        record.clientName,
        record.registrationType,
        JSON.stringify(record.redirectUris),
        JSON.stringify(record.scopes),
        record.tokenEndpointAuthMethod,
        record.clientSecretHash ?? null,
        record.metadataDocumentUrl ?? null,
        record.rotatedAt ?? null,
        record.clientId,
      );
  }

  async delete(clientId: string): Promise<boolean> {
    const result = this.database.prepare("delete from oauth_clients where client_id = ?").run(clientId);
    return result.changes > 0;
  }
}

export class SqliteOAuthCodeStore implements IOAuthCodeStore {
  private readonly database: DatabaseSync;
  private readonly scope: TenantScope;

  constructor(database: DatabaseSync, scope: TenantScope) {
    this.database = database;
    this.scope = scope;
  }

  async add(record: OAuthAuthorizationCodeRecord): Promise<void> {
    this.database
      .prepare(
        `
        insert into oauth_authorization_codes (
          tenant_id, code_hash, client_id, redirect_uri, scope, code_challenge, resource,
          runtime_token_id, issued_at, expires_at, consumed_at
        )
        values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      )
      .run(
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
      );
  }

  async consume(codeHash: string): Promise<OAuthAuthorizationCodeRecord | undefined> {
    return runInTransaction(this.database, () => {
      const now = Date.now();
      const row = this.database
        .prepare(`select * from oauth_authorization_codes where code_hash = ? and ${tenantPredicate(this.scope).sql}`)
        .get(codeHash, ...tenantPredicate(this.scope).values);
      if (!row) {
        return undefined;
      }
      const record = readOAuthCodeRow(row);
      if (record.consumedAt !== undefined || record.expiresAt <= now) {
        return undefined;
      }
      const consumedAt = Date.now();
      this.database
        .prepare(
          `update oauth_authorization_codes set consumed_at = ? where code_hash = ? and ${tenantPredicate(this.scope).sql}`,
        )
        .run(consumedAt, codeHash, ...tenantPredicate(this.scope).values);
      return { ...record, consumedAt };
    });
  }

  async listByClient(clientId: string): Promise<OAuthAuthorizationCodeRecord[]> {
    const t = tenantPredicate(this.scope);
    const rows = this.database
      .prepare(`select * from oauth_authorization_codes where client_id = ? and ${t.sql}`)
      .all(clientId, ...t.values);
    return rows.map((row) => readOAuthCodeRow(row));
  }

  async deleteByClient(clientId: string): Promise<void> {
    const t = tenantPredicate(this.scope);
    this.database
      .prepare(`delete from oauth_authorization_codes where client_id = ? and ${t.sql}`)
      .run(clientId, ...t.values);
  }

  async deleteExpired(nowMs: number): Promise<void> {
    const t = tenantPredicate(this.scope);
    this.database
      .prepare(`delete from oauth_authorization_codes where expires_at <= ? and ${t.sql}`)
      .run(nowMs, ...t.values);
  }
}

export class SqliteOAuthTokenStore implements IOAuthTokenStore {
  private readonly database: DatabaseSync;
  private readonly scope: TenantScope;

  constructor(database: DatabaseSync, scope: TenantScope) {
    this.database = database;
    this.scope = scope;
  }

  async add(record: OAuthAccessTokenRecord): Promise<void> {
    this.insert(record);
  }

  private insert(record: OAuthAccessTokenRecord): void {
    this.database
      .prepare(
        `
        insert into oauth_tokens (
          tenant_id, token_hash, refresh_token_hash, client_id, runtime_token_id, scope, resource,
          issued_at, expires_at, refresh_expires_at, revoked_at, refresh_consumed_at
        )
        values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      )
      .run(
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
      );
  }

  async findByAccessTokenHash(tokenHash: string): Promise<OAuthAccessTokenRecord | undefined> {
    const row = this.database
      .prepare(`select * from oauth_tokens where token_hash = ? and ${tenantPredicate(this.scope).sql}`)
      .get(tokenHash, ...tenantPredicate(this.scope).values);
    return row ? readOAuthTokenRow(row) : undefined;
  }

  async findByRefreshTokenHash(tokenHash: string): Promise<OAuthAccessTokenRecord | undefined> {
    const row = this.database
      .prepare(`select * from oauth_tokens where refresh_token_hash = ? and ${tenantPredicate(this.scope).sql}`)
      .get(tokenHash, ...tenantPredicate(this.scope).values);
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
    return runInTransaction(this.database, () => {
      const rows = this.database
        .prepare(
          `
          update oauth_tokens
          set refresh_consumed_at = ?
          where refresh_token_hash = ?
            and revoked_at is null
            and refresh_consumed_at is null
            and refresh_expires_at is not null
            and refresh_expires_at > ?
            and ${tenantPredicate(this.scope).sql}
          returning *
        `,
        )
        .all(Date.now(), oldRefreshTokenHash, Date.now(), ...tenantPredicate(this.scope).values);
      const row = rows[0];
      if (!row) {
        return undefined;
      }
      this.insert(successor);
      return readOAuthTokenRow(row);
    });
  }

  async listByClient(clientId: string): Promise<OAuthAccessTokenRecord[]> {
    return this.database
      .prepare(
        `select * from oauth_tokens where client_id = ? and ${tenantPredicate(this.scope).sql} order by issued_at, token_hash`,
      )
      .all(clientId, ...tenantPredicate(this.scope).values)
      .map(readOAuthTokenRow);
  }

  async revokeByGrant(clientId: string, runtimeTokenId: string): Promise<number> {
    const result = this.database
      .prepare(
        `
        update oauth_tokens
        set revoked_at = ?
        where client_id = ? and runtime_token_id = ? and revoked_at is null and ${tenantPredicate(this.scope).sql}
      `,
      )
      .run(Date.now(), clientId, runtimeTokenId, ...tenantPredicate(this.scope).values);
    return Number(result.changes);
  }

  async deleteExpired(nowMs: number): Promise<void> {
    this.database
      .prepare(
        `
        delete from oauth_tokens
        where expires_at <= ?
          and (refresh_expires_at is null or refresh_expires_at <= ?)
          and ${tenantPredicate(this.scope).sql}
      `,
      )
      .run(nowMs, nowMs, ...tenantPredicate(this.scope).values);
  }
}

export class SqliteOAuthSigningKeyStore implements IOAuthSigningKeyStore {
  private readonly database: DatabaseSync;

  constructor(database: DatabaseSync) {
    this.database = database;
  }

  async add(record: OAuthSigningKeyRecord): Promise<void> {
    this.database
      .prepare(
        `
        insert into oauth_signing_keys (kid, private_key, public_key, created_at, retired_at)
        values (?, ?, ?, ?, ?)
      `,
      )
      .run(
        record.kid,
        JSON.stringify(record.privateKeyJwk),
        JSON.stringify(record.publicKeyJwk),
        record.createdAt,
        record.retiredAt ?? null,
      );
  }

  async active(): Promise<OAuthSigningKeyRecord> {
    const existing = this.readActive();
    if (existing) {
      return existing;
    }
    const record = await generateSigningKeyRecord();
    try {
      await this.add(record);
    } catch {
      // A concurrent process inserted a key with the same primary key first; use theirs.
      const raced = this.readActive();
      if (raced) {
        return raced;
      }
      throw new Error("Failed to persist a new OAuth signing key.");
    }
    return record;
  }

  async all(): Promise<OAuthSigningKeyRecord[]> {
    return this.database
      .prepare("select * from oauth_signing_keys where retired_at is null order by created_at desc, kid desc")
      .all()
      .map(readOAuthSigningKeyRow);
  }

  async retire(kid: string): Promise<void> {
    this.database
      .prepare("update oauth_signing_keys set retired_at = ? where kid = ? and retired_at is null")
      .run(new Date().toISOString(), kid);
  }

  private readActive(): OAuthSigningKeyRecord | undefined {
    const row = this.database
      .prepare("select * from oauth_signing_keys where retired_at is null order by created_at desc, kid desc")
      .get();
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
    codeHash: readString(row, "code_hash"),
    clientId: readString(row, "client_id"),
    redirectUri: readString(row, "redirect_uri"),
    scope: readString(row, "scope"),
    codeChallenge: readOptionalString(row, "code_challenge"),
    resource: readOptionalString(row, "resource"),
    runtimeTokenId: readString(row, "runtime_token_id"),
    issuedAt: readString(row, "issued_at"),
    expiresAt: Number(row.expires_at),
    consumedAt: row.consumed_at === null || row.consumed_at === undefined ? undefined : Number(row.consumed_at),
  };
}

function readOAuthTokenRow(row: RuntimeRow): OAuthAccessTokenRecord {
  return {
    tokenHash: readString(row, "token_hash"),
    refreshTokenHash: readOptionalString(row, "refresh_token_hash"),
    clientId: readString(row, "client_id"),
    runtimeTokenId: readString(row, "runtime_token_id"),
    scope: readString(row, "scope"),
    resource: readOptionalString(row, "resource"),
    issuedAt: readString(row, "issued_at"),
    expiresAt: Number(row.expires_at),
    refreshExpiresAt:
      row.refresh_expires_at === null || row.refresh_expires_at === undefined
        ? undefined
        : Number(row.refresh_expires_at),
    revokedAt: row.revoked_at === null || row.revoked_at === undefined ? undefined : Number(row.revoked_at),
    refreshConsumedAt:
      row.refresh_consumed_at === null || row.refresh_consumed_at === undefined
        ? undefined
        : Number(row.refresh_consumed_at),
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

export class SqliteRuntimePolicyStore implements IRuntimePolicyStore {
  private readonly database: DatabaseSync;

  constructor(database: DatabaseSync) {
    this.database = database;
  }

  async get(): Promise<RuntimePolicyRecord | undefined> {
    const row = this.database.prepare("select value, updated_at from runtime_policy where id = 1").get();
    return row ? readRuntimePolicyRow(row) : undefined;
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
  private readonly scope: TenantScope;

  constructor(database: DatabaseSync, secretCodec: ISecretCodec, scope: TenantScope) {
    this.database = database;
    this.secretCodec = secretCodec;
    this.scope = scope;
  }

  async claim(input: IdempotencyClaimInput): Promise<IdempotencyClaimResult> {
    const t = tenantPredicate(this.scope);
    const claim = runInTransaction(this.database, () => {
      this.database
        .prepare(`delete from idempotency_records where expires_at <= ? and ${t.sql}`)
        .run(input.now, ...t.values);
      const inserted = this.database
        .prepare(
          `
          insert into idempotency_records (
            tenant_id, key_hash, claim_id, request_hash, state, response_value, created_at, expires_at
          )
          values (?, ?, ?, ?, 'in_progress', null, ?, ?)
          on conflict(tenant_id, key_hash) do nothing
        `,
        )
        .run(tenantForInsert(this.scope), input.keyHash, input.claimId, input.requestHash, input.now, input.expiresAt);

      if (inserted.changes > 0) {
        return { kind: "acquired" } as const;
      }

      const row = this.database
        .prepare(
          `
          select request_hash, state, response_value
          from idempotency_records
          where key_hash = ? and ${t.sql}
        `,
        )
        .get(input.keyHash, ...t.values);
      if (!row) {
        throw new Error("Idempotency record disappeared while claiming it.");
      }
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
    const t = tenantPredicate(this.scope);
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
          and ${t.sql}
      `,
      )
      .run(responseValue, input.expiresAt, input.keyHash, input.claimId, input.requestHash, ...t.values);
    return result.changes > 0;
  }
}

export class SqliteRunLogStore implements IRunLogStore {
  private readonly database: DatabaseSync;
  private readonly limit: number;
  private readonly scope: TenantScope;

  constructor(database: DatabaseSync, limit: number, scope: TenantScope) {
    this.database = database;
    this.limit = limit;
    this.scope = scope;
  }

  async add(run: RunLog): Promise<RunLogWriteResult> {
    insertRun(this.database, run, tenantForInsert(this.scope));

    try {
      const t = tenantPredicate(this.scope);
      this.database
        .prepare(
          `
          delete from runs
          where id in (
            select id from runs where ${t.sql}
            order by started_at desc, id desc
            limit -1 offset ?
          )
        `,
        )
        .run(...t.values, this.limit);
      return { retentionApplied: true };
    } catch {
      return { retentionApplied: false };
    }
  }

  async get(id: string): Promise<RunLog | undefined> {
    const t = tenantPredicate(this.scope);
    const row = this.database.prepare(`select service, value from runs where id = ? and ${t.sql}`).get(id, ...t.values);
    return row ? readRunLogRow(row) : undefined;
  }

  async list(input: RunLogListInput = {}): Promise<RunLogPage> {
    return listRunLogs(
      input,
      this.limit,
      this.scope,
      () => "?",
      (sql, values) => this.database.prepare(sql).all(...values),
    );
  }
}

function insertRun(database: DatabaseSync, run: RunLog, tenantId: string): void {
  database
    .prepare(
      `
      insert into runs (id, tenant_id, service, action_id, caller, started_at, completed_at, ok, value)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      tenantId,
      run.service,
      run.actionId,
      run.caller,
      run.startedAt,
      run.completedAt,
      run.ok ? 1 : 0,
      JSON.stringify(run),
    );
}

function runSqliteMigrations(database: DatabaseSync, migrations: MigrationSource, logger?: RuntimeLogger): void {
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
  const migrationFiles = migrations.readMigrations("sqlite");
  let newlyAppliedCount = 0;

  for (const migration of migrationFiles) {
    if (applied.has(migration.name)) {
      continue;
    }

    const migrationStartedAt = Date.now();
    logger?.info({ migration: migration.name }, "sqlite migration started");
    try {
      runInTransaction(database, () => {
        database.exec(migration.sql);
        database
          .prepare("insert into runtime_migrations (name, applied_at) values (?, ?)")
          .run(migration.name, new Date().toISOString());
      });
    } catch (error) {
      logger?.error(
        { migration: migration.name, durationMs: Date.now() - migrationStartedAt, err: error },
        "sqlite migration failed",
      );
      throw error;
    }
    applied.add(migration.name);
    newlyAppliedCount += 1;
    logger?.info(
      { migration: migration.name, durationMs: Date.now() - migrationStartedAt },
      "sqlite migration completed",
    );
  }

  logger?.info(
    {
      migrationCount: migrationFiles.length,
      appliedCount: migrationFiles.filter((migration) => applied.has(migration.name)).length,
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
  const rows = database.prepare("select tenant_id, service, connection_name, value from connections").all();
  return await Promise.all(
    rows.map(async (row) => ({
      tenantId: readString(row, "tenant_id"),
      service: readString(row, "service"),
      connectionName: readString(row, "connection_name"),
      value: await nextCodec.encode(await currentCodec.decode(readString(row, "value"))),
    })),
  );
}

function writeRotatedConnectionSecrets(database: DatabaseSync, connections: RotatedConnectionSecret[]): void {
  const statement = database.prepare(
    "update connections set value = ? where tenant_id = ? and service = ? and connection_name = ?",
  );
  for (const connection of connections) {
    statement.run(connection.value, connection.tenantId, connection.service, connection.connectionName);
  }
}

async function readRotatedServiceSecrets(
  database: DatabaseSync,
  currentCodec: ISecretCodec,
  nextCodec: ISecretCodec,
  table: SecretJsonTable,
): Promise<RotatedServiceSecret[]> {
  const rows = database.prepare(`select tenant_id, service, value from ${table}`).all();
  return await Promise.all(
    rows.map(async (row) => ({
      tenantId: readString(row, "tenant_id"),
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
  const statement = database.prepare(`update ${table} set value = ? where tenant_id = ? and service = ?`);
  for (const service of services) {
    statement.run(service.value, service.tenantId, service.service);
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
    .prepare("select tenant_id, key_hash, response_value from idempotency_records where response_value is not null")
    .all();
  return await Promise.all(
    rows.map(async (row) => ({
      tenantId: readString(row, "tenant_id"),
      keyHash: readString(row, "key_hash"),
      value: await nextCodec.encode(await currentCodec.decode(readString(row, "response_value"))),
    })),
  );
}

function writeRotatedIdempotencySecrets(database: DatabaseSync, responses: RotatedIdempotencySecret[]): void {
  const statement = database.prepare(
    "update idempotency_records set response_value = ? where tenant_id = ? and key_hash = ?",
  );
  for (const response of responses) {
    statement.run(response.value, response.tenantId, response.keyHash);
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
