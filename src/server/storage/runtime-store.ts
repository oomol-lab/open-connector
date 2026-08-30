import type { ActionPolicyDecision } from "../../core/action-policy.ts";
import type { CredentialProfile } from "../../core/types.ts";
import type { RuntimeTokenRecord } from "./runtime-token-service.ts";

export const DEFAULT_RUN_LIMIT = 5_000;

/** One row a runtime store backend read back from its database driver. */
export type RuntimeRow = Record<string, unknown>;

/** Tables whose `value` column holds a secret JSON document keyed by service. */
export type SecretJsonTable = "oauth_client_configs";

export type RunLogCaller = "http" | "mcp" | "web";

/**
 * One recent action run shown by the local runtime.
 */
export interface RunLog {
  id: string;
  service: string;
  actionId: string;
  caller: RunLogCaller;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  ok: boolean;
  connectionId?: string;
  connectionProfile?: CredentialProfile;
  runtimeTokenId?: string;
  policy?: ActionPolicyDecision;
  inputSummary?: unknown;
  outputSummary?: unknown;
  errorCode?: string;
  errorMessage?: string;
}

export interface RunLogListInput {
  limit?: number;
  cursor?: string;
  service?: string;
  actionId?: string;
  caller?: RunLogCaller;
  ok?: boolean;
}

export interface RunLogPage {
  items: RunLog[];
  nextCursor?: string;
}

export interface RunLogWriteResult {
  retentionApplied: boolean;
}

export interface RunLogCursor {
  startedAt: string;
  id: string;
}

export function encodeRunLogCursor(run: RunLog): string {
  return encodeURIComponent(JSON.stringify({ startedAt: run.startedAt, id: run.id } satisfies RunLogCursor));
}

export function decodeRunLogCursor(cursor: string | undefined): RunLogCursor | undefined {
  if (cursor === undefined || cursor === "") {
    return undefined;
  }

  const value = JSON.parse(decodeURIComponent(cursor)) as Partial<RunLogCursor>;
  if (typeof value.startedAt !== "string" || typeof value.id !== "string") {
    throw new Error("Invalid run log cursor.");
  }

  return {
    startedAt: value.startedAt,
    id: value.id,
  };
}

/**
 * Storage contract for recent action run logs.
 */
export interface IRunLogStore {
  add(run: RunLog): Promise<RunLogWriteResult>;
  get(id: string): Promise<RunLog | undefined>;
  list(input?: RunLogListInput): Promise<RunLogPage>;
}

/** Read a column the query selected as a string, rejecting anything the schema cannot produce. */
export function readString(row: unknown, key: string): string {
  if (typeof row !== "object" || row == null) {
    throw new Error(`Expected a runtime store row for ${key}.`);
  }

  const value = (row as RuntimeRow)[key];
  if (typeof value !== "string") {
    throw new Error(`Expected column ${key} to be a string.`);
  }

  return value;
}

/** Read a nullable string column, treating both SQL null and a missing column as absent. */
export function readOptionalString(row: unknown, key: string): string | undefined {
  if (typeof row !== "object" || row == null) {
    throw new Error(`Expected a runtime store row for ${key}.`);
  }

  const value = (row as RuntimeRow)[key];
  if (value == null) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new Error(`Expected column ${key} to be a string.`);
  }

  return value;
}

export function parseJson<T>(value: string): T {
  return JSON.parse(value) as T;
}

/** Decode a `runs` row, preferring the indexed `service` column over the serialized copy. */
export function readRunLogRow(row: unknown): RunLog {
  const run = parseJson<RunLog>(readString(row, "value"));
  return { ...run, service: readString(row, "service") };
}

export function readRuntimeTokenRow(row: unknown): RuntimeTokenRecord {
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

/** A run log listing query: the SQL text, its bound values, and the page size it was built for. */
export interface RunLogQuery {
  limit: number;
  sql: string;
  values: Array<string | number>;
}

/**
 * Build the `runs` listing query shared by every backend.
 *
 * `placeholder` renders the bind marker for a one-based parameter position, which is `?` on
 * SQLite and D1 and `$n` on PostgreSQL. The query asks for one row more than the page size so
 * the caller can tell a full page from the last one.
 */
export function buildRunLogQuery(
  input: RunLogListInput,
  maxLimit: number,
  placeholder: (position: number) => string,
): RunLogQuery {
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

  return {
    limit,
    sql: `select service, value from runs ${where} order by started_at desc, id desc limit ${bind(limit + 1)}`,
    values,
  };
}

/** Turn the rows of a `buildRunLogQuery` result into one page, dropping the extra lookahead row. */
export function toRunLogPage(rows: readonly unknown[], limit: number): RunLogPage {
  const runs = rows.map(readRunLogRow);
  const items = runs.slice(0, limit);

  return {
    items,
    nextCursor: runs.length > limit && items.length > 0 ? encodeRunLogCursor(items[items.length - 1]) : undefined,
  };
}
