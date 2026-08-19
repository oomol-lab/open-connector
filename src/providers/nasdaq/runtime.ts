import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString } from "../../core/cast.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

export const nasdaqApiBaseUrl = "https://data.nasdaq.com/api/v3";

type QueryValue = string | number | boolean | undefined;
type NasdaqRequestPhase = "validate" | "execute";
type NasdaqDatatableScalar = string | number | boolean | null;
type NasdaqDatatableRow = Record<string, NasdaqDatatableScalar>;
type NasdaqActionContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
type NasdaqActionHandler = (input: Record<string, unknown>, context: NasdaqActionContext) => Promise<unknown>;

const defaultDividendColumns = [
  "ticker",
  "dimension",
  "calendardate",
  "datekey",
  "dps",
  "divyield",
  "payoutratio",
  "ncfdiv",
].join(",");

const defaultQuoteColumns = ["ticker", "date", "open", "high", "low", "close", "volume", "dividend", "split"].join(",");

export const nasdaqActionHandlers: ProviderActionHandlers<"nasdaq", NasdaqActionHandler> = {
  get_datatable_metadata(input, context) {
    return executeGetDatatableMetadata(input, context);
  },
  get_datatable(input, context) {
    return executeGetDatatable(input, context);
  },
  get_table_row(input, context) {
    return executeGetTableRow(input, context);
  },
  get_dividend_history(input, context) {
    return executeGetDividendHistory(input, context);
  },
  get_analyst_ratings(input, context) {
    return executeGetAnalystRatings(input, context);
  },
  get_end_of_day_quote(input, context) {
    return executeGetEndOfDayQuote(input, context);
  },
  get_real_time_quote(input, context) {
    return executeGetEndOfDayQuote(input, context);
  },
};

export async function validateNasdaqCredential(
  input: { apiKey: string },
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  await nasdaqGet(
    buildDatatableDataPath("SHARADAR/TICKERS"),
    {
      ticker: "AAPL",
      "qopts.columns": "ticker",
    },
    {
      apiKey: input.apiKey,
      fetcher,
      signal,
    },
    "validate",
  );

  return {
    profile: {
      accountId: "api_key",
      displayName: "Nasdaq Data Link API Key",
    },
    grantedScopes: [],
    metadata: {
      validationEndpoint: "/datatables/SHARADAR/TICKERS.json",
      apiBaseUrl: nasdaqApiBaseUrl,
    },
  };
}

async function executeGetDatatableMetadata(
  input: Record<string, unknown>,
  context: NasdaqActionContext,
): Promise<unknown> {
  const payload = readRequiredObject(
    await nasdaqGet(buildDatatableMetadataPath(readRequiredDatatableCode(input)), {}, context, "execute"),
    "response",
  );

  const datatable = readRequiredObject(payload.datatable, "datatable");
  return {
    vendorCode: readRequiredString(datatable.vendor_code, "datatable.vendor_code"),
    datatableCode: readRequiredString(datatable.datatable_code, "datatable.datatable_code"),
    name: readRequiredString(datatable.name, "datatable.name"),
    description: readNullableString(datatable.description),
    columns: readRequiredArray(datatable.columns, "datatable.columns").map((item, index) =>
      normalizeColumn(readRequiredObject(item, `datatable.columns[${index}]`)),
    ),
    filters: readRequiredArray(datatable.filters, "datatable.filters").map((item, index) =>
      readRequiredString(item, `datatable.filters[${index}]`),
    ),
    primaryKey: readRequiredArray(datatable.primary_key, "datatable.primary_key").map((item, index) =>
      readRequiredString(item, `datatable.primary_key[${index}]`),
    ),
    premium: readRequiredBoolean(datatable.premium, "datatable.premium"),
    status: normalizeStatus(readRequiredObject(datatable.status, "datatable.status")),
    dataVersion: datatable.data_version
      ? normalizeDataVersion(readRequiredObject(datatable.data_version, "datatable.data_version"))
      : null,
  };
}

async function executeGetDatatable(input: Record<string, unknown>, context: NasdaqActionContext): Promise<unknown> {
  const payload = readRequiredObject(
    await nasdaqGet(
      buildDatatableDataPath(readRequiredDatatableCode(input)),
      {
        "qopts.export": true,
      },
      context,
      "execute",
    ),
    "response",
  );

  const bulkDownload = readRequiredObject(payload.datatable_bulk_download, "datatable_bulk_download");
  const file = readRequiredObject(bulkDownload.file, "datatable_bulk_download.file");
  const datatable = optionalRecord(bulkDownload.datatable);

  return {
    file: {
      link: readNullableString(file.link),
      status: readRequiredString(file.status, "datatable_bulk_download.file.status"),
      dataSnapshotTime: readNullableString(file.data_snapshot_time),
    },
    datatable: datatable
      ? {
          lastRefreshedTime: readNullableString(datatable.last_refreshed_time),
        }
      : null,
  };
}

function executeGetTableRow(input: Record<string, unknown>, context: NasdaqActionContext): Promise<unknown> {
  const datatableCode = readDatatableCodeForRowQuery(input);
  const filterColumnName = readRequiredInputString(input, "filterColumnName");
  const filterColumnValue = readRequiredInputString(input, "filterColumnValue");

  return executeDatatableQuery(
    datatableCode,
    compactObject({
      [filterColumnName]: filterColumnValue,
      "qopts.columns": readOptionalColumns(input),
      "qopts.per_page": readOptionalInputInteger(input, "perPage"),
      "qopts.cursor_id": readOptionalInputString(input, "cursorId"),
    }),
    context,
  );
}

function executeGetDividendHistory(input: Record<string, unknown>, context: NasdaqActionContext): Promise<unknown> {
  return executeDatatableQuery(
    "SHARADAR/SF1",
    compactObject({
      ticker: readRequiredInputString(input, "ticker"),
      dimension: "ARQ",
      datekey: readOptionalInputString(input, "date"),
      "qopts.columns": readOptionalColumns(input) ?? defaultDividendColumns,
      "qopts.per_page": readOptionalInputInteger(input, "perPage"),
      "qopts.cursor_id": readOptionalInputString(input, "cursorId"),
    }),
    context,
  );
}

async function executeGetAnalystRatings(
  input: Record<string, unknown>,
  context: NasdaqActionContext,
): Promise<unknown> {
  const symbol = readRequiredInputString(input, "symbol");
  const analystRatings = await executeDatatableQuery("ZACKS/AR", { ticker: symbol }, context);
  const targetPrices = await executeDatatableQuery("ZACKS/TP", { ticker: symbol }, context);

  return {
    analystRatings,
    targetPrices,
  };
}

async function executeGetEndOfDayQuote(input: Record<string, unknown>, context: NasdaqActionContext): Promise<unknown> {
  const result = await executeDatatableQuery(
    "QUOTEMEDIA/PRICES",
    compactObject({
      ticker: readRequiredInputString(input, "ticker"),
      "date.gte": readOptionalInputString(input, "dateGte"),
      "date.lte": readOptionalInputString(input, "dateLte"),
      "qopts.columns": defaultQuoteColumns,
      "qopts.per_page": readOptionalInputInteger(input, "perPage"),
      "qopts.cursor_id": readOptionalInputString(input, "cursorId"),
    }),
    context,
  );

  return {
    quotes: result.rows.map((row) => normalizeQuoteRow(row)),
    nextCursorId: result.nextCursorId,
  };
}

async function executeDatatableQuery(
  datatableCode: string,
  query: Record<string, QueryValue>,
  context: NasdaqActionContext,
): Promise<{
  columns: Array<{ name: string; type: string }>;
  rows: NasdaqDatatableRow[];
  nextCursorId: string | null;
}> {
  const payload = readRequiredObject(
    await nasdaqGet(buildDatatableDataPath(datatableCode), query, context, "execute"),
    "response",
  );

  const datatable = readRequiredObject(payload.datatable, "datatable");
  const columns = readRequiredArray(datatable.columns, "datatable.columns").map((item, index) =>
    normalizeColumn(readRequiredObject(item, `datatable.columns[${index}]`)),
  );
  const rawRows = readRequiredArray(datatable.data, "datatable.data");
  const rows = rawRows.map((row, index) =>
    normalizeDatatableRow(readRequiredArray(row, `datatable.data[${index}]`), columns, index),
  );
  const meta = optionalRecord(payload.meta);

  return {
    columns,
    rows,
    nextCursorId: meta ? readNullableString(meta.next_cursor_id) : null,
  };
}

async function nasdaqGet(
  path: string,
  query: Record<string, QueryValue>,
  context: NasdaqActionContext,
  phase: NasdaqRequestPhase,
): Promise<unknown> {
  const url = new URL(toRelativePath(path), `${nasdaqApiBaseUrl}/`);
  for (const [key, value] of Object.entries(compactObject({ ...query, api_key: context.apiKey }))) {
    url.searchParams.set(key, String(value));
  }

  let response: Response;
  let payload: unknown;
  try {
    response = await context.fetcher(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
        "x-api-token": context.apiKey,
      },
      signal: context.signal,
    });
    payload = await readNasdaqPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Nasdaq request failed: ${error.message}` : "Nasdaq request failed",
    );
  }

  if (!response.ok || hasNasdaqError(payload)) {
    throw createNasdaqError(response, payload, phase);
  }

  return payload;
}

async function readNasdaqPayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createNasdaqError(response: Response, payload: unknown, phase: NasdaqRequestPhase): ProviderRequestError {
  const message = extractNasdaqErrorMessage(payload) ?? response.statusText ?? "Nasdaq request failed";
  const loweredMessage = message.toLowerCase();

  if (response.status === 429 || loweredMessage.includes("speed limit")) {
    return new ProviderRequestError(429, message, payload);
  }

  if (loweredMessage.includes("valid api key")) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message, payload);
  }

  if (
    loweredMessage.includes("does not exist") ||
    loweredMessage.includes("incorrect dataset code") ||
    loweredMessage.includes("could not recognize the url")
  ) {
    return new ProviderRequestError(400, message, payload);
  }

  if (response.status === 401) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message, payload);
  }

  if (response.status === 403 && phase === "validate") {
    return new ProviderRequestError(400, message, payload);
  }

  if (response.status === 404) {
    return new ProviderRequestError(400, message, payload);
  }

  return new ProviderRequestError(response.status || 502, message, payload);
}

function hasNasdaqError(payload: unknown): boolean {
  const object = optionalRecord(payload);
  return object ? "quandl_error" in object : false;
}

function extractNasdaqErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim() !== "") {
    return payload;
  }
  const record = optionalRecord(payload);
  const quandlError = optionalRecord(record?.quandl_error);
  return quandlError ? optionalString(quandlError.message) : undefined;
}

function buildDatatableMetadataPath(datatableCode: string): string {
  const { vendorCode, tableCode } = parseDatatableCode(datatableCode);
  return `datatables/${vendorCode}/${tableCode}/metadata.json`;
}

function buildDatatableDataPath(datatableCode: string): string {
  const { vendorCode, tableCode } = parseDatatableCode(datatableCode);
  return `datatables/${vendorCode}/${tableCode}.json`;
}

function parseDatatableCode(datatableCode: string): { vendorCode: string; tableCode: string } {
  const trimmed = datatableCode.trim();
  const parts = trimmed.split("/");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new ProviderRequestError(400, "datatableCode must use VENDOR/TABLE format");
  }

  return {
    vendorCode: parts[0],
    tableCode: parts[1],
  };
}

function normalizeColumn(column: Record<string, unknown>): { name: string; type: string } {
  return {
    name: readRequiredString(column.name, "column.name"),
    type: readRequiredString(column.type, "column.type"),
  };
}

function normalizeStatus(status: Record<string, unknown>) {
  return {
    status: readNullableString(status.status),
    expectedAt: readNullableString(status.expected_at),
    refreshedAt: readNullableString(status.refreshed_at),
    updateFrequency: readNullableString(status.update_frequency),
  };
}

function normalizeDataVersion(dataVersion: Record<string, unknown>) {
  return {
    code: readRequiredString(dataVersion.code, "datatable.data_version.code"),
    default: readRequiredBoolean(dataVersion.default, "datatable.data_version.default"),
    description: readNullableString(dataVersion.description),
  };
}

function normalizeDatatableRow(
  row: unknown[],
  columns: Array<{ name: string; type: string }>,
  rowIndex: number,
): NasdaqDatatableRow {
  if (row.length !== columns.length) {
    throw new ProviderRequestError(
      502,
      `Nasdaq response row datatable.data[${rowIndex}] length ${row.length} does not match columns length ${columns.length}`,
    );
  }

  const normalized: NasdaqDatatableRow = {};
  for (const [columnIndex, column] of columns.entries()) {
    if (!Object.prototype.hasOwnProperty.call(row, columnIndex)) {
      throw new ProviderRequestError(502, `Nasdaq response row datatable.data[${rowIndex}][${columnIndex}] is missing`);
    }

    normalized[column.name] = normalizeDatatableScalar(row[columnIndex], `datatable.data[${rowIndex}][${columnIndex}]`);
  }
  return normalized;
}

function normalizeDatatableScalar(value: unknown, fieldName: string): NasdaqDatatableScalar {
  if (value == null) {
    return null;
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  throw new ProviderRequestError(502, `Nasdaq response field ${fieldName} must be a scalar`);
}

function normalizeQuoteRow(row: NasdaqDatatableRow) {
  return {
    ticker: readRequiredRowString(row, "ticker"),
    date: readRequiredRowString(row, "date"),
    open: readNullableRowNumber(row, "open"),
    high: readNullableRowNumber(row, "high"),
    low: readNullableRowNumber(row, "low"),
    close: readNullableRowNumber(row, "close"),
    volume: readNullableRowNumber(row, "volume"),
    dividend: readNullableRowNumber(row, "dividend"),
    split: readNullableRowNumber(row, "split"),
  };
}

function readRequiredDatatableCode(input: Record<string, unknown>): string {
  return readRequiredInputString(input, "datatableCode");
}

function readDatatableCodeForRowQuery(input: Record<string, unknown>): string {
  const datatableCode = readOptionalInputString(input, "datatableCode");
  const vendorCode = readOptionalInputString(input, "vendorCode");
  const tableCode = readOptionalInputString(input, "tableCode");

  if (datatableCode && vendorCode && tableCode) {
    const parsed = parseDatatableCode(datatableCode);
    if (parsed.vendorCode !== vendorCode || parsed.tableCode !== tableCode) {
      throw new ProviderRequestError(400, "datatableCode and vendorCode + tableCode must identify the same datatable");
    }
  }

  if (datatableCode) {
    return datatableCode;
  }
  if (vendorCode && tableCode) {
    return `${vendorCode}/${tableCode}`;
  }
  if (vendorCode || tableCode) {
    throw new ProviderRequestError(400, "vendorCode and tableCode must be provided together");
  }

  throw new ProviderRequestError(400, "datatableCode or vendorCode + tableCode is required");
}

function readOptionalColumns(input: Record<string, unknown>): string | undefined {
  const rawValue = input.columns;

  if (rawValue == null || rawValue === "") {
    return undefined;
  }

  if (typeof rawValue === "string") {
    const normalized = rawValue
      .split(",")
      .map((part) => part.trim())
      .filter((part) => part !== "");
    return normalized.length === 0 ? undefined : normalized.join(",");
  }

  if (Array.isArray(rawValue)) {
    const normalized = rawValue.map((part, index) => {
      if (typeof part !== "string") {
        throw new ProviderRequestError(400, `columns[${index}] must be a string`);
      }

      const trimmed = part.trim();
      if (trimmed === "") {
        throw new ProviderRequestError(400, `columns[${index}] must be a non-empty string`);
      }

      return trimmed;
    });
    return normalized.length === 0 ? undefined : normalized.join(",");
  }

  throw new ProviderRequestError(400, "columns must be a string or string array");
}

function readRequiredInputString(input: Record<string, unknown>, ...keys: string[]): string {
  const value = pickNonEmptyString(input, ...keys);
  if (!value) {
    throw new ProviderRequestError(400, `${keys[0]} is required`);
  }
  return value;
}

function readOptionalInputString(input: Record<string, unknown>, ...keys: string[]): string | undefined {
  return pickNonEmptyString(input, ...keys);
}

function readOptionalInputInteger(input: Record<string, unknown>, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const value = input[key];
    if (value == null || value === "") {
      continue;
    }

    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new ProviderRequestError(400, `${key} must be a positive integer`);
    }
    return parsed;
  }

  return undefined;
}

function readRequiredObject(value: unknown, fieldName: string): Record<string, unknown> {
  const object = optionalRecord(value);
  if (!object) {
    throw new ProviderRequestError(502, `Nasdaq response missing object field: ${fieldName}`);
  }
  return object;
}

function readRequiredArray(value: unknown, fieldName: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `Nasdaq response missing array field: ${fieldName}`);
  }
  return value;
}

function readRequiredString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ProviderRequestError(502, `Nasdaq response missing string field: ${fieldName}`);
  }
  return value;
}

function readNullableString(value: unknown): string | null {
  if (value == null) {
    return null;
  }
  return readRequiredString(value, "string");
}

function readRequiredBoolean(value: unknown, fieldName: string): boolean {
  if (typeof value !== "boolean") {
    throw new ProviderRequestError(502, `Nasdaq response missing boolean field: ${fieldName}`);
  }
  return value;
}

function readRequiredRowString(row: NasdaqDatatableRow, fieldName: string): string {
  const value = row[fieldName];
  if (typeof value !== "string" || value.trim() === "") {
    throw new ProviderRequestError(502, `Nasdaq response row missing string field: ${fieldName}`);
  }
  return value;
}

function readNullableRowNumber(row: NasdaqDatatableRow, fieldName: string): number | null {
  const value = row[fieldName];
  if (value == null) {
    return null;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new ProviderRequestError(502, `Nasdaq response row field ${fieldName} must be numeric`);
    }
    return value;
  }

  if (typeof value !== "string") {
    throw new ProviderRequestError(502, `Nasdaq response row field ${fieldName} must be numeric`);
  }

  const trimmed = value.trim();
  if (trimmed === "") {
    throw new ProviderRequestError(502, `Nasdaq response row field ${fieldName} must be numeric`);
  }

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) {
    throw new ProviderRequestError(502, `Nasdaq response row field ${fieldName} must be numeric`);
  }
  return parsed;
}

function pickNonEmptyString(input: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = optionalString(input[key]);
    if (value) {
      return value;
    }
  }
  return undefined;
}

function toRelativePath(path: string): string {
  return path.startsWith("/") ? path.slice(1) : path;
}
