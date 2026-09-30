import type { TriggerSubscription, TriggerStore } from "../../triggers/store.ts";
import type { ISecretCodec } from "../secrets/secret-codec-core.ts";
import type { RequestTransaction } from "./connection-request-store.ts";
import type { RuntimeRow } from "./runtime-sql.ts";

import { HttpRequestError } from "../api/http-utils.ts";

export class SqlTriggerStore implements TriggerStore {
  private readonly transaction: RequestTransaction;
  private readonly codec: ISecretCodec;
  constructor(transaction: RequestTransaction, codec: ISecretCodec) {
    this.transaction = transaction;
    this.codec = codec;
  }

  private async read(row: RuntimeRow): Promise<TriggerSubscription> {
    return JSON.parse(await this.codec.decode(row.value as string)) as TriggerSubscription;
  }

  async list(): Promise<TriggerSubscription[]> {
    const [rows] = await this.transaction([{ sql: "select value from trigger_subscriptions order by id", values: [] }]);
    return Promise.all(rows.map((row) => this.read(row)));
  }

  async listFlowTriggersForMaintenance(now: number, limit: number): Promise<TriggerSubscription[]> {
    const [rows] = await this.transaction([
      {
        sql: `select value from trigger_subscriptions where mode <> 'resource-set'
      and status in ('active', 'deleting') and maintenance_at <= ? and (lease_until is null or lease_until <= ?)
      order by maintenance_at, id limit ?`,
        values: [now, now, limit],
      },
    ]);
    return Promise.all(rows.map((row) => this.read(row)));
  }

  async getFlowTrigger(id: string): Promise<TriggerSubscription | null> {
    const [[row]] = await this.transaction([
      { sql: "select value from trigger_subscriptions where id = ?", values: [id] },
    ]);
    return row ? this.read(row) : null;
  }

  async insertFlowTrigger(record: TriggerSubscription): Promise<TriggerSubscription> {
    const value = await this.codec.encode(JSON.stringify(record));
    const [, , [row]] = await this.transaction([
      {
        sql: "update connections set revision = revision where id = ? and revision = ? and source = 'local' returning id",
        values: [record.connectionId, record.connectionRevision],
      },
      { sql: "update runtime_tokens set name = name where id = ? returning id", values: [record.tokenId] },
      {
        sql: `insert into trigger_subscriptions (id, mode, token_id, connection_id, trigger_id, status, reconcile_at, value)
        select ?, ?, ?, ?, ?, ?, ?, ? where exists (select 1 from connections where id = ? and revision = ? and source = 'local')
        and (? = 'resource-set' or exists (select 1 from runtime_tokens where id = ?))
        on conflict (id) do nothing returning value`,
        values: [
          record.id,
          record.mode,
          record.tokenId,
          record.connectionId,
          record.triggerId,
          record.status,
          record.reconcileAt,
          value,
          record.connectionId,
          record.connectionRevision,
          record.mode,
          record.tokenId,
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
    const [[row]] = await this.transaction([
      {
        sql: `update trigger_subscriptions set lease_owner = ?, lease_until = ?
      where id = ? and (lease_until is null or lease_until <= ?) returning id`,
        values: [owner, until, id, now],
      },
    ]);
    return !!row;
  }

  async saveFlowTrigger(record: TriggerSubscription, owner: string, now: number): Promise<boolean> {
    const value = await this.codec.encode(JSON.stringify(record));
    const [[row]] = await this.transaction([
      {
        sql: `update trigger_subscriptions set status = ?, reconcile_at = ?, maintenance_at = ?, value = ?
      where id = ? and lease_owner = ? and lease_until > ? returning id`,
        values: [record.status, record.reconcileAt, now + 60_000, value, record.id, owner, now],
      },
    ]);
    return !!row;
  }

  async releaseFlowTrigger(id: string, owner: string): Promise<void> {
    await this.transaction([
      {
        sql: "update trigger_subscriptions set lease_owner = null, lease_until = null where id = ? and lease_owner = ?",
        values: [id, owner],
      },
    ]);
  }
}
