import type { IConnectionStore, StoredConnection, StoredLocalConnection } from "../../connection-store.ts";
import type { ResolvedCredential } from "../../core/types.ts";
import type { TenantScope } from "../../tenant/tenant-scope.ts";
import type { ISecretCodec } from "../secrets/secret-codec-core.ts";
import type { RequestTransaction } from "./connection-request-store.ts";
import type { RuntimeRow } from "./runtime-sql.ts";

import { ConnectionError } from "../../connection-error.ts";
import { tenantForInsert, tenantPredicate } from "../../tenant/tenant-scope.ts";
import { HttpRequestError } from "../api/http-utils.ts";
import { initializeRetirement, lockRetirement, retirementMatches } from "./connection-retirement.ts";
import { queueSaasConnections, readSaasConnection } from "./saas-project-store.ts";

/** Connection writes share the request transaction so replacing/deleting remote references cannot lose cleanup work. */
export class SqlConnectionStore implements IConnectionStore {
  private readonly transaction: RequestTransaction;
  private readonly codec: ISecretCodec;
  private readonly scope: TenantScope;

  constructor(transaction: RequestTransaction, codec: ISecretCodec, scope: TenantScope) {
    this.transaction = transaction;
    this.codec = codec;
    this.scope = scope;
  }

  private async read(row: RuntimeRow): Promise<StoredConnection> {
    if (row.source === "saas") return readSaasConnection(row, this.codec);
    return {
      id: row.id as string,
      revision: row.revision as string,
      service: row.service as string,
      connectionName: row.connection_name as string,
      credential: JSON.parse(await this.codec.decode(row.value as string)) as ResolvedCredential,
    };
  }

  async get(service: string, connectionName: string): Promise<StoredConnection | undefined> {
    const t = tenantPredicate(this.scope);
    const [[row]] = await this.transaction([
      {
        sql: `select * from connections where ${t.sql} and service = ? and connection_name = ?`,
        values: [...t.values, service, connectionName],
      },
    ]);
    return row ? this.read(row) : undefined;
  }

  async getById(id: string): Promise<StoredConnection | undefined> {
    const t = tenantPredicate(this.scope);
    const [[row]] = await this.transaction([
      { sql: `select * from connections where ${t.sql} and id = ?`, values: [...t.values, id] },
    ]);
    return row ? this.read(row) : undefined;
  }

  async list(): Promise<StoredConnection[]> {
    const t = tenantPredicate(this.scope);
    const [rows] = await this.transaction([
      { sql: `select * from connections where ${t.sql} order by service, connection_name`, values: [...t.values] },
    ]);
    return Promise.all(rows.map((row) => this.read(row)));
  }

  async getRetirementGeneration(service: string, connectionName: string): Promise<string> {
    const t = tenantPredicate(this.scope);
    const [, [row]] = await this.transaction([
      initializeRetirement(this.scope, service, connectionName, crypto.randomUUID()),
      {
        sql: `select generation from connection_retirements where ${t.sql} and service = ? and connection_name = ?`,
        values: [...t.values, service, connectionName],
      },
    ]);
    return row.generation as string;
  }

  async set(service: string, connectionName: string, credential: ResolvedCredential): Promise<StoredLocalConnection> {
    const stored = await this.writeCredential(service, connectionName, credential);
    if (!stored) throw new Error("Connection upsert did not return the stored row.");
    return stored;
  }

  async setIfCurrentGeneration(
    service: string,
    connectionName: string,
    credential: ResolvedCredential,
    retirementGeneration: string,
  ): Promise<StoredLocalConnection | undefined> {
    return this.writeCredential(service, connectionName, credential, retirementGeneration);
  }

  private async writeCredential(
    service: string,
    connectionName: string,
    credential: ResolvedCredential,
    retirementGeneration?: string,
  ): Promise<StoredLocalConnection | undefined> {
    const t = tenantPredicate(this.scope);
    const fence =
      retirementGeneration === undefined
        ? { sql: "1 = 1", values: [] }
        : retirementMatches(this.scope, service, connectionName, retirementGeneration);
    const value = await this.codec.encode(JSON.stringify(credential));
    const [[accepted], , , [row]] = await this.transaction([
      retirementGeneration === undefined
        ? { sql: "select 1", values: [] }
        : lockRetirement(this.scope, service, connectionName, retirementGeneration),
      {
        sql: `update connections set revision = revision where ${t.sql} and service = ? and connection_name = ?`,
        values: [...t.values, service, connectionName],
      },
      queueSaasConnections(this.scope, `service = ? and connection_name = ? and ${fence.sql}`, [
        service,
        connectionName,
        ...fence.values,
      ]),
      {
        sql: `insert into connections (id, revision, tenant_id, service, connection_name, value, updated_at, provider_account_id)
          select ?, ?, ?, ?, ?, ?, ?, ? where ${fence.sql} on conflict (tenant_id, service, connection_name) do update set
          revision = excluded.revision, value = excluded.value, updated_at = excluded.updated_at,
          source = 'local', managed_project_id = null, provider_config_id = null, external_user_id = null,
          remote_account_id = null, local_request_id = null, provider_account_id = excluded.provider_account_id
          where not exists (select 1 from trigger_subscriptions where connection_id = connections.id and mode <> 'resource-set' and status in ('active', 'deleting'))
          or (connections.provider_account_id is not null and connections.provider_account_id = excluded.provider_account_id) returning id, revision`,
        values: [
          crypto.randomUUID(),
          crypto.randomUUID(),
          tenantForInsert(this.scope),
          service,
          connectionName,
          value,
          new Date().toISOString(),
          credential.authType !== "no_auth" && credential.metadata.providerAccountVerified === true
            ? credential.profile.accountId
            : null,
          ...fence.values,
        ],
      },
    ]);
    if (!accepted) return undefined;
    if (!row)
      throw new HttpRequestError(
        "connection_has_subscriptions",
        "Cancel or abandon remote Trigger subscriptions before replacing this connection.",
        409,
      );
    return { id: row.id as string, revision: row.revision as string, service, connectionName, credential };
  }

  async updateCredential(input: StoredLocalConnection, refresh = false): Promise<boolean> {
    const t = tenantPredicate(this.scope);
    const value = await this.codec.encode(JSON.stringify(input.credential));
    const [, [row]] = await this.transaction([
      { sql: `update connections set revision = revision where ${t.sql} and id = ?`, values: [...t.values, input.id] },
      {
        sql: `update connections set revision = ?, value = ?, updated_at = ?, provider_account_id = ?
        where ${t.sql} and service = ? and connection_name = ? and id = ? and revision = ? and source = 'local'
        and (? = 1 or not exists (select 1 from trigger_subscriptions where connection_id = connections.id and mode <> 'resource-set' and status in ('active', 'deleting'))
        or (provider_account_id is not null and provider_account_id = ?)) returning id`,
        values: [
          crypto.randomUUID(),
          value,
          new Date().toISOString(),
          input.credential.authType !== "no_auth" && input.credential.metadata.providerAccountVerified === true
            ? input.credential.profile.accountId
            : null,
          ...t.values,
          input.service,
          input.connectionName,
          input.id,
          input.revision,
          refresh ? 1 : 0,
          input.credential.authType !== "no_auth" && input.credential.metadata.providerAccountVerified === true
            ? input.credential.profile.accountId
            : null,
        ],
      },
    ]);
    return row !== undefined;
  }

  async delete(
    service: string,
    connectionName: string,
    target?: Pick<StoredConnection, "id" | "revision">,
  ): Promise<void> {
    // Only a matching, unblocked target can authorize this transaction's retirement and cleanup.
    const t = tenantPredicate(this.scope);
    const generation = crypto.randomUUID();
    const retirement = retirementMatches(this.scope, service, connectionName, generation);
    const retired = `not exists (select 1 from connections where ${t.sql} and service = ? and connection_name = ?) and ${retirement.sql}`;
    const subscriptions = `exists (select 1 from trigger_subscriptions where connection_id = connections.id
      and mode <> 'resource-set' and status in ('active', 'deleting'))`;
    const eligible = target
      ? `exists (select 1 from connections where ${t.sql} and service = ? and connection_name = ? and id = ? and revision = ? and not ${subscriptions})`
      : `not exists (select 1 from connections where ${t.sql} and service = ? and connection_name = ? and ${subscriptions})`;
    const eligibilityValues = target
      ? [...t.values, service, connectionName, target.id, target.revision]
      : [...t.values, service, connectionName];
    const retiredValues = [...t.values, service, connectionName, ...retirement.values];
    const results = await this.transaction([
      initializeRetirement(this.scope, service, connectionName, crypto.randomUUID()),
      {
        sql: `update connection_retirements set generation = generation where ${t.sql} and service = ? and connection_name = ?`,
        values: [...t.values, service, connectionName],
      },
      {
        sql: `update connections set revision = revision where ${t.sql} and service = ? and connection_name = ?`,
        values: [...t.values, service, connectionName],
      },
      {
        sql: `update connection_retirements set generation = ? where ${t.sql} and service = ? and connection_name = ? and ${eligible}`,
        values: [generation, ...t.values, service, connectionName, ...eligibilityValues],
      },
      queueSaasConnections(this.scope, `service = ? and connection_name = ? and ${retirement.sql}`, [
        service,
        connectionName,
        ...retirement.values,
      ]),
      {
        sql: `delete from connections where ${t.sql} and service = ? and connection_name = ? and ${retirement.sql} returning id`,
        values: [...t.values, service, connectionName, ...retirement.values],
      },
      {
        sql: `update custom_mcp set sync_connection_id = null, revision = ? where ${t.sql} and service = ?
          and sync_connection_id is not null and not exists (select 1 from connections where id = custom_mcp.sync_connection_id)
          and ${retired}`,
        values: [crypto.randomUUID(), ...t.values, service, ...retiredValues],
      },
      {
        sql: `delete from oauth_states where ${t.sql} and service = ? and connection_name = ? and ${retired}`,
        values: [...t.values, service, connectionName, ...retiredValues],
      },
      {
        sql: `update connection_requests set phase = 'completed', status = 'failed', error_code = 'connection_retired',
          error_message = 'The connection was disconnected during authorization.', value = null, updated_at = ?
          where ${t.sql} and kind = 'local' and service = ? and connection_name = ? and phase in ('pending', 'processing') and ${retired}`,
        values: [Date.now(), ...t.values, service, connectionName, ...retiredValues],
      },
      {
        sql: `select id, revision from connections where ${t.sql} and service = ? and connection_name = ?`,
        values: [...t.values, service, connectionName],
      },
    ]);
    const current = results.at(-1)![0];
    if (target && !results[5]![0] && (current?.id !== target.id || current?.revision !== target.revision))
      throw new ConnectionError("connection_changed", "The connection changed before it could be disconnected.");
    if (current)
      throw new HttpRequestError(
        "connection_has_subscriptions",
        "Cancel or abandon remote Trigger subscriptions before disconnecting this connection.",
        409,
      );
  }
}
