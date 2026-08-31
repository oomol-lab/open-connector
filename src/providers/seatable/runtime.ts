import type { CredentialValidationResult } from "../../core/types.ts";

import {
  objectArray,
  optionalBoolean,
  optionalInteger,
  optionalRecord,
  optionalString,
  requiredBoolean,
  requiredRecord,
  requiredString,
  requiredStringArray,
} from "../../core/cast.ts";
import { assertPublicHttpUrl, isPrivateNetworkAccessAllowed } from "../../core/request.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerInputError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

interface SeaTableBaseAccess {
  accessToken: string;
  baseUuid: string;
  baseApiUrl: string;
  baseName: string | null;
  workspaceId: number | null;
}

interface SeaTableContext {
  access: SeaTableBaseAccess;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

interface SeaTableRequestOptions {
  method?: "DELETE" | "GET" | "POST" | "PUT";
  query?: Record<string, string | number | boolean | undefined>;
  body?: Record<string, unknown>;
  phase?: "execute" | "validate";
}

type SeaTableActionHandler = (input: Record<string, unknown>, context: SeaTableContext) => Promise<unknown>;

const requestTimeoutMs = 30_000;

export const seatableActionHandlers: Record<string, SeaTableActionHandler> = {
  async get_metadata(_input, context) {
    return {
      metadata: requireResponseObject(await requestBaseJson(context, "metadata/"), "base metadata"),
    };
  },
  async list_rows(input, context) {
    const payload = requireResponseObject(
      await requestBaseJson(context, "rows/", {
        query: {
          table_name: requireInputString(input.tableName, "tableName"),
          view_name: optionalString(input.viewName),
          start: optionalInteger(input.start),
          limit: optionalInteger(input.limit),
          convert_keys: optionalBoolean(input.convertKeys),
        },
      }),
      "list rows",
    );
    return { rows: requireResponseObjectArray(payload.rows, "list rows") };
  },
  async get_row(input, context) {
    const rowId = requireInputString(input.rowId, "rowId");
    return {
      row: requireResponseObject(
        await requestBaseJson(context, `rows/${encodeURIComponent(rowId)}/`, {
          query: {
            table_name: requireInputString(input.tableName, "tableName"),
            convert_keys: optionalBoolean(input.convertKeys),
          },
        }),
        "get row",
      ),
    };
  },
  async append_rows(input, context) {
    const payload = requireResponseObject(
      await requestBaseJson(context, "rows/", {
        method: "POST",
        body: {
          table_name: requireInputString(input.tableName, "tableName"),
          rows: objectArray(input.rows, "rows", providerInputError),
          apply_default: optionalBoolean(input.applyDefault),
        },
      }),
      "append rows",
    );
    return {
      insertedRowCount: requireResponseInteger(payload.inserted_row_count, "inserted_row_count"),
      rowIds: Array.isArray(payload.row_ids) ? payload.row_ids : [],
      firstRow: optionalRecord(payload.first_row),
      raw: payload,
    };
  },
  async update_rows(input, context) {
    const updates = objectArray(input.updates, "updates", providerInputError).map((update) => ({
      row_id: requireInputString(update.rowId, "updates[].rowId"),
      row: requiredRecord(update.row, "updates[].row", providerInputError),
    }));
    const payload = requireResponseObject(
      await requestBaseJson(context, "rows/", {
        method: "PUT",
        body: {
          table_name: requireInputString(input.tableName, "tableName"),
          updates,
        },
      }),
      "update rows",
    );
    return { success: requiredBoolean(payload.success, "success", seatableResponseError), raw: payload };
  },
  async delete_rows(input, context) {
    const payload = requireResponseObject(
      await requestBaseJson(context, "rows/", {
        method: "DELETE",
        body: {
          table_name: requireInputString(input.tableName, "tableName"),
          row_ids: requiredStringArray(input.rowIds, "rowIds", providerInputError),
        },
      }),
      "delete rows",
    );
    return { success: requiredBoolean(payload.success, "success", seatableResponseError), raw: payload };
  },
};

export async function createSeaTableContext(
  values: Record<string, string>,
  apiToken: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<SeaTableContext> {
  const serverUrl = normalizeSeaTableServerUrl(values.serverUrl);
  return {
    access: await getBaseAccess(serverUrl, apiToken, fetcher, "execute", signal),
    fetcher,
    signal,
  };
}

export async function validateSeaTableCredential(
  values: Record<string, string>,
  apiToken: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const serverUrl = normalizeSeaTableServerUrl(values.serverUrl);
  const access = await getBaseAccess(serverUrl, apiToken, fetcher, "validate", signal);
  const context: SeaTableContext = { access, fetcher, signal };
  const metadata = requireResponseObject(
    await requestBaseJson(context, "metadata/", { phase: "validate" }),
    "base metadata",
  );
  const tableCount = Array.isArray(metadata.tables) ? metadata.tables.length : 0;
  return {
    profile: {
      accountId: `seatable:${access.baseUuid}`,
      displayName: access.baseName ?? `SeaTable ${new URL(serverUrl).host}`,
    },
    grantedScopes: [],
    metadata: {
      serverUrl,
      baseUuid: access.baseUuid,
      baseName: access.baseName,
      workspaceId: access.workspaceId,
      tableCount,
      validationEndpoint: "/api/v2.1/dtable/app-access-token/",
    },
  };
}

export function normalizeSeaTableServerUrl(value: unknown): string {
  const url = assertPublicHttpUrl(requiredString(value, "serverUrl", providerInputError), {
    fieldName: "serverUrl",
    createError: providerInputError,
    allowPrivateNetwork: isPrivateNetworkAccessAllowed(),
  });
  if (url.protocol != "https:") throw providerInputError("serverUrl must use HTTPS");
  if (url.username || url.password) throw providerInputError("serverUrl must not include credentials");
  url.search = "";
  url.hash = "";
  url.pathname = `${url.pathname.replace(/\/+$/u, "")}/`;
  return url.toString();
}

async function getBaseAccess(
  serverUrl: string,
  apiToken: string,
  fetcher: typeof fetch,
  phase: "execute" | "validate",
  signal?: AbortSignal,
): Promise<SeaTableBaseAccess> {
  const timeout = createProviderTimeout(signal, requestTimeoutMs);
  try {
    const response = await fetcher(new URL("api/v2.1/dtable/app-access-token/", serverUrl), {
      headers: requestHeaders(apiToken),
      signal: timeout.signal,
    });
    const record = requireResponseObject(await readJsonResponse(response, phase, "generate Base-Token"), "Base-Token");
    return {
      accessToken: requireResponseString(record.access_token, "access_token"),
      baseUuid: requireResponseString(record.dtable_uuid, "dtable_uuid"),
      baseApiUrl: normalizeSeaTableServerUrl(requireResponseString(record.dtable_server, "dtable_server")),
      baseName: optionalString(record.dtable_name) ?? null,
      workspaceId: optionalInteger(record.workspace_id) ?? null,
    };
  } catch (error) {
    if (timeout.didTimeout() && isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "SeaTable request timed out");
    }
    throw error;
  } finally {
    timeout.cleanup();
  }
}

async function requestBaseJson(
  context: SeaTableContext,
  path: string,
  options: SeaTableRequestOptions = {},
): Promise<unknown> {
  const url = new URL(
    `api/v2/dtables/${encodeURIComponent(context.access.baseUuid)}/${path}`,
    context.access.baseApiUrl,
  );
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  const timeout = createProviderTimeout(context.signal, requestTimeoutMs);
  try {
    const response = await context.fetcher(url, {
      method: options.method ?? "GET",
      headers: requestHeaders(context.access.accessToken, options.body !== undefined),
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: timeout.signal,
    });
    return await readJsonResponse(response, options.phase ?? "execute", path);
  } catch (error) {
    if (timeout.didTimeout() && isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "SeaTable request timed out");
    }
    throw error;
  } finally {
    timeout.cleanup();
  }
}

function requestHeaders(token: string, jsonBody = false): Headers {
  const headers = new Headers({
    accept: "application/json",
    authorization: `Bearer ${token}`,
    "user-agent": providerUserAgent,
  });
  if (jsonBody) headers.set("content-type", "application/json");
  return headers;
}

async function readJsonResponse(
  response: Response,
  phase: "execute" | "validate",
  operation: string,
): Promise<unknown> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ProviderRequestError(502, `SeaTable returned invalid JSON for ${operation}`);
  }
  if (response.ok) return payload;
  const record = optionalRecord(payload);
  const message =
    optionalString(record?.error_message) ??
    optionalString(record?.error) ??
    optionalString(record?.message) ??
    `SeaTable ${operation} failed with HTTP ${response.status}`;
  if (response.status === 401 || response.status === 403) {
    throw new ProviderRequestError(phase === "validate" ? 400 : response.status, message, payload);
  }
  if (response.status === 429) throw new ProviderRequestError(429, message, payload);
  throw new ProviderRequestError(response.status >= 500 ? 502 : 400, message, payload);
}

function requireInputString(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, providerInputError);
}

function requireResponseObject(value: unknown, operation: string): Record<string, unknown> {
  const result = optionalRecord(value);
  if (!result) throw new ProviderRequestError(502, `SeaTable returned an invalid ${operation} response`, value);
  return result;
}

function requireResponseObjectArray(value: unknown, operation: string): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `SeaTable returned an invalid ${operation} response`, value);
  }
  return value.map((item) => requireResponseObject(item, operation));
}

function requireResponseString(value: unknown, fieldName: string): string {
  const result = optionalString(value);
  if (!result) throw new ProviderRequestError(502, `SeaTable response is missing ${fieldName}`, value);
  return result;
}

function requireResponseInteger(value: unknown, fieldName: string): number {
  const result = optionalInteger(value);
  if (result === undefined) throw new ProviderRequestError(502, `SeaTable response is missing ${fieldName}`, value);
  return result;
}

function seatableResponseError(message: string): ProviderRequestError {
  return new ProviderRequestError(502, `SeaTable response ${message}`);
}
