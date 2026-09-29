import type { StoredConnection, StoredSaasConnection } from "../../connection-service.ts";
import type { ResolvedCredential } from "../../core/types.ts";
import type { OAuthAuthorizationState } from "../../oauth/oauth-flow-service.ts";
import type { ISecretCodec } from "../secrets/secret-codec-core.ts";
import type { RuntimeRow } from "./runtime-sql.ts";

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

  constructor(transaction: RequestTransaction, secretCodec: ISecretCodec) {
    this.transaction = transaction;
    this.secretCodec = secretCodec;
  }

  async create(pending: PendingConnectionRequest): Promise<void> {
    const now = Date.parse(pending.createdAt);
    const value = await this.secretCodec.encode(JSON.stringify(pending));
    await this.transaction([
      ...this.retireRequests(pending.owner, pending.service, now),
      {
        sql: `insert into connection_requests (id, owner, service, state, phase, status, value, expires_at, created_at, updated_at)
          values (?, ?, ?, ?, 'pending', 'initiated', ?, ?, ?, ?)`,
        values: [
          pending.connectionRequestId,
          pending.owner,
          pending.service,
          pending.state,
          value,
          pending.expiresAt,
          now,
          now,
        ],
      },
    ]);
  }

  async get(id: string, owner: string): Promise<ConnectionRequest | undefined> {
    const now = Date.now();
    const [[row]] = await this.transaction([
      {
        sql: "select id, service, status, app_id, error_code, error_message, expires_at, created_at, updated_at from connection_requests where id = ? and owner = ? and expires_at > ?",
        values: [id, owner, new Date(now - 86_400_000).toISOString()],
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
    const [[row]] = await this.transaction([
      {
        sql: "update connection_requests set phase = 'processing', updated_at = ? where kind = 'local' and state = ? and phase = 'pending' and expires_at > ? returning value",
        values: [Date.now(), state, new Date().toISOString()],
      },
    ]);
    return row
      ? (JSON.parse(await this.secretCodec.decode(row.value as string)) as PendingConnectionRequest)
      : undefined;
  }

  async fail(id: string, errorCode: string, errorMessage: string): Promise<void> {
    await this.transaction([
      {
        sql: `update connection_requests set phase = 'completed', status = 'failed', error_code = ?, error_message = ?, value = null, updated_at = ?
        where kind = 'local' and id = ? and phase = 'processing'`,
        values: [errorCode, errorMessage, Date.now(), id],
      },
    ]);
  }

  async complete(
    pending: PendingConnectionRequest,
    credential: ResolvedCredential,
    signal?: AbortSignal,
  ): Promise<string | undefined> {
    const id = pending.target?.id ?? crypto.randomUUID();
    const revision = crypto.randomUUID();
    const value = await this.secretCodec.encode(JSON.stringify(credential));
    signal?.throwIfAborted();
    const now = new Date();
    const active =
      "exists (select 1 from connection_requests where kind = 'local' and id = ? and phase = 'processing')";
    const write: RequestStatement = pending.target
      ? {
          sql: `update connections set value = ?, revision = ?, updated_at = ?, source = 'local',
            managed_project_id = null, provider_config_id = null, external_user_id = null, remote_account_id = null, local_request_id = null where id = ? and revision = ? and ${active} returning id`,
          values: [value, revision, now.toISOString(), id, pending.target.revision, pending.connectionRequestId],
        }
      : {
          sql: `insert into connections (id, revision, service, connection_name, value, updated_at)
        select ?, ?, ?, ?, ?, ? where ${active} returning id`,
          values: [
            id,
            revision,
            pending.service,
            pending.connectionName,
            value,
            now.toISOString(),
            pending.connectionRequestId,
          ],
        };
    const results = await this.transaction([
      queueSaasConnections(`id = ? and revision = ? and ${active}`, [
        id,
        pending.target?.revision ?? "",
        pending.connectionRequestId,
      ]),
      write,
      {
        sql: `update connection_requests set phase = 'completed', status = 'connected', app_id = ?, value = null, updated_at = ?
          where kind = 'local' and id = ? and phase = 'processing' and exists (select 1 from connections where id = ? and revision = ?)`,
        values: [id, now.getTime(), pending.connectionRequestId, id, revision],
      },
    ]);
    return results[1].length ? id : undefined;
  }

  private retireRequests(owner: string, service: string, now: number): RequestStatement[] {
    const expired = "expires_at <= ?";
    const superseded = "owner = ? and service = ? and phase = 'pending'";
    return [
      queueSaasRequests(expired, [new Date(now - 86_400_000).toISOString()]),
      queueSaasRequests(superseded, [owner, service]),
      {
        sql: `update connection_requests set phase = 'completed', status = 'failed', error_code = 'request_expired',
          value = null, candidate_value = null, lease_id = null, lease_until = null, updated_at = ?
          where kind = 'saas' and phase <> 'completed' and ${expired}`,
        values: [now, new Date(now - 86_400_000).toISOString()],
      },
      {
        sql: "delete from connection_requests where expires_at <= ?",
        values: [new Date(now - 86_400_000).toISOString()],
      },
      {
        sql: `update connection_requests set phase = 'completed', status = 'failed', error_code = 'request_superseded',
          error_message = 'A newer authorization request replaced this request.', value = null, candidate_value = null,
          lease_id = null, lease_until = null, updated_at = ? where ${superseded} and (kind = 'saas' or expires_at > ?)`,
        values: [now, owner, service, new Date(now).toISOString()],
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
          (id, owner, service, state, kind, phase, saas_phase, status, value, expires_at, created_at, updated_at,
           managed_project_id, provider_config_id, external_user_id, lease_id, lease_until, return_uri)
          values (?, ?, ?, ?, 'saas', 'pending', 'creating', 'initiated', ?, ?, ?, ?,
          (select managed_project_id from managed_project where managed_project_id = ?), ?, ?, ?, ?, ?)`,
        values: [
          pending.connectionRequestId,
          pending.owner,
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
    const leaseId = crypto.randomUUID();
    const [[row]] = await this.transaction([
      {
        sql: `update connection_requests set lease_id = ?, lease_until = ?, updated_at = ?
        where id = ? and owner = ? and kind = 'saas' and phase = 'pending' and expires_at > ?
        and next_poll_at <= ? and (lease_until is null or lease_until <= ?) returning *`,
        values: [leaseId, now + 45_000, now, id, owner, new Date(now - 86_400_000).toISOString(), now, now],
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
    const now = Date.now();
    const [[row]] = await this.transaction([
      {
        sql: `update connection_requests set remote_request_id = ?, expires_at = coalesce(?, expires_at), saas_phase = 'pending', updated_at = ?
        where id = ? and kind = 'saas' and phase = 'pending' and saas_phase = 'creating' and lease_id = ? and lease_until > ? returning id`,
        values: [remoteRequestId, expiresAt ?? null, now, lease.pending.connectionRequestId, lease.leaseId, now],
      },
    ]);
    return !!row;
  }

  async saveSaasCandidate(lease: SaasRequestLease, candidate: SaasCandidate): Promise<boolean> {
    const value = await this.secretCodec.encode(
      JSON.stringify({ profile: candidate.profile, status: candidate.status, comment: candidate.comment }),
    );
    const now = Date.now();
    const [[row]] = await this.transaction([
      {
        sql: `update connection_requests set remote_account_id = ?, candidate_value = ?, saas_phase = 'candidate', updated_at = ?
        where id = ? and kind = 'saas' and phase = 'pending' and saas_phase = 'pending'
        and lease_id = ? and lease_until > ? returning id`,
        values: [candidate.connectedAccountId, value, now, lease.pending.connectionRequestId, lease.leaseId, now],
      },
    ]);
    return !!row;
  }

  async releaseSaas(lease: SaasRequestLease, nextPollAt: number, failed = false): Promise<boolean> {
    const now = Date.now();
    const [[row]] = await this.transaction([
      {
        sql: `update connection_requests set lease_id = null, lease_until = null, next_poll_at = ?, poll_attempts = ?
        where id = ? and kind = 'saas' and phase = 'pending' and lease_id = ? and lease_until > ? returning id`,
        values: [
          Math.max(nextPollAt, now + 2_000),
          failed ? lease.pollAttempts + 1 : 0,
          lease.pending.connectionRequestId,
          lease.leaseId,
          now,
        ],
      },
    ]);
    return !!row;
  }

  async failSaas(lease: SaasRequestLease, code: string, message: string): Promise<boolean> {
    const now = Date.now();
    const active = "id = ? and lease_id = ? and lease_until > ? and phase = 'pending' and kind = 'saas'";
    const values = [lease.pending.connectionRequestId, lease.leaseId, now];
    const [, rows] = await this.transaction([
      queueSaasRequests(active, values),
      {
        sql: `update connection_requests set phase = 'completed', status = 'failed', error_code = ?, error_message = ?,
          value = null, candidate_value = null, lease_id = null, lease_until = null, updated_at = ? where ${active} returning id`,
        values: [code, message, now, ...values],
      },
    ]);
    return rows.length > 0;
  }

  async getSaasReturnUri(id: string, owner: string): Promise<string | undefined> {
    const [[row]] = await this.transaction([
      {
        sql: "select return_uri from connection_requests where id = ? and owner = ? and kind = 'saas' and phase = 'completed' and expires_at > ?",
        values: [id, owner, new Date(Date.now() - 86_400_000).toISOString()],
      },
    ]);
    return row?.return_uri ? this.secretCodec.decode(row.return_uri as string) : undefined;
  }

  async cancelSaas(id: string, owner: string): Promise<void> {
    await this.transaction([
      queueSaasRequests("id = ? and owner = ?", [id, owner]),
      {
        sql: `update connection_requests set phase = 'completed', status = 'failed', error_code = 'request_cancelled',
          value = null, candidate_value = null, lease_id = null, lease_until = null, updated_at = ?
          where id = ? and owner = ? and kind = 'saas' and phase <> 'completed'`,
        values: [Date.now(), id, owner],
      },
    ]);
  }

  async expireSaas(now: number = Date.now()): Promise<void> {
    await this.transaction([
      queueSaasRequests("expires_at <= ?", [new Date(now - 86_400_000).toISOString()]),
      {
        sql: `update connection_requests set phase = 'completed', status = 'failed', error_code = 'request_expired',
          value = null, candidate_value = null, lease_id = null, lease_until = null, updated_at = ?
          where kind = 'saas' and phase <> 'completed' and expires_at <= ?`,
        values: [now, new Date(now - 86_400_000).toISOString()],
      },
    ]);
  }

  async completeSaas(lease: SaasRequestLease): Promise<"connected" | "conflict" | "lease_lost"> {
    const { pending } = lease;
    const now = Date.now();
    const id = pending.target?.id ?? pending.connectionId;
    const revision = crypto.randomUUID();
    const active = `id = ? and kind = 'saas' and phase = 'pending' and saas_phase = 'candidate'
      and lease_id = ? and lease_until > ? and expires_at > ?`;
    const activeValues = [pending.connectionRequestId, lease.leaseId, now, new Date(now - 86_400_000).toISOString()];
    const target = pending.target
      ? "exists (select 1 from connections where id = ? and revision = ?)"
      : "not exists (select 1 from connections where service = ? and connection_name = ?)";
    const targetValues = pending.target ? [id, pending.target.revision] : [pending.service, pending.connectionName];
    const results = await this.transaction([
      queueSaasConnections(
        `id = ? and revision = ? and exists (select 1 from connection_requests where ${active} and remote_account_id <> connections.remote_account_id)`,
        [id, pending.target?.revision ?? "", ...activeValues],
      ),
      {
        sql: `insert into connections
          (id, revision, service, connection_name, value, updated_at, source, managed_project_id, provider_config_id, external_user_id, remote_account_id, local_request_id)
          select ?, ?, service, ?, candidate_value, ?, 'saas', managed_project_id, provider_config_id, external_user_id, remote_account_id, id
          from connection_requests where ${active} and ${target}
          on conflict (id) do update set revision = excluded.revision, value = excluded.value, updated_at = excluded.updated_at,
            source = excluded.source, managed_project_id = excluded.managed_project_id, provider_config_id = excluded.provider_config_id,
            external_user_id = excluded.external_user_id, remote_account_id = excluded.remote_account_id, local_request_id = excluded.local_request_id returning id`,
        values: [id, revision, pending.connectionName, new Date(now).toISOString(), ...activeValues, ...targetValues],
      },
      {
        sql: `update connection_requests set phase = 'completed', status = 'connected', app_id = ?, value = null,
          candidate_value = null, lease_id = null, lease_until = null, updated_at = ?
          where ${active} and exists (select 1 from connections where id = ? and revision = ?) returning id`,
        values: [id, now, ...activeValues, id, revision],
      },
      queueSaasRequests(active, activeValues),
      {
        sql: `update connection_requests set phase = 'completed', status = 'failed', error_code = 'request_key_conflict', error_message = 'The connection changed during authorization.',
          value = null, candidate_value = null, lease_id = null, lease_until = null, updated_at = ? where ${active} returning id`,
        values: [now, ...activeValues],
      },
    ]);
    return results[2].length ? "connected" : results[4].length ? "conflict" : "lease_lost";
  }
}
