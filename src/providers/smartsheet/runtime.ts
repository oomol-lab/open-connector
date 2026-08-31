import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalNumber, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

export const smartsheetApiBaseUrl = "https://api.smartsheet.com/2.0";
const smartsheetIntegrationSource = "AI,OOMOL,oomol-connect";

type SmartsheetPhase = "validate" | "execute";
type SmartsheetActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const smartsheetActionHandlers: ProviderActionHandlers<"smartsheet", SmartsheetActionHandler> = {
  async list_sheets(input, context) {
    const payload = await requestSmartsheetJson({
      method: "GET",
      path: "/sheets",
      context,
      params: compactObject({
        includeAll: stringifyOptionalBoolean(input.includeAll),
        modifiedSince: optionalString(input.modifiedSince),
        page: stringifyOptionalNumber(input.page),
        pageSize: stringifyOptionalNumber(input.pageSize),
      }),
      phase: "execute",
    });
    const record = requiredRecord(payload, "Smartsheet returned an invalid sheet list payload");

    return {
      page: normalizePage(record),
      sheets: normalizeArray(record.data).map(normalizeSheetSummary),
      raw: record,
    };
  },

  async get_sheet(input, context) {
    const sheetId = readPositiveInteger(input.sheetId, "sheetId");
    const payload = await requestSmartsheetJson({
      method: "GET",
      path: `/sheets/${sheetId}`,
      context,
      params: compactObject({
        include: optionalString(input.include),
        exclude: optionalString(input.exclude),
        columnIds: optionalString(input.columnIds),
        rowIds: optionalString(input.rowIds),
        rowNumbers: optionalString(input.rowNumbers),
        filterId: optionalString(input.filterId),
        ifVersionAfter: stringifyOptionalNumber(input.ifVersionAfter),
        level: stringifyOptionalNumber(input.level),
        rowsModifiedSince: optionalString(input.rowsModifiedSince),
        page: stringifyOptionalNumber(input.page),
        pageSize: stringifyOptionalNumber(input.pageSize),
      }),
      phase: "execute",
    });
    return { sheet: normalizeSheet(requiredRecord(payload, "Smartsheet returned an invalid sheet payload")) };
  },

  async add_rows(input, context) {
    const sheetId = readPositiveInteger(input.sheetId, "sheetId");
    const payload = await requestSmartsheetJson({
      method: "POST",
      path: `/sheets/${sheetId}/rows`,
      context,
      params: compactObject({
        allowPartialSuccess: stringifyOptionalBoolean(input.allowPartialSuccess),
        overrideValidation: stringifyOptionalBoolean(input.overrideValidation),
      }),
      body: readRows(input.rows),
      phase: "execute",
    });
    return normalizeWriteResult(payload);
  },

  async update_rows(input, context) {
    const sheetId = readPositiveInteger(input.sheetId, "sheetId");
    const rows = readRows(input.rows);
    for (const row of rows) readPositiveInteger(row.id, "rows[].id");

    const payload = await requestSmartsheetJson({
      method: "PUT",
      path: `/sheets/${sheetId}/rows`,
      context,
      params: compactObject({
        allowPartialSuccess: stringifyOptionalBoolean(input.allowPartialSuccess),
        overrideValidation: stringifyOptionalBoolean(input.overrideValidation),
      }),
      body: rows,
      phase: "execute",
    });
    return normalizeWriteResult(payload);
  },

  async delete_rows(input, context) {
    const sheetId = readPositiveInteger(input.sheetId, "sheetId");
    const rowIds = readIdList(input.rowIds, "rowIds");
    const payload = await requestSmartsheetJson({
      method: "DELETE",
      path: `/sheets/${sheetId}/rows`,
      context,
      params: compactObject({
        ids: rowIds.join(","),
        ignoreRowsNotFound: stringifyOptionalBoolean(input.ignoreRowsNotFound),
      }),
      phase: "execute",
    });
    const record = requiredRecord(payload, "Smartsheet returned an invalid delete response");
    return {
      message: nullableString(record.message),
      resultCode: nullableInteger(record.resultCode),
      deletedRowIds: rowIds,
      raw: record,
    };
  },
};

export async function validateSmartsheetCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await requestSmartsheetJson({
    method: "GET",
    path: "/sheets",
    context: { apiKey, fetcher, signal },
    params: { pageSize: "1" },
    phase: "validate",
  });
  const record = requiredRecord(payload, "Smartsheet returned an invalid validation payload");
  const firstSheet = normalizeSheetSummary(normalizeArray(record.data)[0]);
  const firstSheetName = firstSheet.name ?? undefined;

  return {
    profile: {
      accountId: firstSheet.id == null ? "api_key" : String(firstSheet.id),
      displayName: firstSheetName ? `Smartsheet: ${firstSheetName}` : "Smartsheet Access Token",
      grantedScopes: [],
    },
    grantedScopes: [],
    metadata: compactObject({
      validationEndpoint: "/sheets",
      apiBaseUrl: smartsheetApiBaseUrl,
      sheetCount: optionalNumber(record.totalCount),
      firstSheetId: firstSheet.id ?? undefined,
      firstSheetName,
    }),
  };
}

async function requestSmartsheetJson(input: {
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  params: Record<string, string | undefined>;
  phase: SmartsheetPhase;
  body?: unknown;
}): Promise<unknown> {
  const timeout = createProviderTimeout(input.context.signal);
  try {
    const response = await input.context.fetcher(buildSmartsheetUrl(input.path, input.params), {
      method: input.method,
      headers: buildSmartsheetHeaders(input.context.apiKey, input.body !== undefined),
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: timeout.signal,
    });
    const payload = await readSmartsheetPayload(response);
    if (!response.ok) throw createSmartsheetError(response.status, payload, input.phase);
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    if (timeout.didTimeout() || isAbortLikeError(error))
      throw new ProviderRequestError(504, "Smartsheet request timed out");
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Smartsheet request failed: ${error.message}` : "Smartsheet request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

function buildSmartsheetUrl(path: string, params: Record<string, string | undefined>): URL {
  const url = new URL(path.startsWith("/") ? path.slice(1) : path, `${smartsheetApiBaseUrl}/`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, value);
  }
  return url;
}

function buildSmartsheetHeaders(apiKey: string, hasBody: boolean): Record<string, string> {
  return compactObject({
    accept: "application/json",
    authorization: `Bearer ${apiKey}`,
    "smartsheet-integration-source": smartsheetIntegrationSource,
    "user-agent": providerUserAgent,
    "content-type": hasBody ? "application/json" : undefined,
  }) as Record<string, string>;
}

async function readSmartsheetPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.trim() === "") return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Smartsheet returned invalid JSON");
  }
}

function createSmartsheetError(status: number, payload: unknown, phase: SmartsheetPhase): ProviderRequestError {
  const message = extractSmartsheetErrorMessage(payload) ?? `Smartsheet request failed with ${status}`;
  if (status === 429) return new ProviderRequestError(429, message, payload);
  if (phase === "validate" && status >= 400 && status < 500) return new ProviderRequestError(400, message, payload);
  if (phase === "execute" && status === 401) return new ProviderRequestError(401, message, payload);
  if (phase === "execute" && status === 403) return new ProviderRequestError(403, message, payload);
  if (phase === "execute" && status >= 400 && status < 500) return new ProviderRequestError(status, message, payload);
  return new ProviderRequestError(status >= 500 ? 502 : status || 500, message, payload);
}

function extractSmartsheetErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) return payload;
  return optionalString(optionalRecord(payload)?.message);
}

function requiredRecord(value: unknown, message: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) throw new ProviderRequestError(502, message);
  return record;
}

function normalizePage(record: Record<string, unknown>): Record<string, unknown> {
  return {
    pageNumber: nullableInteger(record.pageNumber),
    pageSize: nullableInteger(record.pageSize),
    totalPages: nullableInteger(record.totalPages),
    totalCount: nullableInteger(record.totalCount),
  };
}

function normalizeSheetSummary(value: unknown): Record<string, unknown> {
  const record = optionalRecord(value) ?? {};
  return {
    id: nullableInteger(record.id),
    name: nullableString(record.name),
    accessLevel: nullableString(record.accessLevel),
    permalink: nullableString(record.permalink),
    createdAt: nullableString(record.createdAt),
    modifiedAt: nullableString(record.modifiedAt),
    workspaceId: nullableInteger(record.workspaceId),
    raw: record,
  };
}

function normalizeSheet(value: unknown): Record<string, unknown> {
  const record = optionalRecord(value) ?? {};
  return {
    id: nullableInteger(record.id),
    name: nullableString(record.name),
    accessLevel: nullableString(record.accessLevel),
    permalink: nullableString(record.permalink),
    createdAt: nullableString(record.createdAt),
    modifiedAt: nullableString(record.modifiedAt),
    version: nullableInteger(record.version),
    totalRowCount: nullableInteger(record.totalRowCount),
    columns: normalizeArray(record.columns).map(normalizeColumn),
    rows: normalizeArray(record.rows).map(normalizeRow),
    raw: record,
  };
}

function normalizeColumn(value: unknown): Record<string, unknown> {
  const record = optionalRecord(value) ?? {};
  return {
    id: nullableInteger(record.id),
    title: nullableString(record.title),
    type: nullableString(record.type),
    primary: nullableBoolean(record.primary),
    index: nullableInteger(record.index),
    symbol: nullableString(record.symbol),
    options: normalizeArray(record.options).flatMap((option) => (typeof option === "string" ? [option] : [])),
    raw: record,
  };
}

function normalizeRow(value: unknown): Record<string, unknown> {
  const record = optionalRecord(value) ?? {};
  return {
    id: nullableInteger(record.id),
    sheetId: nullableInteger(record.sheetId),
    rowNumber: nullableInteger(record.rowNumber),
    permalink: nullableString(record.permalink),
    expanded: nullableBoolean(record.expanded),
    createdAt: nullableString(record.createdAt),
    modifiedAt: nullableString(record.modifiedAt),
    cells: normalizeArray(record.cells).map(normalizeCell),
    raw: record,
  };
}

function normalizeCell(value: unknown): Record<string, unknown> {
  const record = optionalRecord(value) ?? {};
  return {
    columnId: nullableInteger(record.columnId),
    value: record.value,
    displayValue: nullableString(record.displayValue),
    columnType: nullableString(record.columnType),
    raw: record,
  };
}

function normalizeWriteResult(value: unknown): Record<string, unknown> {
  const record = requiredRecord(value, "Smartsheet returned an invalid write response");
  return {
    message: nullableString(record.message),
    resultCode: nullableInteger(record.resultCode),
    version: nullableInteger(record.version),
    rows: normalizeArray(record.result).map(normalizeRow),
    raw: record,
  };
}

function readRows(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value) || value.length === 0)
    throw new ProviderRequestError(400, "rows must be a non-empty array");
  return value.map((item) => {
    const record = optionalRecord(item);
    if (!record) throw new ProviderRequestError(400, "each row must be an object");
    return record;
  });
}

function readIdList(value: unknown, fieldName: string): number[] {
  if (!Array.isArray(value) || value.length === 0)
    throw new ProviderRequestError(400, `${fieldName} must be a non-empty array`);
  return value.map((item) => readPositiveInteger(item, `${fieldName}[]`));
}

function readPositiveInteger(value: unknown, fieldName: string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0)
    throw new ProviderRequestError(400, `${fieldName} must be a positive integer`);
  return parsed;
}

function normalizeArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringifyOptionalNumber(value: unknown): string | undefined {
  return typeof value === "number" ? String(value) : undefined;
}

function stringifyOptionalBoolean(value: unknown): string | undefined {
  return typeof value === "boolean" ? String(value) : undefined;
}

function nullableString(value: unknown): string | null {
  return value == null ? null : (optionalString(value) ?? null);
}

function nullableInteger(value: unknown): number | null {
  if (value == null) return null;
  const number = typeof value === "number" ? value : Number(value);
  return Number.isInteger(number) ? number : null;
}

function nullableBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}
