import type { StoredConnection } from "../../connection-service.ts";
import type { ResolvedCredential } from "../../core/types.ts";
import type { OAuthAuthorizationState } from "../../oauth/oauth-flow-service.ts";
import type { ISecretCodec } from "../secrets/secret-codec-core.ts";
import type { RuntimeRow } from "./runtime-sql.ts";

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
      {
        sql: "delete from connection_requests where expires_at <= ?",
        values: [new Date(now - 86_400_000).toISOString()],
      },
      {
        sql: `update connection_requests set phase = 'completed', status = 'failed', error_code = 'request_superseded',
          error_message = 'A newer authorization request replaced this request.', value = null, updated_at = ?
          where owner = ? and service = ? and phase = 'pending' and expires_at > ?`,
        values: [now, pending.owner, pending.service, pending.createdAt],
      },
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
        sql: "update connection_requests set phase = 'processing', updated_at = ? where state = ? and phase = 'pending' and expires_at > ? returning value",
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
        where id = ? and phase = 'processing'`,
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
    const active = "exists (select 1 from connection_requests where id = ? and phase = 'processing')";
    const write: RequestStatement = pending.target
      ? {
          sql: `update connections set value = ?, revision = ?, updated_at = ? where id = ? and revision = ? and ${active} returning id`,
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
    const [written] = await this.transaction([
      write,
      {
        sql: `update connection_requests set phase = 'completed', status = 'connected', app_id = ?, value = null, updated_at = ?
          where id = ? and phase = 'processing' and exists (select 1 from connections where id = ? and revision = ?)`,
        values: [id, now.getTime(), pending.connectionRequestId, id, revision],
      },
    ]);
    return written.length ? id : undefined;
  }
}
