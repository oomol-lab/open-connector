import type { CustomMcpRecord } from "../../custom-mcp/definition.ts";
import type { RequestStatement, RequestTransaction } from "./connection-request-store.ts";

import { customMcpNameKey } from "../../custom-mcp/definition.ts";
import { HttpRequestError } from "../api/http-utils.ts";
import { parseJson, readString } from "./runtime-sql.ts";

interface McpCreate extends Pick<
  CustomMcpRecord,
  "service" | "displayName" | "endpoint" | "transport" | "auth" | "enabled" | "revision"
> {}
interface McpSettingsUpdate extends Pick<CustomMcpRecord, "service" | "revision" | "displayName" | "enabled"> {}
interface McpToolPublication extends Pick<CustomMcpRecord, "service" | "revision" | "actions" | "syncConnectionId"> {
  syncedAt: string;
}
interface McpSyncFailure extends Pick<CustomMcpRecord, "service" | "revision"> {
  syncError: string;
}

/** Persist each service and its tool snapshot atomically using the shared runtime SQL dialect. */
export class CustomMcpStore {
  private readonly transaction: RequestTransaction;

  constructor(transaction: RequestTransaction) {
    this.transaction = transaction;
  }

  async version(): Promise<string> {
    const [rows] = await this.transaction([
      { sql: "select service, revision from custom_mcp order by service", values: [] },
    ]);
    return JSON.stringify(rows.map((row) => [row.service, row.revision]));
  }

  async list(): Promise<CustomMcpRecord[]> {
    const [rows] = await this.transaction([{ sql: "select * from custom_mcp order by service", values: [] }]);
    return rows.map((row) => ({
      service: readString(row, "service"),
      displayName: readString(row, "display_name"),
      endpoint: readString(row, "endpoint"),
      transport: readString(row, "transport") as CustomMcpRecord["transport"],
      auth: parseJson(readString(row, "auth_json")),
      enabled: row.enabled === 1,
      actions: parseJson(readString(row, "actions_json")),
      syncConnectionId: row.sync_connection_id == null ? undefined : readString(row, "sync_connection_id"),
      syncedAt: row.last_synced_at == null ? undefined : readString(row, "last_synced_at"),
      syncError: row.sync_error == null ? undefined : readString(row, "sync_error"),
      revision: readString(row, "revision"),
    }));
  }

  async create(record: McpCreate): Promise<void> {
    await this.write([
      {
        sql: `insert into custom_mcp (service, name_key, display_name, endpoint, transport, auth_json, enabled, actions_json, revision)
        values (?, ?, ?, ?, ?, ?, ?, '[]', ?) on conflict do nothing returning service`,
        values: [
          record.service,
          customMcpNameKey(record.displayName),
          record.displayName,
          record.endpoint,
          record.transport,
          JSON.stringify(record.auth),
          record.enabled ? 1 : 0,
          record.revision,
        ],
      },
    ]);
  }

  async updateSettings(record: McpSettingsUpdate, expectedRevision: string): Promise<void> {
    const nameKey = customMcpNameKey(record.displayName);
    await this.write([
      {
        sql: `update custom_mcp set name_key = ?, display_name = ?, enabled = ?, revision = ?
        where service = ? and revision = ? and not exists (select 1 from custom_mcp where name_key = ? and service <> ?) returning service`,
        values: [
          nameKey,
          record.displayName,
          record.enabled ? 1 : 0,
          record.revision,
          record.service,
          expectedRevision,
          nameKey,
          record.service,
        ],
      },
    ]);
  }

  async publishTools(record: McpToolPublication, expectedRevision: string): Promise<void> {
    await this.write([
      // Match connection deletion's lock order so it cannot leave a stale sync reference.
      {
        sql: "update connections set revision = revision where id = ? and service = ?",
        values: [record.syncConnectionId ?? null, record.service],
      },
      {
        sql: `update custom_mcp set actions_json = ?, sync_connection_id = (select id from connections where id = ? and service = ?),
          last_synced_at = ?, sync_error = null, revision = ? where service = ? and revision = ? returning service`,
        values: [
          JSON.stringify(record.actions),
          record.syncConnectionId ?? null,
          record.service,
          record.syncedAt,
          record.revision,
          record.service,
          expectedRevision,
        ],
      },
    ]);
  }

  async recordSyncFailure(record: McpSyncFailure, expectedRevision: string): Promise<void> {
    await this.write([
      {
        sql: "update custom_mcp set sync_error = ?, revision = ? where service = ? and revision = ? returning service",
        values: [record.syncError, record.revision, record.service, expectedRevision],
      },
    ]);
  }

  private async write(statements: RequestStatement[]): Promise<void> {
    const results = await this.transaction(statements);
    if (!results.at(-1)?.length)
      throw new HttpRequestError(
        "custom_mcp_conflict",
        "The MCP service changed or its name or identifier is already in use. Reload and try again.",
        409,
      );
  }

  async delete(service: string, revision: string): Promise<void> {
    const [[deleted]] = await this.transaction([
      {
        sql: "delete from custom_mcp where service = ? and revision = ? and not exists (select 1 from connections where service = ?) returning service",
        values: [service, revision, service],
      },
    ]);
    if (!deleted)
      throw new HttpRequestError(
        "custom_mcp_in_use",
        "Remove the service connections first, then reload and try again.",
        409,
      );
  }
}
