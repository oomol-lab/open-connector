import type { StoredConnection, StoredSaasConnection } from "../../connection-store.ts";
import type { ResolvedCredential } from "../../core/types.ts";
import type { OAuthAuthorizationState } from "../../oauth/oauth-flow-service.ts";
import type { TenantScope } from "../../tenant/tenant-scope.ts";
import type { ISecretCodec } from "../secrets/secret-codec-core.ts";
import type { RuntimeRow } from "./runtime-sql.ts";

import { tenantForInsert, tenantPredicate } from "../../tenant/tenant-scope.ts";
import { initializeRetirement, lockRetirement, retirementMatches } from "./connection-retirement.ts";
import { queueSaasConnections, queueSaasRequests } from "./saas-project-store.ts";

export interface ConnectionRequest {
  connectionRequestId: string;
  service: string;
  status: "initiated" | "connected" | "failed" | "expired";
  appId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  expiresAt: string;
  createdAt: number;
  updatedAt: number;
}

export interface PendingConnectionRequest extends OAuthAuthorizationState {
  connectionName: string;
  connectionRequestId: string;
  owner: string;
  expiresAt: string;
  returnUri?: string;
  target?: Pick<StoredConnection, "id" | "revision">;
}

export interface RequestStatement {
  sql: string;
  values: (string | number | null)[];
}

export interface PendingSaasRequest {
  connectionRequestId: string;
  connectionId: string;
  owner: string;
  service: string;
  connectionName: string;
  managedProjectId: string;
  providerConfigId: string;
  externalUserId: string;
  createdAt: string;
  expiresAt: string;
  returnUri?: string;
  target?: Pick<StoredConnection, "id" | "revision">;
  comment?: string | null;
}

export interface SaasRequestLease {
  pending: PendingSaasRequest;
  leaseId: string;
  phase: "creating" | "pending" | "candidate";
  remoteRequestId: string | null;
  candidate?: SaasCandidate;
  pollAttempts: number;
}

export interface SaasCandidate {
  connectedAccountId: string;
  profile: StoredSaasConnection["profile"];
  status: StoredSaasConnection["status"];
  comment: string | null;
}

/** Executes all statements atomically; each result contains its RETURNING/SELECT rows. */
export type RequestTransaction = (statements: RequestStatement[]) => Promise<RuntimeRow[][]>;

/** Shared SQL lifecycle for SQLite, PostgreSQL and D1. Secrets use the runtime's codec. */
export class ConnectionRequestStore {
  private readonly transaction: RequestTransaction;
  private readonly secretCodec: ISecretCodec;
  private readonly scope: TenantScope;

  constructor(transaction: RequestTransaction, secretCodec: ISecretCodec, scope: TenantScope) {
    this.transaction = transaction;
    this.secretCodec = secretCodec;
    this.scope = scope;
  }

  async create(pending: PendingConnectionRequest): Promise<void> {
    const now = Date.parse(pending.createdAt);
    const value = await this.secretCodec.encode(JSON.stringify(pending));
    const fence = retirementMatches(this.scope, pending.service, pending.connectionName, pending.retirementGeneration);
    await this.transaction([
      initializeRetirement(this.scope, pending.service, pending.connectionName, pending.retirementGeneration),
      lockRetirement(this.scope, pending.service, pending.connectionName, pending.retirementGeneration),
      ...this.retireRequests(pending.owner, pending.service, now, fence),
      {
        sql: `insert into connection_requests (id, owner, tenant_id, service, state, phase, status, value, expires_at, created_at, updated_at, connection_name)
          select ?, ?, ?, ?, ?, 'pending', 'initiated', ?, ?, ?, ?, ? where ${fence.sql}`,
        values: [
          pending.connectionRequestId,
          pending.owner,
          tenantForInsert(this.scope),
          pending.service,
          pending.state,
          value,
          pending.expiresAt,
          now,
          now,
          pending.connectionName,
          ...fence.values,
        ],
      },
    ]);
  }

  async get(id: string, owner: string): Promise<ConnectionRequest | undefined> {
    const t = tenantPredicate(this.scope);
    const now = Date.now();
    const [[row]] = await this.transaction([
      {
        sql: `select id, service, status, app_id, error_code, error_message, expires_at, created_at, updated_at from connection_requests
          where id = ? and owner = ? and expires_at > ? and ${t.sql}`,
        values: [id, owner, new Date(now - 86_400_000).toISOString(), ...t.values],
      },
    ]);
    if (!row) return undefined;
    return {
      connectionRequestId: row.id as string,
      service: row.service as string,
      status:
        row.status === "initiated" && Date.parse(row.expires_at as string) <= now
          ? "expired"
          : (row.status as ConnectionRequest["status"]),
      appId: row.app_id as string | null,
      errorCode: row.error_code as string | null,
      errorMessage: row.error_message as string | null,
      expiresAt: row.expires_at as string,
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at),
    };
  }

  async claim(state: string): Promise<PendingConnectionRequest | undefined> {
    const t = tenantPredicate(this.scope);
    const [[row]] = await this.transaction([
      {
        sql: `update connection_requests set phase = 'processing', updated_at = ? where kind = 'local' and state = ? and phase = 'pending' and expires_at > ? and ${t.sql} returning value`,
        values: [Date.now(), state, new Date().toISOString(), ...t.values],
      },
    ]);
    return row
      ? (JSON.parse(await this.secretCodec.decode(row.value as string)) as PendingConnectionRequest)
      : undefined;
  }

  async fail(id: string, errorCode: string, errorMessage: string): Promise<void> {
    const t = tenantPredicate(this.scope);
    await this.transaction([
      {
        sql: `update connection_requests set phase = 'completed', status = 'failed', error_code = ?, error_message = ?, value = null, updated_at = ?
        where kind = 'local' and id = ? and phase = 'processing' and ${t.sql}`,
        values: [errorCode, errorMessage, Date.now(), id, ...t.values],
      },
    ]);
  }

  async complete(
    pending: PendingConnectionRequest,
    credential: ResolvedCredential,
    signal?: AbortSignal,
  ): Promise<string | undefined> {
    const t = tenantPredicate(this.scope);
    const id = pending.target?.id ?? crypto.randomUUID();
    const revision = crypto.randomUUID();
    const value = await this.secretCodec.encode(JSON.stringify(credential));
    const accountId =
      credential.authType !== "no_auth" && credential.metadata.providerAccountVerified === true
        ? credential.profile.accountId
        : null;
    signal?.throwIfAborted();
    const now = new Date();
    const fence = retirementMatches(this.scope, pending.service, pending.connectionName, pending.retirementGeneration);
    const active = `exists (select 1 from connection_requests where kind = 'local' and id = ? and phase = 'processing' and ${t.sql}) and ${fence.sql}`;
    const activeValues = [pending.connectionRequestId, ...t.values, ...fence.values];
    const write: RequestStatement = pending.target
      ? {
          sql: `update connections set value = ?, revision = ?, updated_at = ?, source = 'local',
            managed_project_id = null, provider_config_id = null, external_user_id = null, remote_account_id = null, local_request_id = null, provider_account_id = ? where ${t.sql} and id = ? and revision = ? and ${active}
            and (not exists (select 1 from trigger_subscriptions where connection_id = connections.id and mode <> 'resource-set' and status in ('active', 'deleting'))
              or (provider_account_id is not null and provider_account_id = ?)) returning id`,
          values: [
            value,
            revision,
            now.toISOString(),
            accountId,
            ...t.values,
            id,
            pending.target.revision,
            ...activeValues,
            accountId,
          ],
        }
      : {
          sql: `insert into connections (id, revision, tenant_id, service, connection_name, value, updated_at, provider_account_id)
        select ?, ?, ?, ?, ?, ?, ?, ? where ${active} returning id`,
          values: [
            id,
            revision,
            tenantForInsert(this.scope),
            pending.service,
            pending.connectionName,
            value,
            now.toISOString(),
            accountId,
            ...activeValues,
          ],
        };
    const results = await this.transaction([
      lockRetirement(this.scope, pending.service, pending.connectionName, pending.retirementGeneration),
      { sql: `update connections set revision = revision where ${t.sql} and id = ?`, values: [...t.values, id] },
      queueSaasConnections(this.scope, `id = ? and revision = ? and ${active}`, [
        id,
        pending.target?.revision ?? "",
        ...activeValues,
      ]),
      write,
      {
        sql: `update connection_requests set phase = 'completed', status = 'connected', app_id = ?, value = null, updated_at = ?
          where kind = 'local' and id = ? and phase = 'processing' and ${t.sql}
          and exists (select 1 from connections where ${t.sql} and id = ? and revision = ?)`,
        values: [id, now.getTime(), pending.connectionRequestId, ...t.values, ...t.values, id, revision],
      },
    ]);
    return results[3].length ? id : undefined;
  }

  private retireRequests(
    owner: string,
    service: string,
    now: number,
    fence: RequestStatement = { sql: "1 = 1", values: [] },
  ): RequestStatement[] {
    const t = tenantPredicate(this.scope);
    const expired = `expires_at <= ? and ${fence.sql}`;
    const superseded = `owner = ? and service = ? and phase = 'pending' and ${fence.sql}`;
    const expiredValues = [new Date(now - 86_400_000).toISOString(), ...fence.values];
    const supersededValues = [owner, service, ...fence.values];
    return [
      queueSaasRequests(this.scope, expired, expiredValues),
      queueSaasRequests(this.scope, superseded, supersededValues),
      {
        sql: `update connection_requests set phase = 'completed', status = 'failed', error_code = 'request_expired',
          value = null, candidate_value = null, lease_id = null, lease_until = null, updated_at = ?
          where kind = 'saas' and phase <> 'completed' and ${expired} and ${t.sql}`,
        values: [now, ...expiredValues, ...t.values],
      },
      {
        sql: `delete from connection_requests where ${expired} and ${t.sql}`,
        values: [...expiredValues, ...t.values],
      },
      {
        sql: `update connection_requests set phase = 'completed', status = 'failed', error_code = 'request_superseded',
          error_message = 'A newer authorization request replaced this request.', value = null, candidate_value = null,
          lease_id = null, lease_until = null, updated_at = ? where ${superseded} and (kind = 'saas' or expires_at > ?) and ${t.sql}`,
        values: [now, ...supersededValues, new Date(now).toISOString(), ...t.values],
      },
    ];
  }

  async createSaas(pending: PendingSaasRequest): Promise<SaasRequestLease> {
    if (!this.secretCodec.encrypted) throw new Error("SaaS requests require encrypted storage.");
    const value = await this.secretCodec.encode(JSON.stringify(pending));
    const leaseId = crypto.randomUUID();
    const returnUri = pending.returnUri ? await this.secretCodec.encode(pending.returnUri) : null;
    const now = Date.now();
    await this.transaction([
      ...this.retireRequests(pending.owner, pending.service, now),
      {
        sql: `insert into connection_requests
          (id, owner, tenant_id, service, state, kind, phase, saas_phase, status, value, expires_at, created_at, updated_at,
           managed_project_id, provider_config_id, external_user_id, lease_id, lease_until, return_uri)
          values (?, ?, ?, ?, ?, 'saas', 'pending', 'creating', 'initiated', ?, ?, ?, ?,
          (select managed_project_id from managed_project where managed_project_id = ?), ?, ?, ?, ?, ?)`,
        values: [
          pending.connectionRequestId,
          pending.owner,
          tenantForInsert(this.scope),
          pending.service,
          crypto.randomUUID(),
          value,
          pending.expiresAt,
          Date.parse(pending.createdAt),
          now,
          pending.managedProjectId,
          pending.providerConfigId,
          pending.externalUserId,
          leaseId,
          now + 45_000,
          returnUri,
        ],
      },
    ]);
    return { pending, leaseId, phase: "creating", remoteRequestId: null, pollAttempts: 0 };
  }

  async claimSaas(id: string, owner: string, now: number = Date.now()): Promise<SaasRequestLease | undefined> {
    const t = tenantPredicate(this.scope);
    const leaseId = crypto.randomUUID();
    const [[row]] = await this.transaction([
      {
        sql: `update connection_requests set lease_id = ?, lease_until = ?, updated_at = ?
        where id = ? and owner = ? and kind = 'saas' and phase = 'pending' and expires_at > ?
        and next_poll_at <= ? and (lease_until is null or lease_until <= ?) and ${t.sql} returning *`,
        values: [
          leaseId,
          now + 45_000,
          now,
          id,
          owner,
          new Date(now - 86_400_000).toISOString(),
          now,
          now,
          ...t.values,
        ],
      },
    ]);
    if (!row) return undefined;
    return {
      pending: JSON.parse(await this.secretCodec.decode(row.value as string)) as PendingSaasRequest,
      leaseId,
      pollAttempts: Number(row.poll_attempts),
      phase: row.saas_phase as SaasRequestLease["phase"],
      remoteRequestId: row.remote_request_id as string | null,
      candidate: row.candidate_value
        ? ({
            ...JSON.parse(await this.secretCodec.decode(row.candidate_value as string)),
            connectedAccountId: row.remote_account_id,
          } as SaasCandidate)
        : undefined,
    };
  }

  async saveSaasRequest(lease: SaasRequestLease, remoteRequestId: string, expiresAt?: string): Promise<boolean> {
    const t = tenantPredicate(this.scope);
    const now = Date.now();
    const [[row]] = await this.transaction([
      {
        sql: `update connection_requests set remote_request_id = ?, expires_at = coalesce(?, expires_at), saas_phase = 'pending', updated_at = ?
        where id = ? and kind = 'saas' and phase = 'pending' and saas_phase = 'creating' and lease_id = ? and lease_until > ? and ${t.sql} returning id`,
        values: [
          remoteRequestId,
          expiresAt ?? null,
          now,
          lease.pending.connectionRequestId,
          lease.leaseId,
          now,
          ...t.values,
        ],
      },
    ]);
    return !!row;
  }

  async saveSaasCandidate(lease: SaasRequestLease, candidate: SaasCandidate): Promise<boolean> {
    const t = tenantPredicate(this.scope);
    const value = await this.secretCodec.encode(
      JSON.stringify({ profile: candidate.profile, status: candidate.status, comment: candidate.comment }),
    );
    const now = Date.now();
    const [[row]] = await this.transaction([
      {
        sql: `update connection_requests set remote_account_id = ?, candidate_value = ?, saas_phase = 'candidate', updated_at = ?
        where id = ? and kind = 'saas' and phase = 'pending' and saas_phase = 'pending'
        and lease_id = ? and lease_until > ? and ${t.sql} returning id`,
        values: [
          candidate.connectedAccountId,
          value,
          now,
          lease.pending.connectionRequestId,
          lease.leaseId,
          now,
          ...t.values,
        ],
      },
    ]);
    return !!row;
  }

  async releaseSaas(lease: SaasRequestLease, nextPollAt: number, failed = false): Promise<boolean> {
    const t = tenantPredicate(this.scope);
    const now = Date.now();
    const [[row]] = await this.transaction([
      {
        sql: `update connection_requests set lease_id = null, lease_until = null, next_poll_at = ?, poll_attempts = ?
        where id = ? and kind = 'saas' and phase = 'pending' and lease_id = ? and lease_until > ? and ${t.sql} returning id`,
        values: [
          Math.max(nextPollAt, now + 2_000),
          failed ? lease.pollAttempts + 1 : 0,
          lease.pending.connectionRequestId,
          lease.leaseId,
          now,
          ...t.values,
        ],
      },
    ]);
    return !!row;
  }

  async failSaas(lease: SaasRequestLease, code: string, message: string): Promise<boolean> {
    const t = tenantPredicate(this.scope);
    const now = Date.now();
    const active = `id = ? and lease_id = ? and lease_until > ? and phase = 'pending' and kind = 'saas'`;
    const values = [lease.pending.connectionRequestId, lease.leaseId, now];
    const [, rows] = await this.transaction([
      queueSaasRequests(this.scope, active, values),
      {
        sql: `update connection_requests set phase = 'completed', status = 'failed', error_code = ?, error_message = ?,
          value = null, candidate_value = null, lease_id = null, lease_until = null, updated_at = ? where ${active} and ${t.sql} returning id`,
        values: [code, message, now, ...values, ...t.values],
      },
    ]);
    return rows.length > 0;
  }

  async getSaasReturnUri(id: string, owner: string): Promise<string | undefined> {
    const t = tenantPredicate(this.scope);
    const [[row]] = await this.transaction([
      {
        sql: `select return_uri from connection_requests where id = ? and owner = ? and kind = 'saas' and phase = 'completed' and expires_at > ? and ${t.sql}`,
        values: [id, owner, new Date(Date.now() - 86_400_000).toISOString(), ...t.values],
      },
    ]);
    return row?.return_uri ? this.secretCodec.decode(row.return_uri as string) : undefined;
  }

  async cancelSaas(id: string, owner: string): Promise<void> {
    const t = tenantPredicate(this.scope);
    await this.transaction([
      queueSaasRequests(this.scope, "id = ? and owner = ?", [id, owner]),
      {
        sql: `update connection_requests set phase = 'completed', status = 'failed', error_code = 'request_cancelled',
          value = null, candidate_value = null, lease_id = null, lease_until = null, updated_at = ?
          where id = ? and owner = ? and kind = 'saas' and phase <> 'completed' and ${t.sql}`,
        values: [Date.now(), id, owner, ...t.values],
      },
    ]);
  }

  async expireSaas(now: number = Date.now()): Promise<void> {
    const t = tenantPredicate(this.scope);
    await this.transaction([
      queueSaasRequests(this.scope, "expires_at <= ?", [new Date(now - 86_400_000).toISOString()]),
      {
        sql: `update connection_requests set phase = 'completed', status = 'failed', error_code = 'request_expired',
          value = null, candidate_value = null, lease_id = null, lease_until = null, updated_at = ?
          where kind = 'saas' and phase <> 'completed' and expires_at <= ? and ${t.sql}`,
        values: [now, new Date(now - 86_400_000).toISOString(), ...t.values],
      },
    ]);
  }

  async completeSaas(lease: SaasRequestLease): Promise<"connected" | "conflict" | "lease_lost"> {
    const t = tenantPredicate(this.scope);
    const { pending } = lease;
    const now = Date.now();
    const id = pending.target?.id ?? pending.connectionId;
    const revision = crypto.randomUUID();
    const active = `id = ? and kind = 'saas' and phase = 'pending' and saas_phase = 'candidate'
      and lease_id = ? and lease_until > ? and expires_at > ?`;
    const activeValues = [pending.connectionRequestId, lease.leaseId, now, new Date(now - 86_400_000).toISOString()];
    const target = pending.target
      ? `exists (select 1 from connections where ${t.sql} and id = ? and revision = ? and not exists (select 1 from trigger_subscriptions where connection_id = connections.id and mode <> 'resource-set' and status in ('active', 'deleting')))`
      : `not exists (select 1 from connections where ${t.sql} and service = ? and connection_name = ?)`;
    const targetValues = pending.target
      ? [...t.values, id, pending.target.revision]
      : [...t.values, pending.service, pending.connectionName];
    const results = await this.transaction([
      { sql: `update connections set revision = revision where ${t.sql} and id = ?`, values: [...t.values, id] },
      queueSaasConnections(
        this.scope,
        `id = ? and revision = ? and exists (select 1 from connection_requests where ${active} and ${t.sql} and remote_account_id <> connections.remote_account_id)`,
        [id, pending.target?.revision ?? "", ...activeValues, ...t.values],
      ),
      {
        sql: `insert into connections
          (id, revision, tenant_id, service, connection_name, value, updated_at, source, managed_project_id, provider_config_id, external_user_id, remote_account_id, local_request_id)
          select ?, ?, tenant_id, service, ?, candidate_value, ?, 'saas', managed_project_id, provider_config_id, external_user_id, remote_account_id, id
          from connection_requests where ${active} and ${t.sql} and ${target}
          on conflict (id) do update set revision = excluded.revision, value = excluded.value, updated_at = excluded.updated_at,
            source = excluded.source, managed_project_id = excluded.managed_project_id, provider_config_id = excluded.provider_config_id,
            external_user_id = excluded.external_user_id, remote_account_id = excluded.remote_account_id, local_request_id = excluded.local_request_id returning id`,
        values: [
          id,
          revision,
          pending.connectionName,
          new Date(now).toISOString(),
          ...activeValues,
          ...t.values,
          ...targetValues,
        ],
      },
      {
        sql: `update connection_requests set phase = 'completed', status = 'connected', app_id = ?, value = null,
          candidate_value = null, lease_id = null, lease_until = null, updated_at = ?
          where ${active} and ${t.sql} and exists (select 1 from connections where ${t.sql} and id = ? and revision = ?) returning id`,
        values: [id, now, ...activeValues, ...t.values, ...t.values, id, revision],
      },
      queueSaasRequests(this.scope, active, activeValues),
      {
        sql: `update connection_requests set phase = 'completed', status = 'failed', error_code = 'request_key_conflict', error_message = 'The connection changed during authorization.',
          value = null, candidate_value = null, lease_id = null, lease_until = null, updated_at = ? where ${active} and ${t.sql} returning id`,
        values: [now, ...activeValues, ...t.values],
      },
    ]);
    return results[3].length ? "connected" : results[5].length ? "conflict" : "lease_lost";
  }
}
