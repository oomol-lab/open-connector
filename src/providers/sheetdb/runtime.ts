import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ProviderRuntimeHandler } from "../provider-runtime.ts";

import { optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import { createProviderTimeout, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

export const sheetDbApiBaseUrl = "https://sheetdb.io";

export interface SheetDbContext {
  apiId: string;
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

interface SheetDbRequestInput extends SheetDbContext {
  path: string;
  method?: string;
  query?: Record<string, unknown>;
  body?: unknown;
  phase: "validate" | "execute";
}

export const sheetDbActionHandlers: ProviderActionHandlers<"sheetdb", ProviderRuntimeHandler<SheetDbContext>> = {
  list_rows(input, context) {
    return listRows(input, context);
  },
  get_keys(input, context) {
    return getKeys(input, context);
  },
  get_document_name(_input, context) {
    return getDocumentName(context);
  },
  count_rows(input, context) {
    return countRows(input, context);
  },
  search_rows(input, context) {
    return searchRows(input, context);
  },
  create_rows(input, context) {
    return createRows(input, context);
  },
  update_rows(input, context) {
    return updateRows(input, context);
  },
  delete_rows(input, context) {
    return deleteRows(input, context);
  },
};

export async function validateSheetDbCredential(
  apiKey: string,
  apiIdInput: unknown,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const apiId = requireSheetDbApiId(apiIdInput);
  const payload = await requestSheetDb({
    apiId,
    apiKey,
    fetcher,
    signal,
    path: "/name",
    phase: "validate",
  });
  const documentName = requireStringField(payload, "name", "SheetDB document name");

  return {
    profile: {
      accountId: `sheetdb:${apiId}`,
      displayName: documentName,
    },
    grantedScopes: [],
    metadata: {
      apiId,
      documentName,
      apiBaseUrl: sheetDbApiBaseUrl,
      validationEndpoint: `/api/v1/${apiId}/name`,
    },
  };
}

export function requireSheetDbApiId(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new ProviderRequestError(400, "apiId is required");
  }
  return value.trim();
}

async function listRows(input: Record<string, unknown>, context: SheetDbContext): Promise<unknown> {
  const payload = await requestSheetDb({
    ...context,
    path: "",
    query: buildReadQuery(input),
    phase: "execute",
  });
  return { rows: requireRows(payload, "list_rows") };
}

async function getKeys(input: Record<string, unknown>, context: SheetDbContext): Promise<unknown> {
  const payload = await requestSheetDb({
    ...context,
    path: "/keys",
    query: { sheet: input.sheet },
    phase: "execute",
  });
  if (!Array.isArray(payload) || payload.some((value) => typeof value !== "string")) {
    throw new ProviderRequestError(502, "invalid SheetDB get_keys response");
  }
  return { keys: payload };
}

async function getDocumentName(context: SheetDbContext): Promise<unknown> {
  const payload = await requestSheetDb({ ...context, path: "/name", phase: "execute" });
  return { documentName: requireStringField(payload, "name", "SheetDB document name") };
}

async function countRows(input: Record<string, unknown>, context: SheetDbContext): Promise<unknown> {
  const payload = await requestSheetDb({
    ...context,
    path: "/count",
    query: { sheet: input.sheet },
    phase: "execute",
  });
  return { count: requireIntegerField(payload, "rows", "SheetDB row count") };
}

async function searchRows(input: Record<string, unknown>, context: SheetDbContext): Promise<unknown> {
  const query = optionalRecord(input.query) ?? {};
  const payload = await requestSheetDb({
    ...context,
    path: input.match === "any" ? "/search_or" : "/search",
    query: {
      ...query,
      ...buildReadQuery(input),
      casesensitive: input.caseSensitive,
    },
    phase: "execute",
  });
  return { rows: requireRows(payload, "search_rows") };
}

async function createRows(input: Record<string, unknown>, context: SheetDbContext): Promise<unknown> {
  const payload = await requestSheetDb({
    ...context,
    path: "",
    method: "POST",
    body: {
      data: input.rows,
      sheet: input.sheet,
      return_values: input.returnValues,
      mode: input.valueInputOption,
    },
    phase: "execute",
  });
  const result = optionalRecord(payload);
  return {
    created: requireIntegerField(payload, "created", "SheetDB created row count"),
    rows: Array.isArray(result?.rows) ? result.rows : undefined,
  };
}

async function updateRows(input: Record<string, unknown>, context: SheetDbContext): Promise<unknown> {
  const payload = await requestSheetDb({
    ...context,
    path: `/${encodeURIComponent(String(input.searchColumn))}/${encodeURIComponent(String(input.searchValue))}`,
    method: "PATCH",
    body: {
      data: input.data,
      sheet: input.sheet,
      mode: input.valueInputOption,
    },
    phase: "execute",
  });
  return { updated: requireIntegerField(payload, "updated", "SheetDB updated row count") };
}

async function deleteRows(input: Record<string, unknown>, context: SheetDbContext): Promise<unknown> {
  const payload = await requestSheetDb({
    ...context,
    path: `/${encodeURIComponent(String(input.searchColumn))}/${encodeURIComponent(String(input.searchValue))}`,
    method: "DELETE",
    query: { sheet: input.sheet },
    phase: "execute",
  });
  return { deleted: requireIntegerField(payload, "deleted", "SheetDB deleted row count") };
}

export async function requestSheetDb(input: SheetDbRequestInput): Promise<unknown> {
  const url = buildSheetDbUrl(input.apiId, input.path, input.query);
  const timeout = createProviderTimeout(input.signal, 30_000);
  let response: Response;
  let payload: unknown;
  try {
    response = await input.fetcher(url, {
      method: input.method ?? "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${input.apiKey}`,
        "content-type": "application/json",
        "user-agent": providerUserAgent,
      },
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: timeout.signal,
    });
    payload = await readPayload(response);
  } catch (error) {
    if (timeout.didTimeout()) {
      throw new ProviderRequestError(504, "SheetDB request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `SheetDB request failed: ${error.message}` : "SheetDB request failed",
    );
  } finally {
    timeout.cleanup();
  }

  if (!response.ok) {
    throw mapSheetDbError(response.status, payload, input.phase);
  }
  return payload;
}

function buildSheetDbUrl(apiId: string, path: string, query?: Record<string, unknown>): string {
  const url = new URL(`/api/v1/${encodeURIComponent(apiId)}${path}`, sheetDbApiBaseUrl);
  for (const [key, rawValue] of Object.entries(query ?? {})) {
    if (rawValue == null || rawValue === "") {
      continue;
    }
    const values = Array.isArray(rawValue) ? rawValue : [rawValue];
    for (const value of values) {
      url.searchParams.append(Array.isArray(rawValue) ? `${key}[]` : key, String(value));
    }
  }
  return url.toString();
}

function buildReadQuery(input: Record<string, unknown>): Record<string, unknown> {
  return {
    sheet: input.sheet,
    limit: input.limit,
    offset: input.offset,
    sort_by: input.sortBy,
    sort_order: input.sortOrder,
    sort_method: input.sortMethod,
    sort_date_format: input.sortDateFormat,
    cast_numbers: Array.isArray(input.castNumbers) ? input.castNumbers.join(",") : undefined,
    mode: input.valueRenderOption,
  };
}

function requireRows(payload: unknown, actionName: string): unknown[] {
  if (!Array.isArray(payload) || payload.some((row) => !optionalRecord(row))) {
    throw new ProviderRequestError(502, `invalid SheetDB ${actionName} response: expected an array of rows`);
  }
  return payload;
}

function requireStringField(payload: unknown, field: string, label: string): string {
  const value = optionalString(optionalRecord(payload)?.[field]);
  if (!value) {
    throw new ProviderRequestError(502, `${label} is missing`);
  }
  return value;
}

function requireIntegerField(payload: unknown, field: string, label: string): number {
  const value = optionalInteger(optionalRecord(payload)?.[field]);
  if (value == null || value < 0) {
    throw new ProviderRequestError(502, `${label} is missing`);
  }
  return value;
}

async function readPayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function mapSheetDbError(status: number, payload: unknown, phase: "validate" | "execute"): ProviderRequestError {
  const object = optionalRecord(payload);
  const message =
    optionalString(object?.error) ??
    optionalString(object?.message) ??
    (typeof payload === "string" && payload.trim() ? payload : `SheetDB request failed (${status})`);
  if (status === 401 || status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message);
  }
  if (status === 400 || status === 404 || status === 422) {
    return new ProviderRequestError(400, message);
  }
  return new ProviderRequestError(status >= 500 ? status : 502, message);
}
