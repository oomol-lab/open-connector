import type { TenantScope } from "../../tenant/tenant-scope.ts";
import type { SourceApplication } from "../../triggers/sources/persistent.ts";
import type { TriggerSubscription, TriggerStore } from "../../triggers/store.ts";
import type { ISecretCodec } from "../secrets/secret-codec-core.ts";
import type { RequestTransaction } from "./connection-request-store.ts";
import type { RuntimeRow } from "./runtime-sql.ts";

import { tenantForInsert, tenantPredicate } from "../../tenant/tenant-scope.ts";
import { HttpRequestError } from "../api/http-utils.ts";

export class SqlTriggerStore implements TriggerStore {
  private readonly transaction: RequestTransaction;
  private readonly codec: ISecretCodec;
  private readonly scope: TenantScope;
  constructor(transaction: RequestTransaction, codec: ISecretCodec, scope: TenantScope) {
    this.transaction = transaction;
    this.codec = codec;
    this.scope = scope;
  }

  async getSourceApplication(
    owner: string,
    id: string,
  ): Promise<{ revision: number; application: SourceApplication } | null> {
    const t = tenantPredicate(this.scope);
    const [[row]] = await this.transaction([
      {
        sql: `select revision, value from trigger_source_applications where owner = ? and id = ? and ${t.sql}`,
        values: [owner, id, ...t.values],
      },
    ]);
    return row
      ? {
          revision: Number(row.revision),
          application: JSON.parse(await this.codec.decode(row.value as string)) as SourceApplication,
        }
      : null;
  }

  async saveSourceApplication(
    owner: string,
    id: string,
    revision: number | null,
    application: SourceApplication,
  ): Promise<boolean> {
    const t = tenantPredicate(this.scope);
    const value = await this.codec.encode(JSON.stringify(application));
    const [[row]] = await this.transaction([
      revision === null
        ? {
            sql: "insert into trigger_source_applications (tenant_id, id, owner, revision, value) values (?, ?, ?, 1, ?) on conflict (tenant_id, id) do nothing returning id",
            values: [tenantForInsert(this.scope), id, owner, value],
          }
        : {
            sql: `update trigger_source_applications set revision = revision + 1, value = ? where id = ? and owner = ? and revision = ? and ${t.sql} returning id`,
            values: [value, id, owner, revision, ...t.values],
          },
    ]);
    return !!row;
  }

  private async read(row: RuntimeRow): Promise<TriggerSubscription> {
    return JSON.parse(await this.codec.decode(row.value as string)) as TriggerSubscription;
  }

  async list(): Promise<TriggerSubscription[]> {
    const t = tenantPredicate(this.scope);
    const [rows] = await this.transaction([
      { sql: `select value from trigger_subscriptions where ${t.sql} order by id`, values: [...t.values] },
    ]);
    return Promise.all(rows.map((row) => this.read(row)));
  }

  async listFlowTriggersForMaintenance(now: number, limit: number): Promise<TriggerSubscription[]> {
    const t = tenantPredicate(this.scope);
    const [rows] = await this.transaction([
      {
        sql: `select value from trigger_subscriptions where mode <> 'resource-set'
      and status in ('active', 'deleting') and maintenance_at <= ? and (lease_until is null or lease_until <= ?)
      and ${t.sql}
      order by maintenance_at, id limit ?`,
        values: [now, now, ...t.values, limit],
      },
    ]);
    return Promise.all(rows.map((row) => this.read(row)));
  }

  async getFlowTrigger(id: string): Promise<TriggerSubscription | null> {
    const t = tenantPredicate(this.scope);
    const [[row]] = await this.transaction([
      { sql: `select value from trigger_subscriptions where id = ? and ${t.sql}`, values: [id, ...t.values] },
    ]);
    return row ? this.read(row) : null;
  }

  async insertFlowTrigger(record: TriggerSubscription): Promise<TriggerSubscription> {
    const t = tenantPredicate(this.scope);
    const value = await this.codec.encode(JSON.stringify(record));
    const [, , [row]] = await this.transaction([
      {
        sql: `update connections set revision = revision where id = ? and revision = ? and source = 'local' and ${t.sql} returning id`,
        values: [record.connectionId, record.connectionRevision, ...t.values],
      },
      {
        sql: `update runtime_tokens set name = name where id = ? and ${t.sql} returning id`,
        values: [record.tokenId, ...t.values],
      },
      {
        sql: `insert into trigger_subscriptions (id, tenant_id, mode, token_id, connection_id, trigger_id, status, reconcile_at, value)
        select ?, ?, ?, ?, ?, ?, ?, ?, ? where exists (select 1 from connections where ${t.sql} and id = ? and revision = ? and source = 'local')
        and (? = 'resource-set' or exists (select 1 from runtime_tokens where id = ? and ${t.sql}))
        on conflict (id) do nothing returning value`,
        values: [
          record.id,
          tenantForInsert(this.scope),
          record.mode,
          record.tokenId,
          record.connectionId,
          record.triggerId,
          record.status,
          record.reconcileAt,
          value,
          ...t.values,
          record.connectionId,
          record.connectionRevision,
          record.mode,
          record.tokenId,
          ...t.values,
        ],
      },
    ]);
    const existing = row ? await this.read(row) : await this.getFlowTrigger(record.id);
    if (!existing)
      throw new HttpRequestError(
        "trigger_connection_error",
        "The connection or runtime token changed while creating the subscription.",
        409,
      );
    return existing;
  }

  async claimFlowTrigger(id: string, owner: string, now: number, until: number): Promise<boolean> {
    const t = tenantPredicate(this.scope);
    const [[row]] = await this.transaction([
      {
        sql: `update trigger_subscriptions set lease_owner = ?, lease_until = ?
      where id = ? and (lease_until is null or lease_until <= ?) and ${t.sql} returning id`,
        values: [owner, until, id, now, ...t.values],
      },
    ]);
    return !!row;
  }

  async saveFlowTrigger(record: TriggerSubscription, owner: string, now: number): Promise<boolean> {
    const t = tenantPredicate(this.scope);
    const value = await this.codec.encode(JSON.stringify(record));
    const [[row]] = await this.transaction([
      {
        sql: `update trigger_subscriptions set status = ?, reconcile_at = ?, maintenance_at = ?, value = ?
      where id = ? and lease_owner = ? and lease_until > ? and ${t.sql} returning id`,
        values: [record.status, record.reconcileAt, now + 60_000, value, record.id, owner, now, ...t.values],
      },
    ]);
    return !!row;
  }

  async releaseFlowTrigger(id: string, owner: string): Promise<void> {
    const t = tenantPredicate(this.scope);
    await this.transaction([
      {
        sql: `update trigger_subscriptions set lease_owner = null, lease_until = null where id = ? and lease_owner = ? and ${t.sql}`,
        values: [id, owner, ...t.values],
      },
    ]);
  }
}
