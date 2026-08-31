/**
 * Row decoding and query helpers shared by the SQL-backed runtime stores (SQLite, PostgreSQL and D1).
 */
import type { RuntimePolicyRecord } from "./runtime-policy-store.ts";
import type { RunLog, RunLogListInput, RunLogPage } from "./runtime-store.ts";
import type { RuntimeTokenRecord } from "./runtime-token-service.ts";

import { decodeRunLogCursor, encodeRunLogCursor } from "./runtime-store.ts";

/** One row a runtime store backend read back from its database driver. */
export type RuntimeRow = Record<string, unknown>;

/** The `runtime_tokens` columns every token query reads back, in the order `readRuntimeTokenRow` decodes. */
export const runtimeTokenColumns =
  "id, name, token_hash, allowed_actions, blocked_actions, allowed_proxies, allowed_connections, created_at, last_used_at";

/** Read a column the query selected as a string, rejecting anything the schema cannot produce. */
export function readString(row: RuntimeRow, key: string): string {
  const value = row[key];
  if (typeof value !== "string") {
    throw new Error(`Expected column ${key} to be a string.`);
  }

  return value;
}

/** Read a nullable string column, treating both SQL null and a missing column as absent. */
function readOptionalString(row: RuntimeRow, key: string): string | undefined {
  return row[key] == null ? undefined : readString(row, key);
}

/** Parse a JSON column, trusting the shape the store wrote. */
export function parseJson<T>(value: string): T {
  return JSON.parse(value) as T;
}

/** Decode a `runs` row, preferring the indexed `service` column over the serialized copy. */
export function readRunLogRow(row: RuntimeRow): RunLog {
  const run = parseJson<RunLog>(readString(row, "value"));
  return { ...run, service: readString(row, "service") };
}

/** Decode a `runtime_tokens` row into the record the token service stores. */
export function readRuntimeTokenRow(row: RuntimeRow): RuntimeTokenRecord {
  return {
    id: readString(row, "id"),
    name: readString(row, "name"),
    tokenHash: readString(row, "token_hash"),
    allowedActions: parseJson(readString(row, "allowed_actions")),
    blockedActions: parseJson(readString(row, "blocked_actions")),
    allowedProxies: parseJson(readString(row, "allowed_proxies")),
    allowedConnections: parseJson(readOptionalString(row, "allowed_connections") ?? "[]"),
    createdAt: readString(row, "created_at"),
    lastUsedAt: readOptionalString(row, "last_used_at"),
  };
}

/** Decode the single `runtime_policy` row into the record the policy store returns. */
export function readRuntimePolicyRow(row: RuntimeRow): RuntimePolicyRecord {
  return {
    rules: parseJson(readString(row, "value")),
    updatedAt: readString(row, "updated_at"),
  };
}

/**
 * List one page of `runs` with the query shared by every backend.
 *
 * `placeholder` renders the bind marker for a one-based parameter position, which is `?` on
 * SQLite and D1 and `$n` on PostgreSQL. The query asks for one row more than the page size so
 * the caller can tell a full page from the last one. `execute` runs the finished SQL against the
 * backend, synchronously or asynchronously, and returns the raw rows including that lookahead row.
 */
export async function listRunLogs(
  input: RunLogListInput,
  maxLimit: number,
  placeholder: (position: number) => string,
  execute: (sql: string, values: Array<string | number>) => readonly RuntimeRow[] | Promise<readonly RuntimeRow[]>,
): Promise<RunLogPage> {
  const limit = Math.max(1, Math.min(input.limit ?? maxLimit, maxLimit));
  const cursor = decodeRunLogCursor(input.cursor);
  const conditions: string[] = [];
  const values: Array<string | number> = [];
  const bind = (value: string | number): string => placeholder(values.push(value));
  if (cursor) {
    conditions.push(
      `(started_at < ${bind(cursor.startedAt)} or (started_at = ${bind(cursor.startedAt)} and id < ${bind(cursor.id)}))`,
    );
  }
  if (input.service) {
    conditions.push(`service = ${bind(input.service)}`);
  }
  if (input.actionId) {
    conditions.push(`action_id = ${bind(input.actionId)}`);
  }
  if (input.caller) {
    conditions.push(`caller = ${bind(input.caller)}`);
  }
  if (input.ok !== undefined) {
    conditions.push(`ok = ${bind(input.ok ? 1 : 0)}`);
  }
  const where = conditions.length > 0 ? `where ${conditions.join(" and ")}` : "";
  const sql = `select service, value from runs ${where} order by started_at desc, id desc limit ${bind(limit + 1)}`;

  const runs = (await execute(sql, values)).map(readRunLogRow);
  const items = runs.slice(0, limit);

  return {
    items,
    nextCursor: runs.length > limit && items.length > 0 ? encodeRunLogCursor(items[items.length - 1]) : undefined,
  };
}
