import type { QueryValue } from "../../core/request.ts";
import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderFetch } from "../provider-runtime.ts";

import {
  compactObject,
  optionalBoolean,
  optionalNumber,
  optionalRawString,
  optionalRecord,
  requiredRecord,
  requiredString,
} from "../../core/cast.ts";
import { queryParams } from "../../core/request.ts";
import { providerInputError, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

export const softrApiBaseUrl = "https://tables-api.softr.io/api/v1";
export const softrValidationPath = "/databases";

type SoftrRequestMode = "validate" | "execute";

interface SoftrRequestOptions {
  path: string;
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  mode: SoftrRequestMode;
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  query?: Record<string, QueryValue>;
  body?: unknown;
}

type SoftrActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const softrActionHandlers: ProviderActionHandlers<"softr", SoftrActionHandler> = {
  async list_databases(_input, context) {
    const payload = await requestSoftrJson({ path: "/databases", context, mode: "execute" });
    return { databases: readDataArray(payload, "databases") };
  },
  async get_database(input, context) {
    const payload = await requestSoftrJson({
      path: `/databases/${pathValue(input.databaseId, "databaseId")}`,
      context,
      mode: "execute",
    });
    return { database: readDataObject(payload, "database") };
  },
  async list_tables(input, context) {
    const payload = await requestSoftrJson({
      path: `/databases/${pathValue(input.databaseId, "databaseId")}/tables`,
      context,
      mode: "execute",
    });
    return { tables: readDataArray(payload, "tables") };
  },
  async get_table(input, context) {
    const payload = await requestSoftrJson({ path: tablePath(input), context, mode: "execute" });
    return { table: readDataObject(payload, "table") };
  },
  async list_table_views(input, context) {
    const payload = await requestSoftrJson({ path: `${tablePath(input)}/views`, context, mode: "execute" });
    return { views: readDataArray(payload, "table views") };
  },
  async get_table_field(input, context) {
    const payload = await requestSoftrJson({
      path: `${tablePath(input)}/fields/${pathValue(input.fieldId, "fieldId")}`,
      context,
      mode: "execute",
    });
    return { field: readDataObject(payload, "table field") };
  },
  async list_records(input, context) {
    const payload = await requestSoftrJson({
      path: `${tablePath(input)}/records`,
      context,
      mode: "execute",
      query: {
        offset: optionalNumber(input.offset),
        limit: optionalNumber(input.limit),
        fieldNames: optionalBoolean(input.fieldNames),
        viewId: optionalRawString(input.viewId),
      },
    });
    return readRecordList(payload);
  },
  async search_records(input, context) {
    const payload = await requestSoftrJson({
      path: `${tablePath(input)}/records/search`,
      context,
      mode: "execute",
      method: "POST",
      query: { fieldNames: optionalBoolean(input.fieldNames) },
      body: compactObject({ filter: input.filter, sort: input.sort, paging: input.paging }),
    });
    return readRecordList(payload);
  },
  async get_record(input, context) {
    const payload = await requestSoftrJson({
      path: `${tablePath(input)}/records/${pathValue(input.recordId, "recordId")}`,
      context,
      mode: "execute",
      query: { fieldNames: optionalBoolean(input.fieldNames) },
    });
    return { record: readDataObject(payload, "record") };
  },
  async create_record(input, context) {
    const payload = await requestSoftrJson({
      path: `${tablePath(input)}/records`,
      context,
      mode: "execute",
      method: "POST",
      query: { fieldNames: optionalBoolean(input.fieldNames) },
      body: { fields: requiredRecord(input.fields, "fields", providerInputError) },
    });
    return { record: readDataObject(payload, "created record") };
  },
  async update_record(input, context) {
    const payload = await requestSoftrJson({
      path: `${tablePath(input)}/records/${pathValue(input.recordId, "recordId")}`,
      context,
      mode: "execute",
      method: "PATCH",
      query: { fieldNames: optionalBoolean(input.fieldNames) },
      body: { fields: requiredRecord(input.fields, "fields", providerInputError) },
    });
    return { record: readDataObject(payload, "updated record") };
  },
  async delete_record(input, context) {
    const recordId = requiredString(input.recordId, "recordId", providerInputError);
    await requestSoftrJson({
      path: `${tablePath(input)}/records/${encodeURIComponent(recordId)}`,
      context,
      mode: "execute",
      method: "DELETE",
    });
    return { deleted: true, recordId };
  },
};

export async function validateSoftrCredential(
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await requestSoftrJson({
    path: softrValidationPath,
    context: { apiKey, fetcher, signal },
    mode: "validate",
  });
  const databases = readDataArray(payload, "databases");
  const firstDatabase = optionalRecord(databases[0]);
  const firstDatabaseId = optionalRawString(firstDatabase?.id);
  const firstDatabaseName = optionalRawString(firstDatabase?.name);
  const workspaceIds = [
    ...new Set(
      databases
        .map((database) => optionalRawString(optionalRecord(database)?.workspaceId))
        .filter((workspaceId): workspaceId is string => workspaceId !== undefined),
    ),
  ];

  return {
    profile: {
      accountId: workspaceIds.length === 1 ? `softr:workspace:${workspaceIds[0]}` : undefined,
      displayName: "Softr Database API",
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: softrApiBaseUrl,
      validationEndpoint: softrValidationPath,
      accessibleDatabaseCount: databases.length,
      workspaceIds,
      firstDatabaseId,
      firstDatabaseName,
    }),
  };
}

async function requestSoftrJson(options: SoftrRequestOptions): Promise<unknown> {
  const url = new URL(`${softrApiBaseUrl}${options.path}`);
  for (const [key, value] of Object.entries(queryParams(options.query ?? {}))) {
    url.searchParams.set(key, value);
  }
  const headers: Record<string, string> = {
    accept: "application/json",
    "softr-api-key": options.context.apiKey,
    "user-agent": providerUserAgent,
  };
  if (options.body !== undefined) headers["content-type"] = "application/json";

  const response = await options.context.fetcher(url, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: options.context.signal,
  });
  const payload = await readResponsePayload(response);
  if (!response.ok) throw mapSoftrError(response.status, payload, options.mode);
  if (response.status === 204) return undefined;
  if (payload === undefined) throw new ProviderRequestError(502, "Softr returned an empty response");
  return payload;
}

async function readResponsePayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (response.ok) throw new ProviderRequestError(502, "Softr returned invalid JSON");
    return { message: text };
  }
}

function mapSoftrError(status: number, payload: unknown, mode: SoftrRequestMode): ProviderRequestError {
  const message = readErrorMessage(payload) ?? `Softr API request failed with status ${status}`;
  if ((status === 401 || status === 403) && mode === "validate") {
    return new ProviderRequestError(400, message, payload);
  }
  if (status === 401 || status === 403 || status === 429) {
    return new ProviderRequestError(status, message, payload);
  }
  if (status === 400 || status === 404 || status === 409 || status === 413) {
    return new ProviderRequestError(status, message, payload);
  }
  return new ProviderRequestError(502, message, payload);
}

function readErrorMessage(payload: unknown): string | undefined {
  const body = optionalRecord(payload);
  if (!body) return undefined;
  const message = optionalRawString(body.message);
  const errorCode = optionalRawString(body.errorCode);
  return message && errorCode ? `${errorCode}: ${message}` : (message ?? errorCode);
}

function readRecordList(payload: unknown): Record<string, unknown> {
  const body = asProviderObject(payload, "record list response");
  return {
    records: asProviderArray(body.data, "records"),
    metadata: asProviderObject(body.metadata, "record list metadata"),
  };
}

function readDataArray(payload: unknown, fieldName: string): unknown[] {
  return asProviderArray(asProviderObject(payload, "response").data, fieldName);
}

function readDataObject(payload: unknown, fieldName: string): Record<string, unknown> {
  return asProviderObject(asProviderObject(payload, "response").data, fieldName);
}

function asProviderObject(value: unknown, fieldName: string): Record<string, unknown> {
  return requiredRecord(value, fieldName, () => new ProviderRequestError(502, `Softr returned invalid ${fieldName}`));
}

function asProviderArray(value: unknown, fieldName: string): unknown[] {
  if (!Array.isArray(value)) throw new ProviderRequestError(502, `Softr returned invalid ${fieldName}`);
  return value;
}

function tablePath(input: Record<string, unknown>): string {
  return `/databases/${pathValue(input.databaseId, "databaseId")}/tables/${pathValue(input.tableId, "tableId")}`;
}

function pathValue(value: unknown, fieldName: string): string {
  return encodeURIComponent(requiredString(value, fieldName, providerInputError));
}
