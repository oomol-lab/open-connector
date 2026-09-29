import type { StoredSaasConnection } from "../../connection-service.ts";
import type { ISecretCodec } from "../secrets/secret-codec-core.ts";
import type { RequestStatement, RequestTransaction } from "./connection-request-store.ts";
import type { RuntimeRow } from "./runtime-sql.ts";

export interface ManagedProject {
  id: string;
  projectId: string;
  baseUrl: string;
  apiKey: string;
}

interface OAuthSourceRecord {
  service: string;
  managedProjectId: string;
  projectId: string;
  providerConfigId: string;
}

export interface SaasCleanup {
  id: string;
  managedProjectId: string;
  providerConfigId: string;
  externalUserId: string;
  remoteRequestId: string | null;
  connectedAccountId: string | null;
  leaseId: string;
  attempts: number;
  service: string | null;
  requestExpiresAt: string | null;
}

export interface InstanceSnapshot {
  instanceId: string;
  connections: number;
  requests: number;
  sources: number;
  projects: number;
  cleanup: number;
}

export interface ResetInstanceInput {
  expectedInstanceId: string;
  newInstanceId: string;
}

/** Queue references before removing their owning rows in the same transaction. */
export function queueSaasConnections(where: string, values: RequestStatement["values"]): RequestStatement {
  return {
    sql: `insert into saas_cleanup
      (id, managed_project_id, provider_config_id, external_user_id, remote_account_id, created_at, service)
      select 'account:' || managed_project_id || ':' || remote_account_id,
        managed_project_id, provider_config_id, external_user_id, remote_account_id, ?, service
      from connections where source = 'saas' and (${where})
      on conflict (id) do nothing`,
    values: [Date.now(), ...values],
  };
}

export function queueSaasRequests(where: string, values: RequestStatement["values"]): RequestStatement {
  return {
    sql: `insert into saas_cleanup
      (id, managed_project_id, provider_config_id, external_user_id, remote_request_id, remote_account_id, status, created_at, service, request_expires_at)
      select 'request:' || id, managed_project_id, provider_config_id, external_user_id,
        remote_request_id, remote_account_id,
        case when remote_request_id is null and remote_account_id is null then 'manual' else 'pending' end, ?, service, expires_at
      from connection_requests where kind = 'saas' and phase <> 'completed' and (${where})
      on conflict (id) do nothing`,
    values: [Date.now(), ...values],
  };
}

/** Persistent project identity, default sources and ordinary account deletion work. */
export class SaasProjectStore {
  private readonly transaction: RequestTransaction;
  private readonly codec: ISecretCodec;

  constructor(transaction: RequestTransaction, codec: ISecretCodec) {
    this.transaction = transaction;
    this.codec = codec;
  }

  async getInstanceId(): Promise<string> {
    const [, [row]] = await this.transaction([
      {
        sql: "insert into instance_identity (id, instance_id) values (1, ?) on conflict (id) do nothing",
        values: [crypto.randomUUID()],
      },
      { sql: "select instance_id from instance_identity where id = 1", values: [] },
    ]);
    return row.instance_id as string;
  }

  async getProject(): Promise<ManagedProject | undefined> {
    const [[row]] = await this.transaction([
      { sql: "select managed_project_id, project_id, base_url, value from managed_project where id = 1", values: [] },
    ]);
    return row
      ? {
          id: row.managed_project_id as string,
          projectId: row.project_id as string,
          baseUrl: row.base_url as string,
          apiKey: await this.codec.decode(row.value as string),
        }
      : undefined;
  }

  async saveProject(project: ManagedProject): Promise<boolean> {
    if (!this.codec.encrypted) throw new Error("SaaS project configuration requires encrypted storage.");
    const value = await this.codec.encode(project.apiKey);
    const [[row]] = await this.transaction([
      {
        sql: `insert into managed_project (id, managed_project_id, project_id, base_url, value)
        values (1, ?, ?, ?, ?) on conflict (id) do update set value = excluded.value, cleanup_paused = 0
        where managed_project.managed_project_id = excluded.managed_project_id
          and managed_project.project_id = excluded.project_id and managed_project.base_url = excluded.base_url
        returning managed_project_id`,
        values: [project.id, project.projectId, project.baseUrl, value],
      },
    ]);
    return row !== undefined;
  }

  async deleteProject(id: string): Promise<boolean> {
    const [[row]] = await this.transaction([
      {
        sql: `delete from managed_project where managed_project_id = ?
        and not exists (select 1 from oauth_sources where managed_project_id = ?)
        and not exists (select 1 from connections where managed_project_id = ?)
        and not exists (select 1 from connection_requests where managed_project_id = ? and phase <> 'completed')
        and not exists (select 1 from saas_cleanup where managed_project_id = ?) returning id`,
        values: [id, id, id, id, id],
      },
    ]);
    return row !== undefined;
  }

  async listSources(): Promise<OAuthSourceRecord[]> {
    const [rows] = await this.transaction([
      {
        sql: `select s.service, s.managed_project_id, p.project_id, s.provider_config_id
        from oauth_sources s join managed_project p on p.managed_project_id = s.managed_project_id`,
        values: [],
      },
    ]);
    return rows.map((row) => ({
      service: row.service as string,
      managedProjectId: row.managed_project_id as string,
      projectId: row.project_id as string,
      providerConfigId: row.provider_config_id as string,
    }));
  }

  async getSource(service: string): Promise<{ managedProjectId: string; providerConfigId: string } | undefined> {
    const [[row]] = await this.transaction([
      { sql: "select managed_project_id, provider_config_id from oauth_sources where service = ?", values: [service] },
    ]);
    return row
      ? { managedProjectId: row.managed_project_id as string, providerConfigId: row.provider_config_id as string }
      : undefined;
  }

  async setSource(
    service: string,
    source: { managedProjectId: string; providerConfigId: string } | undefined,
  ): Promise<boolean> {
    if (!source) {
      await this.transaction([{ sql: "delete from oauth_sources where service = ?", values: [service] }]);
      return true;
    }
    const [[row]] = await this.transaction([
      {
        sql: `insert into oauth_sources (service, managed_project_id, provider_config_id)
        select ?, ?, ? where exists (select 1 from managed_project where managed_project_id = ?)
        on conflict (service) do update set managed_project_id = excluded.managed_project_id,
        provider_config_id = excluded.provider_config_id returning service`,
        values: [service, source.managedProjectId, source.providerConfigId, source.managedProjectId],
      },
    ]);
    return row !== undefined;
  }

  async getCleanupStats(): Promise<{ pending: number; manual: number; paused: boolean }> {
    const [rows, [project]] = await this.transaction([
      { sql: "select status, count(*) as count from saas_cleanup group by status", values: [] },
      { sql: "select cleanup_paused from managed_project where id = 1", values: [] },
    ]);
    return {
      paused: project?.cleanup_paused === 1,
      pending: Number(rows.find((row) => row.status === "pending")?.count ?? 0),
      manual: Number(rows.find((row) => row.status === "manual")?.count ?? 0),
    };
  }

  async claimCleanup(now: number, leaseMs = 45_000): Promise<SaasCleanup | undefined> {
    const leaseId = crypto.randomUUID();
    const [[row]] = await this.transaction([
      {
        sql: `update saas_cleanup set lease_id = ?, lease_until = ?
        where id = (select id from saas_cleanup where status = 'pending' and next_attempt_at <= ?
        and exists (select 1 from managed_project where managed_project_id = saas_cleanup.managed_project_id and cleanup_paused = 0)
        and (lease_until is null or lease_until <= ?) order by created_at, id limit 1)
        and (lease_until is null or lease_until <= ?) returning *`,
        values: [leaseId, now + leaseMs, now, now, now],
      },
    ]);
    return row
      ? {
          id: row.id as string,
          managedProjectId: row.managed_project_id as string,
          providerConfigId: row.provider_config_id as string,
          externalUserId: row.external_user_id as string,
          remoteRequestId: row.remote_request_id as string | null,
          connectedAccountId: row.remote_account_id as string | null,
          leaseId,
          attempts: Number(row.attempts),
          service: row.service as string | null,
          requestExpiresAt: row.request_expires_at as string | null,
        }
      : undefined;
  }

  async saveCleanupAccount(task: SaasCleanup, accountId: string): Promise<boolean> {
    const [[row]] = await this.transaction([
      {
        sql: "update saas_cleanup set remote_account_id = ? where id = ? and lease_id = ? and lease_until > ? returning id",
        values: [accountId, task.id, task.leaseId, Date.now()],
      },
    ]);
    return row !== undefined;
  }

  async pauseCleanup(task: SaasCleanup, rejectedKey: string): Promise<void> {
    const [[project]] = await this.transaction([
      {
        sql: "select value from managed_project where managed_project_id = ?",
        values: [task.managedProjectId],
      },
    ]);
    if (!project || (await this.codec.decode(project.value as string)) !== rejectedKey) return;
    await this.transaction([
      {
        sql: `update managed_project set cleanup_paused = 1 where managed_project_id = ? and value = ?
        and exists (select 1 from saas_cleanup where id = ? and lease_id = ? and lease_until > ?)`,
        values: [task.managedProjectId, project.value as string, task.id, task.leaseId, Date.now()],
      },
    ]);
  }

  async inspectInstance(): Promise<InstanceSnapshot> {
    await this.getInstanceId();
    const [[row]] = await this.transaction([
      {
        sql: `select instance_id,
        (select count(*) from connections where source = 'saas') as connections,
        (select count(*) from connection_requests where kind = 'saas') as requests,
        (select count(*) from oauth_sources) as sources,
        (select count(*) from managed_project) as projects,
        (select count(*) from saas_cleanup) as cleanup
        from instance_identity where id = 1`,
        values: [],
      },
    ]);
    return {
      instanceId: row.instance_id as string,
      connections: Number(row.connections),
      requests: Number(row.requests),
      sources: Number(row.sources),
      projects: Number(row.projects),
      cleanup: Number(row.cleanup),
    };
  }

  /** Offline clone maintenance: every delete is guarded by the old identity in the same atomic batch. */
  async resetInstance(input: ResetInstanceInput): Promise<"reset" | "already_reset" | "conflict"> {
    if (!input.expectedInstanceId || !input.newInstanceId || input.expectedInstanceId === input.newInstanceId)
      throw new Error("Instance reset requires distinct non-empty old and new identities.");
    const guard = "exists (select 1 from instance_identity where id = 1 and instance_id = ?)";
    const results = await this.transaction([
      ...[
        "delete from connections where source = 'saas' and",
        "delete from connection_requests where kind = 'saas' and",
        "delete from oauth_sources where",
        "delete from saas_cleanup where",
        "delete from managed_project where",
      ].map((sql) => ({ sql: `${sql} ${guard}`, values: [input.expectedInstanceId] })),
      {
        sql: "update instance_identity set instance_id = ? where id = 1 and instance_id = ? returning instance_id",
        values: [input.newInstanceId, input.expectedInstanceId],
      },
      { sql: "select instance_id from instance_identity where id = 1", values: [] },
    ]);
    if (results[5].length) return "reset";
    return results[6][0]?.instance_id === input.newInstanceId ? "already_reset" : "conflict";
  }

  async finishCleanup(task: SaasCleanup): Promise<boolean> {
    const [[row]] = await this.transaction([
      {
        sql: "delete from saas_cleanup where id = ? and lease_id = ? and lease_until > ? returning id",
        values: [task.id, task.leaseId, Date.now()],
      },
    ]);
    return row !== undefined;
  }

  async retryCleanup(task: SaasCleanup, nextAttemptAt: number, errorCode: string, manual = false): Promise<boolean> {
    const [[row]] = await this.transaction([
      {
        sql: `update saas_cleanup set lease_id = null, lease_until = null, attempts = attempts + 1,
        next_attempt_at = ?, error_code = ?, status = ? where id = ? and lease_id = ? and lease_until > ? returning id`,
        values: [nextAttemptAt, errorCode, manual ? "manual" : "pending", task.id, task.leaseId, Date.now()],
      },
    ]);
    return row !== undefined;
  }
}

export async function readSaasConnection(row: RuntimeRow, codec: ISecretCodec): Promise<StoredSaasConnection> {
  const display = JSON.parse(await codec.decode(row.value as string)) as Pick<
    StoredSaasConnection,
    "profile" | "status" | "comment"
  >;
  return {
    source: "saas",
    id: row.id as string,
    revision: row.revision as string,
    service: row.service as string,
    connectionName: row.connection_name as string,
    reference: {
      managedProjectId: row.managed_project_id as string,
      providerConfigId: row.provider_config_id as string,
      externalUserId: row.external_user_id as string,
      connectedAccountId: row.remote_account_id as string,
      localRequestId: row.local_request_id as string,
    },
    profile: display.profile,
    status: display.status,
    comment: display.comment,
  };
}
