import type { IConnectionStore, StoredConnection, StoredLocalConnection } from "../../connection-service.ts";
import type { ResolvedCredential } from "../../core/types.ts";
import type { ISecretCodec } from "../secrets/secret-codec-core.ts";
import type { RequestTransaction } from "./connection-request-store.ts";
import type { RuntimeRow } from "./runtime-sql.ts";

import { queueSaasConnections, readSaasConnection } from "./saas-project-store.ts";

/** Connection writes share the request transaction so replacing/deleting remote references cannot lose cleanup work. */
export class SqlConnectionStore implements IConnectionStore {
  private readonly transaction: RequestTransaction;
  private readonly codec: ISecretCodec;

  constructor(transaction: RequestTransaction, codec: ISecretCodec) {
    this.transaction = transaction;
    this.codec = codec;
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
    const [[row]] = await this.transaction([
      {
        sql: "select * from connections where service = ? and connection_name = ?",
        values: [service, connectionName],
      },
    ]);
    return row ? this.read(row) : undefined;
  }

  async list(): Promise<StoredConnection[]> {
    const [rows] = await this.transaction([
      { sql: "select * from connections order by service, connection_name", values: [] },
    ]);
    return Promise.all(rows.map((row) => this.read(row)));
  }

  async set(service: string, connectionName: string, credential: ResolvedCredential): Promise<StoredLocalConnection> {
    const value = await this.codec.encode(JSON.stringify(credential));
    const [, [row]] = await this.transaction([
      queueSaasConnections("service = ? and connection_name = ?", [service, connectionName]),
      {
        sql: `insert into connections (id, revision, service, connection_name, value, updated_at)
          values (?, ?, ?, ?, ?, ?) on conflict (service, connection_name) do update set
          revision = excluded.revision, value = excluded.value, updated_at = excluded.updated_at,
          source = 'local', managed_project_id = null, provider_config_id = null, external_user_id = null,
          remote_account_id = null, local_request_id = null returning id, revision`,
        values: [crypto.randomUUID(), crypto.randomUUID(), service, connectionName, value, new Date().toISOString()],
      },
    ]);
    return { id: row.id as string, revision: row.revision as string, service, connectionName, credential };
  }

  async updateCredential(input: StoredLocalConnection): Promise<boolean> {
    const value = await this.codec.encode(JSON.stringify(input.credential));
    const [[row]] = await this.transaction([
      {
        sql: `update connections set revision = ?, value = ?, updated_at = ?
        where service = ? and connection_name = ? and id = ? and revision = ? and source = 'local' returning id`,
        values: [
          crypto.randomUUID(),
          value,
          new Date().toISOString(),
          input.service,
          input.connectionName,
          input.id,
          input.revision,
        ],
      },
    ]);
    return row !== undefined;
  }

  async delete(service: string, connectionName: string): Promise<void> {
    await this.transaction([
      queueSaasConnections("service = ? and connection_name = ?", [service, connectionName]),
      { sql: "delete from connections where service = ? and connection_name = ?", values: [service, connectionName] },
    ]);
  }
}
