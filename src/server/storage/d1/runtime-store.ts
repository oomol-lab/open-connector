import type { TokenPolicy } from "../../../core/action-policy.ts";
import type {
  IMarketplaceStore,
  ProviderPreference,
  StoredMarketplaceConfig,
} from "../../../marketplace/marketplace-service.ts";
import type { IOAuthClientConfigStore, OAuthClientConfig } from "../../../oauth/oauth-client-config-service.ts";
import type { D1DatabaseBinding } from "../../cloudflare/cloudflare-bindings.ts";
import type { ISecretCodec } from "../../secrets/secret-codec-core.ts";
import type { RequestTransaction } from "../connection-request-store.ts";
import type {
  CompleteIdempotencyInput,
  IdempotencyClaimInput,
  IdempotencyClaimResult,
  IIdempotencyStore,
} from "../idempotency-store.ts";
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

type SecretJsonTable = "oauth_client_configs";

export interface D1RuntimeDatabaseOptions {
  runLimit?: number;
  secretCodec?: ISecretCodec;
}

export class D1RuntimeDatabase implements RuntimeDatabase {
  readonly customMcpStore: CustomMcpStore;
  readonly saasProjectStore: SaasProjectStore;
  readonly connectionRequestStore: ConnectionRequestStore;
  readonly connectionStore: SqlConnectionStore;
  readonly triggerStore: SqlTriggerStore;
  readonly oauthClientConfigStore: D1OAuthClientConfigStore;
  readonly oauthStateStore: SqlOAuthStateStore;
  readonly runtimeTokenStore: D1RuntimeTokenStore;
  readonly runtimePolicyStore: D1RuntimePolicyStore;
  readonly runLogStore: D1RunLogStore;
  readonly idempotencyStore: D1IdempotencyStore;
  readonly marketplaceStore: IMarketplaceStore;
  readonly oauthClientStore: D1OAuthClientStore;
  readonly oauthCodeStore: D1OAuthCodeStore;
  readonly oauthTokenStore: D1OAuthTokenStore;
  readonly oauthSigningKeyStore: D1OAuthSigningKeyStore;

  constructor(database: D1DatabaseBinding, options: D1RuntimeDatabaseOptions = {}) {
    const secretCodec = options.secretCodec ?? new PlainTextSecretCodec();
    const transaction: RequestTransaction = async (statements) => {
      const results = await database.batch(statements.map(({ sql, values }) => database.prepare(sql).bind(...values)));
      return results.map((result) => result.results ?? []);
    };
    this.customMcpStore = new CustomMcpStore(transaction);
    this.connectionRequestStore = new ConnectionRequestStore(transaction, secretCodec);
    this.connectionStore = new SqlConnectionStore(transaction, secretCodec);
    this.triggerStore = new SqlTriggerStore(transaction, secretCodec);
    this.saasProjectStore = new SaasProjectStore(transaction, secretCodec);
    this.oauthClientConfigStore = new D1OAuthClientConfigStore(database, secretCodec);
    this.oauthStateStore = new SqlOAuthStateStore(transaction, secretCodec);
    this.runtimeTokenStore = new D1RuntimeTokenStore(database);
    this.runtimePolicyStore = new D1RuntimePolicyStore(database);
    this.runLogStore = new D1RunLogStore(database, options.runLimit ?? DEFAULT_RUN_LIMIT);
    this.idempotencyStore = new D1IdempotencyStore(database, secretCodec);
    this.marketplaceStore = new D1MarketplaceStore(database);
    this.oauthClientStore = new D1OAuthClientStore(database);
    this.oauthCodeStore = new D1OAuthCodeStore(database);
    this.oauthTokenStore = new D1OAuthTokenStore(database);
    this.oauthSigningKeyStore = new D1OAuthSigningKeyStore(database);
  }
}

class D1MarketplaceStore implements IMarketplaceStore {
  private readonly database: D1DatabaseBinding;

  constructor(database: D1DatabaseBinding) {
    this.database = database;
  }

  async getConfig(): Promise<StoredMarketplaceConfig | undefined> {
    const row = await this.database.prepare("select value from marketplace_config where id = 1").first<RuntimeRow>();
    return row ? parseJson<StoredMarketplaceConfig>(readString(row, "value")) : undefined;
  }

  async setConfig(config: StoredMarketplaceConfig): Promise<void> {
    await this.database
      .prepare(
        "insert into marketplace_config (id, value) values (1, ?) on conflict(id) do update set value = excluded.value",
      )
      .bind(JSON.stringify(config))
      .run();
  }

  async deleteConfig(): Promise<void> {
    await this.database.prepare("delete from marketplace_config where id = 1").run();
  }

  async listProviderPreferences(): Promise<ProviderPreference[]> {
    const { results } = await this.database
      .prepare("select service, enabled, created_at, updated_at from provider_preferences order by service")
      .all<RuntimeRow>();
    return results.map((row) => ({
      service: readString(row, "service"),
      enabled: row.enabled === 1,
      createdAt: readString(row, "created_at"),
      updatedAt: readString(row, "updated_at"),
    }));
  }

  async setProviderPreference(preference: ProviderPreference): Promise<void> {
    await this.database
      .prepare(
        "insert into provider_preferences (service, enabled, created_at, updated_at) values (?, ?, ?, ?) on conflict(service) do update set enabled = excluded.enabled, updated_at = excluded.updated_at",
      )
      .bind(preference.service, preference.enabled ? 1 : 0, preference.createdAt, preference.updatedAt)
      .run();
  }
}

export class D1OAuthClientConfigStore implements IOAuthClientConfigStore {
  private readonly database: D1DatabaseBinding;
  private readonly secretCodec: ISecretCodec;

  constructor(database: D1DatabaseBinding, secretCodec: ISecretCodec) {
    this.database = database;
    this.secretCodec = secretCodec;
  }

  async get(service: string): Promise<OAuthClientConfig | undefined> {
    return await getSecretJson<OAuthClientConfig>(this.database, this.secretCodec, "oauth_client_configs", service);
  }

  async set(config: OAuthClientConfig): Promise<void> {
    await this.database
      .prepare(
        `
        insert into oauth_client_configs (service, value, updated_at)
        values (?, ?, ?)
        on conflict(service) do update set value = excluded.value, updated_at = excluded.updated_at
      `,
      )
      .bind(config.service, await this.secretCodec.encode(JSON.stringify(config)), new Date().toISOString())
      .run();
  }

  async delete(service: string): Promise<void> {
    await this.database.prepare("delete from oauth_client_configs where service = ?").bind(service).run();
  }

  async list(): Promise<OAuthClientConfig[]> {
    const { results } = await this.database
      .prepare("select value from oauth_client_configs order by service")
      .all<RuntimeRow>();
    return await Promise.all(
      results.map(async (row) => parseJson<OAuthClientConfig>(await this.secretCodec.decode(readString(row, "value")))),
    );
  }
}

export class D1RuntimeTokenStore implements IRuntimeTokenStore {
  private readonly database: D1DatabaseBinding;

  constructor(database: D1DatabaseBinding) {
    this.database = database;
  }

  async add(record: RuntimeTokenRecord): Promise<void> {
    await this.database
      .prepare(
        `
        insert into runtime_tokens (
          ${runtimeTokenColumns}
        )
        values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      )
      .bind(
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
      )
      .run();
  }

  async list(): Promise<RuntimeTokenRecord[]> {
    const { results } = await this.database
      .prepare(
        `
        select ${runtimeTokenColumns}
        from runtime_tokens
        order by created_at desc, id desc
      `,
      )
      .all<RuntimeRow>();
    return results.map(readRuntimeTokenRow);
  }

  async hasAny(): Promise<boolean> {
    const row = await this.database.prepare("select 1 from runtime_tokens limit 1").first();
    return row !== null;
  }

  async findByHash(tokenHash: string): Promise<RuntimeTokenRecord | undefined> {
    const row = await this.database
      .prepare(
        `
        select ${runtimeTokenColumns}
        from runtime_tokens
        where token_hash = ?
      `,
      )
      .bind(tokenHash)
      .first<RuntimeRow>();
    return row ? readRuntimeTokenRow(row) : undefined;
  }

  async findById(id: string): Promise<RuntimeTokenRecord | undefined> {
    const row = await this.database
      .prepare(
        `
        select ${runtimeTokenColumns}
        from runtime_tokens
        where id = ?
      `,
      )
      .bind(id)
      .first<RuntimeRow>();
    return row ? readRuntimeTokenRow(row) : undefined;
  }

  async updatePolicy(id: string, policy: TokenPolicy): Promise<RuntimeTokenRecord | undefined> {
    const row = await this.database
      .prepare(
        `
        update runtime_tokens
        set allowed_actions = ?, blocked_actions = ?, allowed_proxies = ?, allowed_connections = ?, allowed_triggers = ?
        where id = ?
        returning ${runtimeTokenColumns}
      `,
      )
      .bind(
        JSON.stringify(policy.allowedActions),
        JSON.stringify(policy.blockedActions),
        JSON.stringify(policy.allowedProxies),
        JSON.stringify(policy.allowedConnections ?? []),
        JSON.stringify(policy.allowedTriggers ?? []),
        id,
      )
      .first<RuntimeRow>();
    return row ? readRuntimeTokenRow(row) : undefined;
  }

  async revoke(id: string): Promise<boolean> {
    const result = await this.database.prepare("delete from runtime_tokens where id = ?").bind(id).run();
    return (result.meta.changes ?? 0) > 0;
  }

  async markUsed(id: string, usedAt: string): Promise<void> {
    await this.database.prepare("update runtime_tokens set last_used_at = ? where id = ?").bind(usedAt, id).run();
  }
}

export class D1OAuthClientStore implements IOAuthClientStore {
  private readonly database: D1DatabaseBinding;

  constructor(database: D1DatabaseBinding) {
    this.database = database;
  }

  async add(record: OAuthClientRecord): Promise<void> {
    await this.database
      .prepare(
        `
        insert into oauth_clients (
          client_id, client_name, registration_type, redirect_uris, scopes,
          token_endpoint_auth_method, client_secret_hash, metadata_document_url, created_at, rotated_at
        )
        values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      )
      .bind(
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
      )
      .run();
  }

  async get(clientId: string): Promise<OAuthClientRecord | undefined> {
    const row = await this.database
      .prepare("select * from oauth_clients where client_id = ?")
      .bind(clientId)
      .first<RuntimeRow>();
    return row ? readOAuthClientRow(row) : undefined;
  }

  async list(): Promise<OAuthClientRecord[]> {
    const { results } = await this.database
      .prepare("select * from oauth_clients order by created_at desc, client_id desc")
      .all<RuntimeRow>();
    return results.map(readOAuthClientRow);
  }

  async update(record: OAuthClientRecord): Promise<void> {
    await this.database
      .prepare(
        `
        update oauth_clients
        set client_name = ?, registration_type = ?, redirect_uris = ?, scopes = ?,
          token_endpoint_auth_method = ?, client_secret_hash = ?, metadata_document_url = ?, rotated_at = ?
        where client_id = ?
      `,
      )
      .bind(
        record.clientName,
        record.registrationType,
        JSON.stringify(record.redirectUris),
        JSON.stringify(record.scopes),
        record.tokenEndpointAuthMethod,
        record.clientSecretHash ?? null,
        record.metadataDocumentUrl ?? null,
        record.rotatedAt ?? null,
        record.clientId,
      )
      .run();
  }

  async delete(clientId: string): Promise<boolean> {
    const result = await this.database.prepare("delete from oauth_clients where client_id = ?").bind(clientId).run();
    return (result.meta.changes ?? 0) > 0;
  }
}

export class D1OAuthCodeStore implements IOAuthCodeStore {
  private readonly database: D1DatabaseBinding;

  constructor(database: D1DatabaseBinding) {
    this.database = database;
  }

  async add(record: OAuthAuthorizationCodeRecord): Promise<void> {
    await this.database
      .prepare(
        `
        insert into oauth_authorization_codes (
          code_hash, client_id, redirect_uri, scope, code_challenge, resource,
          runtime_token_id, issued_at, expires_at, consumed_at
        )
        values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      )
      .bind(
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
      )
      .run();
  }

  async consume(codeHash: string): Promise<OAuthAuthorizationCodeRecord | undefined> {
    // Single conditional UPDATE: atomic single-use even under concurrent exchanges.
    const row = await this.database
      .prepare(
        `
        update oauth_authorization_codes
        set consumed_at = ?
        where code_hash = ?
          and consumed_at is null
          and expires_at > ?
        returning *
      `,
      )
      .bind(Date.now(), codeHash, Date.now())
      .first<RuntimeRow>();
    return row ? readOAuthCodeRow(row) : undefined;
  }

  async listByClient(clientId: string): Promise<OAuthAuthorizationCodeRecord[]> {
    const { results } = await this.database
      .prepare("select * from oauth_authorization_codes where client_id = ?")
      .bind(clientId)
      .all<RuntimeRow>();
    return results.map((row) => readOAuthCodeRow(row));
  }

  async deleteByClient(clientId: string): Promise<void> {
    await this.database.prepare("delete from oauth_authorization_codes where client_id = ?").bind(clientId).run();
  }

  async deleteExpired(nowMs: number): Promise<void> {
    await this.database.prepare("delete from oauth_authorization_codes where expires_at <= ?").bind(nowMs).run();
  }
}

export class D1OAuthTokenStore implements IOAuthTokenStore {
  private readonly database: D1DatabaseBinding;

  constructor(database: D1DatabaseBinding) {
    this.database = database;
  }

  async add(record: OAuthAccessTokenRecord): Promise<void> {
    await this.database
      .prepare(
        `
        insert into oauth_tokens (
          token_hash, refresh_token_hash, client_id, runtime_token_id, scope, resource,
          issued_at, expires_at, refresh_expires_at, revoked_at, refresh_consumed_at
        )
        values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      )
      .bind(
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
      )
      .run();
  }

  async findByAccessTokenHash(tokenHash: string): Promise<OAuthAccessTokenRecord | undefined> {
    const row = await this.database
      .prepare("select * from oauth_tokens where token_hash = ?")
      .bind(tokenHash)
      .first<RuntimeRow>();
    return row ? readOAuthTokenRow(row) : undefined;
  }

  async findByRefreshTokenHash(tokenHash: string): Promise<OAuthAccessTokenRecord | undefined> {
    const row = await this.database
      .prepare("select * from oauth_tokens where refresh_token_hash = ?")
      .bind(tokenHash)
      .first<RuntimeRow>();
    return row ? readOAuthTokenRow(row) : undefined;
  }

  async rotateRefreshToken(
    oldRefreshTokenHash: string,
    successor: OAuthAccessTokenRecord,
  ): Promise<OAuthAccessTokenRecord | undefined> {
    // D1 batches run in a single implicit transaction but cannot branch
    // between statements, so both writes carry the same redeemability guard:
    // the successor is inserted via INSERT ... SELECT ... WHERE EXISTS only
    // when the old refresh token is still redeemable, and the consumption
    // time is stamped by an UPDATE under the same predicate. If the old
    // token was already consumed, revoked, or expired, both statements are
    // no-ops, no successor row appears, and the old token is left untouched.
    const now = Date.now();
    const guard =
      "revoked_at is null and refresh_consumed_at is null and refresh_expires_at is not null and refresh_expires_at > ?";
    const results = await this.database.batch([
      this.database
        .prepare(`select * from oauth_tokens where refresh_token_hash = ? and ${guard}`)
        .bind(oldRefreshTokenHash, now),
      this.database
        .prepare(
          `
          insert into oauth_tokens (
            token_hash, refresh_token_hash, client_id, runtime_token_id, scope, resource,
            issued_at, expires_at, refresh_expires_at, revoked_at
          )
          select ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
          where exists (
            select 1 from oauth_tokens
            where refresh_token_hash = ? and ${guard}
          )
          returning token_hash
        `,
        )
        .bind(
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
          oldRefreshTokenHash,
          now,
        ),
      this.database
        .prepare(`update oauth_tokens set refresh_consumed_at = ? where refresh_token_hash = ? and ${guard}`)
        .bind(now, oldRefreshTokenHash, now),
    ]);
    const row = (results[0]?.results ?? [])[0];
    if (!row) {
      return undefined;
    }
    // The consumed record is read after the batch commits, so it reflects the
    // nulled refresh hash exactly like the transactional backends' RETURNING.
    return this.findByAccessTokenHash(readOAuthTokenRow(row).tokenHash);
  }

  async listByClient(clientId: string): Promise<OAuthAccessTokenRecord[]> {
    const { results } = await this.database
      .prepare("select * from oauth_tokens where client_id = ? order by issued_at, token_hash")
      .bind(clientId)
      .all<RuntimeRow>();
    return results.map(readOAuthTokenRow);
  }

  async revokeByGrant(clientId: string, runtimeTokenId: string): Promise<number> {
    const result = await this.database
      .prepare(
        `
        update oauth_tokens
        set revoked_at = ?
        where client_id = ? and runtime_token_id = ? and revoked_at is null
      `,
      )
      .bind(Date.now(), clientId, runtimeTokenId)
      .run();
    return result.meta.changes ?? 0;
  }

  async deleteExpired(nowMs: number): Promise<void> {
    await this.database
      .prepare(
        `
        delete from oauth_tokens
        where expires_at <= ?
          and (refresh_expires_at is null or refresh_expires_at <= ?)
      `,
      )
      .bind(nowMs, nowMs)
      .run();
  }
}

export class D1OAuthSigningKeyStore implements IOAuthSigningKeyStore {
  private readonly database: D1DatabaseBinding;

  constructor(database: D1DatabaseBinding) {
    this.database = database;
  }

  async add(record: OAuthSigningKeyRecord): Promise<void> {
    await this.database
      .prepare(
        `
        insert into oauth_signing_keys (kid, private_key, public_key, created_at, retired_at)
        values (?, ?, ?, ?, ?)
      `,
      )
      .bind(
        record.kid,
        JSON.stringify(record.privateKeyJwk),
        JSON.stringify(record.publicKeyJwk),
        record.createdAt,
        record.retiredAt ?? null,
      )
      .run();
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
      // A concurrent worker inserted a key with the same primary key first; use theirs.
      const raced = await this.readActive();
      if (raced) {
        return raced;
      }
      throw new Error("Failed to persist a new OAuth signing key.");
    }
    return record;
  }

  async all(): Promise<OAuthSigningKeyRecord[]> {
    const { results } = await this.database
      .prepare("select * from oauth_signing_keys where retired_at is null order by created_at desc, kid desc")
      .all<RuntimeRow>();
    return results.map(readOAuthSigningKeyRow);
  }

  async retire(kid: string): Promise<void> {
    await this.database
      .prepare("update oauth_signing_keys set retired_at = ? where kid = ? and retired_at is null")
      .bind(new Date().toISOString(), kid)
      .run();
  }

  private async readActive(): Promise<OAuthSigningKeyRecord | undefined> {
    const row = await this.database
      .prepare("select * from oauth_signing_keys where retired_at is null order by created_at desc, kid desc")
      .first<RuntimeRow>();
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
    expiresAt: readOptionalNumber(row, "expires_at")!,
    consumedAt: readOptionalNumber(row, "consumed_at"),
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

function readOptionalNumber(row: RuntimeRow, key: string): number | undefined {
  const value = row[key];
  if (value === null || value === undefined) {
    return undefined;
  }
  return typeof value === "number" ? value : Number(value);
}

export class D1RuntimePolicyStore implements IRuntimePolicyStore {
  private readonly database: D1DatabaseBinding;

  constructor(database: D1DatabaseBinding) {
    this.database = database;
  }

  async get(): Promise<RuntimePolicyRecord | undefined> {
    const row = await this.database
      .prepare("select value, updated_at from runtime_policy where id = 1")
      .first<RuntimeRow>();
    return row ? readRuntimePolicyRow(row) : undefined;
  }

  async set(record: RuntimePolicyRecord): Promise<void> {
    await this.database
      .prepare(
        `
        insert into runtime_policy (id, value, updated_at)
        values (1, ?, ?)
        on conflict(id) do update set value = excluded.value, updated_at = excluded.updated_at
      `,
      )
      .bind(JSON.stringify(record.rules), record.updatedAt)
      .run();
  }
}

export class D1IdempotencyStore implements IIdempotencyStore {
  private readonly database: D1DatabaseBinding;
  private readonly secretCodec: ISecretCodec;

  constructor(database: D1DatabaseBinding, secretCodec: ISecretCodec) {
    this.database = database;
    this.secretCodec = secretCodec;
  }

  async claim(input: IdempotencyClaimInput): Promise<IdempotencyClaimResult> {
    // D1 batches run in a single transaction, so the delete, insert, and select
    // behave like the SQLite and PostgreSQL claim, which wrap the same three
    // statements in one transaction. Issued separately, a concurrent claim's
    // expiry sweep can remove the competing row between the insert conflict and
    // the select, and the claim failed with an internal error instead of the
    // stored in_progress, conflict, or completed result.
    const results = await this.database.batch([
      this.database.prepare("delete from idempotency_records where expires_at <= ?").bind(input.now),
      this.database
        .prepare(
          `
          insert into idempotency_records (
            key_hash, claim_id, request_hash, state, response_value, created_at, expires_at
          )
          values (?, ?, ?, 'in_progress', null, ?, ?)
          on conflict(key_hash) do nothing
          returning claim_id
        `,
        )
        .bind(input.keyHash, input.claimId, input.requestHash, input.now, input.expiresAt),
      this.database
        .prepare("select request_hash, state, response_value from idempotency_records where key_hash = ?")
        .bind(input.keyHash),
    ]);

    // Only this claim's insert returns a row; a conflicting insert returns none
    // and leaves the existing record to the select, exactly like the row count
    // the other backends read from their insert.
    if ((results[1]?.results?.length ?? 0) > 0) {
      return { kind: "acquired" };
    }
    const row = results[2]?.results?.[0];
    if (!row) {
      throw new Error("Idempotency record disappeared while claiming it.");
    }
    if (readString(row, "request_hash") !== input.requestHash) {
      return { kind: "conflict" };
    }
    if (readString(row, "state") === "in_progress") {
      return { kind: "in_progress" };
    }

    const response = parseRuntimeActionHttpResult(
      parseJson(await this.secretCodec.decode(readString(row, "response_value"))),
    );
    return { kind: "completed", response };
  }

  async complete(input: CompleteIdempotencyInput): Promise<boolean> {
    const result = await this.database
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
      .bind(
        await this.secretCodec.encode(JSON.stringify(input.response)),
        input.expiresAt,
        input.keyHash,
        input.claimId,
        input.requestHash,
      )
      .run();
    return (result.meta.changes ?? 0) > 0;
  }
}

export class D1RunLogStore implements IRunLogStore {
  private readonly database: D1DatabaseBinding;
  private readonly limit: number;

  constructor(database: D1DatabaseBinding, limit: number) {
    this.database = database;
    this.limit = limit;
  }

  async add(run: RunLog): Promise<RunLogWriteResult> {
    await this.database
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
      .bind(
        run.id,
        run.service,
        run.actionId,
        run.caller,
        run.startedAt,
        run.completedAt,
        run.ok ? 1 : 0,
        JSON.stringify(run),
      )
      .run();

    try {
      await this.database
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
        .bind(this.limit)
        .run();
      return { retentionApplied: true };
    } catch {
      return { retentionApplied: false };
    }
  }

  async get(id: string): Promise<RunLog | undefined> {
    const row = await this.database
      .prepare("select service, value from runs where id = ?")
      .bind(id)
      .first<RuntimeRow>();
    return row ? readRunLogRow(row) : undefined;
  }

  async list(input: RunLogListInput = {}): Promise<RunLogPage> {
    return listRunLogs(
      input,
      this.limit,
      () => "?",
      async (sql, values) => {
        const { results } = await this.database
          .prepare(sql)
          .bind(...values)
          .all<RuntimeRow>();
        return results;
      },
    );
  }
}

async function getSecretJson<T>(
  database: D1DatabaseBinding,
  secretCodec: ISecretCodec,
  table: SecretJsonTable,
  service: string,
): Promise<T | undefined> {
  const row = await database.prepare(`select value from ${table} where service = ?`).bind(service).first<RuntimeRow>();
  return row ? parseJson<T>(await secretCodec.decode(readString(row, "value"))) : undefined;
}
