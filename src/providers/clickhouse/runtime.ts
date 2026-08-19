import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { Buffer } from "node:buffer";
import { compactObject, optionalInteger, optionalNumber, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

const clickhouseDefaultRequestTimeoutMs = 30_000;
const clickhouseDefaultDatabase = "default";
const clickhouseValidationQuery = "SELECT currentDatabase() AS database, version() AS version";

type ClickhouseQueryParameter = string | number | boolean;
type ClickhouseActionHandler = (input: Record<string, unknown>, context: ClickhouseActionContext) => Promise<unknown>;
type ClickhouseJsonPayload = Record<string, unknown> & {
  meta?: unknown;
  data?: unknown;
  rows?: unknown;
  statistics?: unknown;
};

interface ClickhouseRequestInput {
  query: string;
  context: ClickhouseActionContext;
  phase: "validate" | "execute";
  database?: string;
  parameters?: Record<string, ClickhouseQueryParameter>;
  settings?: Record<string, ClickhouseQueryParameter>;
  maxExecutionTime?: number;
}

interface NormalizedClickhouseTable {
  database: string;
  name: string;
  engine: string | null;
  isTemporary: boolean;
  primaryKey: string | null;
  sortingKey: string | null;
  partitionKey: string | null;
  columns: string[];
  totalRows: number | null;
  totalBytes: number | null;
  raw: Record<string, unknown>;
}

export interface ClickhouseActionContext {
  baseUrl: string;
  username: string;
  password: string;
  defaultDatabase: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

export const clickhouseActionHandlers: ProviderActionHandlers<"clickhouse", ClickhouseActionHandler> = {
  execute_query(input, context) {
    return executeQuery(input, context);
  },
  list_databases(input, context) {
    return listDatabases(input, context);
  },
  list_tables(input, context) {
    return listTables(input, context);
  },
  get_table_schema(input, context) {
    return getTableSchema(input, context);
  },
  get_database_schema(input, context) {
    return getDatabaseSchema(input, context);
  },
};

export async function validateClickhouseCredential(
  input: Record<string, string>,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const context = createClickhouseContext(input, fetcher, signal);
  const payload = await requestClickhouseJson({
    query: clickhouseValidationQuery,
    context,
    phase: "validate",
  });
  const firstRow = normalizeQueryRows(payload)[0];
  const version = optionalString(firstRow?.version);
  const database = optionalString(firstRow?.database) ?? context.defaultDatabase;
  const baseUrl = context.baseUrl;

  return {
    profile: {
      accountId: `${baseUrl}:${context.username}`,
      displayName: `${context.username}@${new URL(baseUrl).host}`,
    },
    grantedScopes: [],
    metadata: compactObject({
      baseUrl,
      username: context.username,
      defaultDatabase: database,
      version,
    }),
  };
}

export function createClickhouseContext(
  input: Record<string, string>,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): ClickhouseActionContext {
  return {
    baseUrl: normalizeClickhouseBaseUrl(input.baseUrl),
    username: requireCredentialString(input.username, "username"),
    password: requireCredentialString(input.password, "password"),
    defaultDatabase: readDefaultDatabase(input.defaultDatabase),
    fetcher,
    signal,
  };
}

async function executeQuery(input: Record<string, unknown>, context: ClickhouseActionContext): Promise<unknown> {
  const payload = await requestClickhouseJson({
    query: requireInputString(input.query, "query"),
    database: optionalString(input.database) ?? context.defaultDatabase,
    settings: readClickhouseSettings(input.settings),
    maxExecutionTime: optionalInteger(input.maxExecutionTime),
    context,
    phase: "execute",
  });

  return normalizeQueryOutput(payload);
}

async function listDatabases(input: Record<string, unknown>, context: ClickhouseActionContext): Promise<unknown> {
  const includeTables = input.includeTables === true;
  const payload = await requestClickhouseJson({
    query: includeTables
      ? [
          "SELECT d.name, d.engine, toString(d.uuid) AS uuid, groupArray(t.name) AS tables",
          "FROM system.databases AS d",
          "LEFT JOIN system.tables AS t ON t.database = d.name",
          "WHERE ({pattern:String} = '' OR d.name LIKE {pattern:String})",
          "GROUP BY d.name, d.engine, d.uuid",
          "ORDER BY d.name",
        ].join(" ")
      : [
          "SELECT name, engine, toString(uuid) AS uuid",
          "FROM system.databases",
          "WHERE ({pattern:String} = '' OR name LIKE {pattern:String})",
          "ORDER BY name",
        ].join(" "),
    parameters: {
      pattern: optionalString(input.pattern) ?? "",
    },
    context,
    phase: "execute",
  });
  const databases = normalizeQueryRows(payload).map((row) => ({
    name: requireResponseString(row.name, "database name"),
    engine: optionalString(row.engine) ?? null,
    uuid: optionalString(row.uuid) ?? null,
    tables: readStringArray(row.tables),
    raw: row,
  }));

  return {
    databases,
    total: databases.length,
    raw: payload,
  };
}

async function listTables(input: Record<string, unknown>, context: ClickhouseActionContext): Promise<unknown> {
  const database = optionalString(input.database) ?? "";
  const pattern = optionalString(input.pattern) ?? "";
  const includeViews = input.includeViews !== false;
  const includeColumns = input.includeColumns === true;
  const includePrimaryKey = input.includePrimaryKey === true;
  const payload = await requestClickhouseJson({
    query: [
      "SELECT database, name, engine, is_temporary, total_rows, total_bytes,",
      "primary_key, sorting_key, partition_key",
      "FROM system.tables",
      "WHERE ({database:String} = '' OR database = {database:String})",
      "AND ({pattern:String} = '' OR name LIKE {pattern:String})",
      "AND is_temporary = 0",
      "AND ({include_views:UInt8} = 1",
      "OR engine NOT IN ('View', 'MaterializedView', 'LiveView', 'WindowView'))",
      "ORDER BY database, name",
    ].join(" "),
    parameters: {
      database,
      pattern,
      include_views: clickhouseFlagParameter(includeViews),
    },
    context,
    phase: "execute",
  });
  const columnsByTable = includeColumns
    ? await fetchColumnNamesByTable({
        database,
        pattern,
        includeViews,
        context,
      })
    : new Map<string, string[]>();
  const tables = normalizeTableRows(normalizeQueryRows(payload), {
    includePrimaryKey,
    columnsByTable,
  });

  return {
    tables,
    total: tables.length,
    raw: payload,
  };
}

async function getTableSchema(input: Record<string, unknown>, context: ClickhouseActionContext): Promise<unknown> {
  const database = optionalString(input.database) ?? context.defaultDatabase;
  const table = requireInputString(input.table, "table");
  const tablePayload = await requestClickhouseJson({
    query: [
      "SELECT database, name, engine, is_temporary, total_rows, total_bytes,",
      "primary_key, sorting_key, partition_key",
      "FROM system.tables",
      "WHERE database = {database:String} AND name = {table:String}",
      "LIMIT 1",
    ].join(" "),
    parameters: { database, table },
    context,
    phase: "execute",
  });
  const tableInfo = normalizeTableRows(normalizeQueryRows(tablePayload), { includePrimaryKey: true })[0];
  if (!tableInfo) {
    throw new ProviderRequestError(400, `ClickHouse table not found: ${database}.${table}`);
  }

  const columnsPayload = await requestClickhouseJson({
    query: [
      "SELECT name, type, default_kind, default_expression, comment,",
      "compression_codec, is_in_primary_key, is_in_sorting_key",
      "FROM system.columns",
      "WHERE database = {database:String} AND table = {table:String}",
      "ORDER BY position",
    ].join(" "),
    parameters: { database, table },
    context,
    phase: "execute",
  });
  const rows = normalizeQueryRows(columnsPayload);
  const samplePayload =
    input.includeSampleData === true
      ? await requestClickhouseJson({
          query: ["SELECT *", "FROM {database:Identifier}.{table:Identifier}", "LIMIT {limit:UInt64}"].join(" "),
          parameters: {
            database,
            table,
            limit: optionalInteger(input.sampleRows) ?? 5,
          },
          context,
          phase: "execute",
        })
      : undefined;

  return {
    database,
    table,
    engine: tableInfo.engine,
    primaryKey: tableInfo.primaryKey,
    sortingKey: tableInfo.sortingKey,
    partitionKey: tableInfo.partitionKey,
    totalRows: tableInfo.totalRows,
    totalBytes: tableInfo.totalBytes,
    columns: rows.map((row) => ({
      name: requireResponseString(row.name, "column name"),
      type: requireResponseString(row.type, "column type"),
      defaultKind: optionalString(row.default_kind) ?? null,
      defaultExpression: optionalString(row.default_expression) ?? null,
      comment: optionalString(row.comment) ?? null,
      compressionCodec: optionalString(row.compression_codec) ?? null,
      isInPrimaryKey: readClickhouseFlag(row.is_in_primary_key),
      isInSortingKey: readClickhouseFlag(row.is_in_sorting_key),
      raw: row,
    })),
    sampleData: samplePayload ? normalizeQueryRows(samplePayload) : [],
    raw: compactObject({
      table: tablePayload,
      columns: columnsPayload,
      sample: samplePayload,
    }),
  };
}

async function getDatabaseSchema(input: Record<string, unknown>, context: ClickhouseActionContext): Promise<unknown> {
  const database = optionalString(input.database) ?? context.defaultDatabase;
  const includeTableSchemas = input.includeTableSchemas === true;
  await ensureDatabaseExists(database, context);
  const tablesPayload = await requestClickhouseJson({
    query: [
      "SELECT database, name, engine, is_temporary, total_rows, total_bytes,",
      "primary_key, sorting_key, partition_key",
      "FROM system.tables",
      "WHERE database = {database:String}",
      "ORDER BY name",
    ].join(" "),
    parameters: { database },
    context,
    phase: "execute",
  });
  const columnsPayload = includeTableSchemas
    ? await requestClickhouseJson({
        query: [
          "SELECT table, name",
          "FROM system.columns",
          "WHERE database = {database:String}",
          "ORDER BY table, position",
        ].join(" "),
        parameters: { database },
        context,
        phase: "execute",
      })
    : undefined;
  const columnsByTable = columnsPayload
    ? groupColumnNamesByTable(normalizeQueryRows(columnsPayload), { database })
    : new Map<string, string[]>();
  const tables = normalizeTableRows(normalizeQueryRows(tablesPayload), {
    includePrimaryKey: true,
    columnsByTable,
  });

  return {
    database,
    tables,
    totalTables: tables.length,
    totalRows: sumTableMetric(tables, "totalRows"),
    totalBytes: sumTableMetric(tables, "totalBytes"),
    raw: compactObject({
      tables: tablesPayload,
      columns: columnsPayload,
    }),
  };
}

async function ensureDatabaseExists(database: string, context: ClickhouseActionContext): Promise<void> {
  const payload = await requestClickhouseJson({
    query: "SELECT name FROM system.databases WHERE name = {database:String} LIMIT 1",
    parameters: { database },
    context,
    phase: "execute",
  });
  if (normalizeQueryRows(payload).length === 0) {
    throw new ProviderRequestError(400, `ClickHouse database not found: ${database}`);
  }
}

async function requestClickhouseJson(input: ClickhouseRequestInput): Promise<ClickhouseJsonPayload> {
  const timeout = createProviderTimeout(input.context.signal, clickhouseDefaultRequestTimeoutMs);
  const url = new URL(input.context.baseUrl);
  url.searchParams.set("default_format", "JSON");
  url.searchParams.set("database", input.database ?? input.context.defaultDatabase);
  for (const [key, value] of Object.entries(input.parameters ?? {})) {
    url.searchParams.set(`param_${key}`, String(value));
  }
  for (const [key, value] of Object.entries(input.settings ?? {})) {
    url.searchParams.set(key, String(value));
  }
  if (input.maxExecutionTime !== undefined) {
    url.searchParams.set("max_execution_time", String(input.maxExecutionTime));
  }

  try {
    const response = await input.context.fetcher(url.toString(), {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: buildBasicAuthorizationHeader(input.context.username, input.context.password),
        "content-type": "text/plain; charset=utf-8",
        "user-agent": providerUserAgent,
      },
      body: input.query,
      signal: timeout.signal,
    });
    const text = await response.text();
    if (!response.ok) {
      throw createClickhouseError(response.status, text, input.phase);
    }
    if (!text.trim()) {
      throw new ProviderRequestError(502, "ClickHouse returned an empty response");
    }
    return parseClickhouseJson(text);
  } catch (error) {
    if (isAbortLikeError(error) && timeout.didTimeout()) {
      throw new ProviderRequestError(504, "ClickHouse request timed out after 30 seconds");
    }
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error && error.message
        ? `ClickHouse request failed: ${error.message}`
        : "ClickHouse request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

function normalizeQueryOutput(payload: ClickhouseJsonPayload): Record<string, unknown> {
  const rows = normalizeQueryRows(payload);
  const statistics = optionalRecord(payload.statistics) ?? {};
  return {
    rows,
    rowCount: optionalInteger(payload.rows) ?? rows.length,
    columns: readQueryMeta(payload.meta),
    statistics: {
      elapsed: optionalNumber(statistics.elapsed) ?? null,
      rowsRead: optionalInteger(statistics.rows_read) ?? null,
      bytesRead: optionalInteger(statistics.bytes_read) ?? null,
    },
    raw: payload,
  };
}

function parseClickhouseJson(text: string): ClickhouseJsonPayload {
  try {
    const parsed = JSON.parse(text) as unknown;
    const record = optionalRecord(parsed);
    if (!record) {
      throw new ProviderRequestError(502, "ClickHouse returned invalid JSON");
    }
    return record as ClickhouseJsonPayload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(502, "ClickHouse returned invalid JSON");
  }
}

function createClickhouseError(
  status: number,
  responseText: string,
  phase: "validate" | "execute",
): ProviderRequestError {
  const message = responseText.trim() || `ClickHouse request failed with ${status}`;
  if (phase === "validate" && [400, 401, 403].includes(status)) {
    return new ProviderRequestError(400, message);
  }
  if ([400, 404, 422].includes(status)) {
    return new ProviderRequestError(400, message);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message);
  }
  return new ProviderRequestError(status || 500, message);
}

function normalizeClickhouseBaseUrl(value: unknown): string {
  const raw = requireCredentialString(value, "baseUrl");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ProviderRequestError(400, "baseUrl must be a valid URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ProviderRequestError(400, "baseUrl must use http or https");
  }
  url.hash = "";
  return url.toString();
}

function readClickhouseSettings(value: unknown): Record<string, ClickhouseQueryParameter> | undefined {
  const record = optionalRecord(value);
  if (!record) {
    return undefined;
  }
  const settings: Record<string, ClickhouseQueryParameter> = {};
  for (const [key, settingValue] of Object.entries(record)) {
    if (typeof settingValue === "string" || typeof settingValue === "number" || typeof settingValue === "boolean") {
      settings[key] = settingValue;
    }
  }
  return Object.keys(settings).length > 0 ? settings : undefined;
}

function normalizeQueryRows(payload: ClickhouseJsonPayload): Record<string, unknown>[] {
  if (!Array.isArray(payload.data)) {
    return [];
  }
  return payload.data.flatMap((value) => {
    const record = optionalRecord(value);
    return record ? [record] : [];
  });
}

function readQueryMeta(value: unknown): Array<{ name: string; type: string }> {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    const record = optionalRecord(item);
    const name = optionalString(record?.name);
    const type = optionalString(record?.type);
    return name && type ? [{ name, type }] : [];
  });
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => optionalString(item)).filter((item): item is string => Boolean(item));
}

function normalizeTableRows(
  rows: Record<string, unknown>[],
  options: {
    includePrimaryKey: boolean;
    columnsByTable?: Map<string, string[]>;
  },
): NormalizedClickhouseTable[] {
  return rows.map((row) => {
    const database = requireResponseString(row.database, "table database");
    const name = requireResponseString(row.name, "table name");
    return {
      database,
      name,
      engine: optionalString(row.engine) ?? null,
      isTemporary: readClickhouseFlag(row.is_temporary),
      primaryKey: options.includePrimaryKey ? (optionalString(row.primary_key) ?? null) : null,
      sortingKey: options.includePrimaryKey ? (optionalString(row.sorting_key) ?? null) : null,
      partitionKey: options.includePrimaryKey ? (optionalString(row.partition_key) ?? null) : null,
      columns: options.columnsByTable?.get(tableMapKey(database, name)) ?? [],
      totalRows: optionalInteger(row.total_rows) ?? null,
      totalBytes: optionalInteger(row.total_bytes) ?? null,
      raw: row,
    };
  });
}

async function fetchColumnNamesByTable(input: {
  database: string;
  pattern: string;
  includeViews: boolean;
  context: ClickhouseActionContext;
}): Promise<Map<string, string[]>> {
  const payload = await requestClickhouseJson({
    query: [
      "SELECT c.database, c.table, c.name",
      "FROM system.columns AS c",
      "INNER JOIN system.tables AS t ON t.database = c.database AND t.name = c.table",
      "WHERE ({database:String} = '' OR c.database = {database:String})",
      "AND ({pattern:String} = '' OR c.table LIKE {pattern:String})",
      "AND t.is_temporary = 0",
      "AND ({include_views:UInt8} = 1",
      "OR t.engine NOT IN ('View', 'MaterializedView', 'LiveView', 'WindowView'))",
      "ORDER BY c.database, c.table, c.position",
    ].join(" "),
    parameters: {
      database: input.database,
      pattern: input.pattern,
      include_views: clickhouseFlagParameter(input.includeViews),
    },
    context: input.context,
    phase: "execute",
  });
  return groupColumnNamesByTable(normalizeQueryRows(payload));
}

function groupColumnNamesByTable(
  rows: Record<string, unknown>[],
  options: { database?: string } = {},
): Map<string, string[]> {
  const columnsByTable = new Map<string, string[]>();
  for (const row of rows) {
    const database = optionalString(row.database) ?? options.database;
    const table = optionalString(row.table);
    const name = optionalString(row.name);
    if (!database || !table || !name) {
      continue;
    }
    const key = tableMapKey(database, table);
    const columns = columnsByTable.get(key);
    if (columns) {
      columns.push(name);
    } else {
      columnsByTable.set(key, [name]);
    }
  }
  return columnsByTable;
}

function tableMapKey(database: string, table: string): string {
  return `${database}\u0000${table}`;
}

function sumTableMetric(tables: NormalizedClickhouseTable[], key: "totalRows" | "totalBytes"): number | null {
  let total = 0;
  for (const table of tables) {
    const value = table[key];
    if (value == null) {
      return null;
    }
    total += value;
  }
  return total;
}

function clickhouseFlagParameter(value: boolean): number {
  return value ? 1 : 0;
}

function readClickhouseFlag(value: unknown): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value !== 0;
  }
  const stringValue = optionalString(value);
  return stringValue === "1" || stringValue?.toLowerCase() === "true";
}

function readDefaultDatabase(value: unknown): string {
  return optionalString(value) ?? clickhouseDefaultDatabase;
}

function requireCredentialString(value: unknown, fieldName: string): string {
  const trimmed = optionalString(value);
  if (!trimmed) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return trimmed;
}

function requireInputString(value: unknown, fieldName: string): string {
  const trimmed = optionalString(value);
  if (!trimmed) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return trimmed;
}

function requireResponseString(value: unknown, fieldName: string): string {
  const trimmed = optionalString(value);
  if (!trimmed) {
    throw new ProviderRequestError(502, `ClickHouse field ${fieldName} is missing`);
  }
  return trimmed;
}

function buildBasicAuthorizationHeader(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
}
