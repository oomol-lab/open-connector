import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import {
  objectArray,
  optionalBoolean,
  optionalInteger,
  optionalRecord,
  optionalString,
  requiredRecord,
} from "../../core/cast.ts";
import { assertPublicHttpUrl, compactJson, queryParams } from "../../core/request.ts";
import {
  createProviderTimeout,
  credentialProviderProxyBaseUrl,
  defineProviderExecutors,
  defineProviderProxy,
  isAbortLikeError,
  providerInputError,
  ProviderRequestError,
  providerUserAgent,
  requireApiKeyCredential,
  requiredInputString,
} from "../provider-runtime.ts";

const service = "nocodb";
const nocodbValidationPath = "/api/v1/auth/user/me";

interface NocodbContext {
  apiKey: string;
  baseUrl: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

type NocodbActionHandler = (input: Record<string, unknown>, context: NocodbContext) => Promise<unknown>;

export const nocodbActionHandlers: ProviderActionHandlers<"nocodb", NocodbActionHandler> = {
  async get_current_user(_input, context) {
    return {
      user: requiredOutputObject(
        await requestNocodbJson(context, { path: nocodbValidationPath, phase: "execute" }),
        "user",
      ),
    };
  },
  async list_bases(_input, context) {
    return {
      bases: readListPayload(
        await requestNocodbJson(context, { path: "/api/v2/meta/bases/", phase: "execute" }),
        "bases",
      ),
    };
  },
  async get_base_schema(input, context) {
    return {
      base: requiredOutputObject(
        await requestNocodbJson(context, {
          path: `/api/v2/meta/bases/${encodeURIComponent(requiredInputString(input.baseId, "baseId"))}`,
          phase: "execute",
          notFoundAsInvalidInput: true,
        }),
        "base",
      ),
    };
  },
  async list_tables(input, context) {
    const baseId = requiredInputString(input.baseId, "baseId");
    const sourceId = optionalString(input.sourceId);
    const path = sourceId
      ? `/api/v2/meta/bases/${encodeURIComponent(baseId)}/${encodeURIComponent(sourceId)}/tables`
      : `/api/v2/meta/bases/${encodeURIComponent(baseId)}/tables`;
    return {
      tables: readListPayload(
        await requestNocodbJson(context, { path, phase: "execute", notFoundAsInvalidInput: true }),
        "tables",
      ),
    };
  },
  async create_table(input, context) {
    return {
      table: requiredOutputObject(
        await requestNocodbJson(context, {
          path: `/api/v3/meta/bases/${encodeURIComponent(requiredInputString(input.baseId, "baseId"))}/tables`,
          method: "POST",
          body: compactJson({
            title: requiredInputString(input.title, "title"),
            description: input.description,
            source_id: optionalString(input.sourceId),
            meta: optionalRecord(input.meta),
            fields: input.fields,
          }),
          phase: "execute",
          notFoundAsInvalidInput: true,
        }),
        "table",
      ),
    };
  },
  async get_table_metadata(input, context) {
    const table = requiredOutputObject(
      await requestNocodbJson(context, {
        path: `/api/v2/meta/tables/${encodeURIComponent(requiredInputString(input.tableId, "tableId"))}`,
        phase: "execute",
        notFoundAsInvalidInput: true,
      }),
      "table",
    );
    return {
      table,
      columns: readListPayload(table.columns, "columns"),
    };
  },
  async update_table(input, context) {
    const body = compactJson({
      title: optionalString(input.title),
      description: optionalString(input.description),
      display_field_id: optionalString(input.displayFieldId),
      meta: optionalRecord(input.meta),
    }) as Record<string, unknown>;
    if (Object.keys(body).length === 0) {
      throw new ProviderRequestError(400, "at least one of title, description, displayFieldId, or meta is required");
    }
    return {
      table: requiredOutputObject(
        await requestNocodbJson(context, {
          path: `/api/v3/meta/bases/${encodeURIComponent(requiredInputString(input.baseId, "baseId"))}/tables/${encodeURIComponent(requiredInputString(input.tableId, "tableId"))}`,
          method: "PATCH",
          body,
          phase: "execute",
          notFoundAsInvalidInput: true,
        }),
        "table",
      ),
    };
  },
  async delete_table(input, context) {
    await requestNocodbJson(context, {
      path: `/api/v3/meta/bases/${encodeURIComponent(requiredInputString(input.baseId, "baseId"))}/tables/${encodeURIComponent(requiredInputString(input.tableId, "tableId"))}`,
      method: "DELETE",
      phase: "execute",
      notFoundAsInvalidInput: true,
    });
    return { deleted: true };
  },
  async list_table_views(input, context) {
    return {
      views: readListPayload(
        await requestNocodbJson(context, {
          path: `/api/v3/meta/bases/${encodeURIComponent(requiredInputString(input.baseId, "baseId"))}/tables/${encodeURIComponent(requiredInputString(input.tableId, "tableId"))}/views`,
          phase: "execute",
          notFoundAsInvalidInput: true,
        }),
        "list",
      ),
    };
  },
  async create_table_view(input, context) {
    return {
      view: requiredOutputObject(
        await requestNocodbJson(context, {
          path: `/api/v3/meta/bases/${encodeURIComponent(requiredInputString(input.baseId, "baseId"))}/tables/${encodeURIComponent(requiredInputString(input.tableId, "tableId"))}/views`,
          method: "POST",
          body: requiredRecord(input.view, "view", providerInputError),
          phase: "execute",
          notFoundAsInvalidInput: true,
        }),
        "view",
      ),
    };
  },
  async create_table_field(input, context) {
    return {
      field: requiredOutputObject(
        await requestNocodbJson(context, {
          path: `/api/v3/meta/bases/${encodeURIComponent(requiredInputString(input.baseId, "baseId"))}/tables/${encodeURIComponent(requiredInputString(input.tableId, "tableId"))}/fields`,
          method: "POST",
          body: requiredRecord(input.field, "field", providerInputError),
          phase: "execute",
          notFoundAsInvalidInput: true,
        }),
        "field",
      ),
    };
  },
  async list_records(input, context) {
    const payload = requiredOutputObject(
      await requestNocodbJson(context, {
        path: `/api/v2/tables/${encodeURIComponent(requiredInputString(input.tableId, "tableId"))}/records`,
        query: buildQuery({
          limit: optionalInteger(input.limit),
          offset: optionalInteger(input.offset),
          where: optionalString(input.where),
          sort: optionalString(input.sort),
          fields: optionalString(input.fields),
          viewId: optionalString(input.viewId),
          shuffle: optionalBoolean(input.shuffle),
        }),
        phase: "execute",
        notFoundAsInvalidInput: true,
      }),
      "record list",
    );
    return {
      rows: readListPayload(payload, "list"),
      pageInfo: optionalRecord(payload.pageInfo) ?? null,
    };
  },
  async count_records(input, context) {
    return {
      count: readRequiredCount(
        requiredOutputObject(
          await requestNocodbJson(context, {
            path: `/api/v2/tables/${encodeURIComponent(requiredInputString(input.tableId, "tableId"))}/records/count`,
            query: buildQuery({
              where: optionalString(input.where),
              viewId: optionalString(input.viewId),
            }),
            phase: "execute",
            notFoundAsInvalidInput: true,
          }),
          "record count",
        ).count,
      ),
    };
  },
  async read_record(input, context) {
    return {
      row: requiredOutputObject(
        await requestNocodbJson(context, {
          path: `/api/v2/tables/${encodeURIComponent(requiredInputString(input.tableId, "tableId"))}/records/${encodeURIComponent(recordId(input.recordId, "recordId"))}`,
          query: buildQuery({ fields: optionalString(input.fields) }),
          phase: "execute",
          notFoundAsInvalidInput: true,
        }),
        "row",
      ),
    };
  },
  async create_records(input, context) {
    return requestRowsMutation(context, input, "POST");
  },
  async update_records(input, context) {
    return requestRowsMutation(context, input, "PATCH");
  },
  async delete_records(input, context) {
    const payload = await requestNocodbJson(context, {
      path: `/api/v2/tables/${encodeURIComponent(requiredInputString(input.tableId, "tableId"))}/records`,
      method: "DELETE",
      body: rowsInput(input.rows),
      phase: "execute",
      notFoundAsInvalidInput: true,
    });
    return {
      deleted: true,
      rows: normalizeRowsPayload(payload),
    };
  },
  async list_table_records(input, context) {
    const payload = requiredOutputObject(
      await requestNocodbJson(context, {
        path: buildV3DataPath(input, "records"),
        query: buildQuery({
          fields: optionalString(input.fields),
          sort: optionalString(input.sort),
          where: optionalString(input.where),
          page: optionalInteger(input.page),
          nestedPage: optionalInteger(input.nestedPage),
          pageSize: optionalInteger(input.pageSize),
          viewId: optionalString(input.viewId),
          linksAsLtar: optionalBoolean(input.linksAsLtar),
        }),
        phase: "execute",
        notFoundAsInvalidInput: true,
      }),
      "v3 record list",
    );
    return normalizeV3ListResponse(payload);
  },
  async count_table_records(input, context) {
    return {
      count: readRequiredCount(
        requiredOutputObject(
          await requestNocodbJson(context, {
            path: buildV3DataPath(input, "count"),
            query: buildQuery({
              where: optionalString(input.where),
              viewId: optionalString(input.viewId),
            }),
            phase: "execute",
            notFoundAsInvalidInput: true,
          }),
          "v3 record count",
        ).count,
      ),
    };
  },
  async read_table_record(input, context) {
    return {
      record: requiredOutputObject(
        await requestNocodbJson(context, {
          path: `${buildV3DataPath(input, "records")}/${encodeURIComponent(recordId(input.recordId, "recordId"))}`,
          query: buildQuery({
            fields: optionalString(input.fields),
            linksAsLtar: optionalBoolean(input.linksAsLtar),
          }),
          phase: "execute",
          notFoundAsInvalidInput: true,
        }),
        "v3 record",
      ),
    };
  },
  async create_table_records(input, context) {
    return requestV3RecordsMutation(context, input, "POST");
  },
  async update_table_records(input, context) {
    return requestV3RecordsMutation(context, input, "PATCH");
  },
  async delete_table_records(input, context) {
    return requestV3RecordsMutation(context, input, "DELETE");
  },
  async upsert_table_records(input, context) {
    const payload = await requestNocodbJson(context, {
      path: `${buildV3DataPath(input, "records")}/upsert`,
      method: "POST",
      body: {
        fieldsToMergeOn: input.fieldsToMergeOn,
        records: objectArray(input.records, "records", providerInputError),
      },
      phase: "execute",
      notFoundAsInvalidInput: true,
    });
    return { records: normalizeV3RecordsPayload(payload) };
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<NocodbContext>({
  service,
  handlers: nocodbActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<NocodbContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      baseUrl: normalizeNocodbBaseUrl(credential.values.baseUrl),
      fetcher,
      signal: context.signal,
    };
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const baseUrl = normalizeNocodbBaseUrl(input.values.baseUrl);
    const user = requiredOutputObject(
      await requestNocodbJson(
        {
          apiKey: input.apiKey,
          baseUrl,
          fetcher,
          signal,
        },
        {
          path: nocodbValidationPath,
          phase: "validate",
        },
      ),
      "user",
    );
    const accountId = optionalString(user.id) ?? optionalString(user.email) ?? `nocodb:${new URL(baseUrl).host}`;
    const displayName =
      optionalString(user.email) ??
      optionalString(user.display_name) ??
      optionalString(user.name) ??
      "NocoDB API Token";
    return {
      profile: {
        accountId,
        displayName,
      },
      grantedScopes: [],
      metadata: {
        baseUrl,
        apiBaseUrl: baseUrl,
        validationEndpoint: nocodbValidationPath,
        userId: optionalString(user.id),
        email: optionalString(user.email),
      },
    };
  },
};

interface NocodbRequestOptions {
  path: string;
  phase: "validate" | "execute";
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  query?: Record<string, string>;
  body?: unknown;
  notFoundAsInvalidInput?: boolean;
}

async function requestNocodbJson(context: NocodbContext, input: NocodbRequestOptions): Promise<unknown> {
  const timeout = createProviderTimeout(context.signal);
  try {
    const response = await context.fetcher(buildNocodbUrl(context.baseUrl, input.path, input.query), {
      method: input.method ?? "GET",
      headers: buildNocodbHeaders(context.apiKey, input.body !== undefined),
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: timeout.signal,
    });
    const payload = await readNocodbPayload(response);
    if (!response.ok) {
      throw createNocodbError(response.status, payload, input.phase, input.notFoundAsInvalidInput === true);
    }
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "NocoDB request timed out", error);
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `NocoDB request failed: ${error.message}` : "NocoDB request failed",
      error,
    );
  } finally {
    timeout.cleanup();
  }
}

function buildNocodbUrl(baseUrl: string, path: string, query?: Record<string, string>): URL {
  const url = new URL(path, `${baseUrl}/`);
  for (const [key, value] of Object.entries(query ?? {})) {
    url.searchParams.set(key, value);
  }
  return url;
}

function buildNocodbHeaders(apiKey: string, hasBody: boolean): Headers {
  const headers = new Headers({
    accept: "application/json",
    "user-agent": providerUserAgent,
    "xc-token": apiKey,
  });
  if (hasBody) {
    headers.set("content-type", "application/json");
  }
  return headers;
}

async function readNocodbPayload(response: Response): Promise<unknown> {
  if (response.status === 204) {
    return null;
  }
  const text = await response.text();
  if (!text.trim()) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (response.ok) {
      throw new ProviderRequestError(502, "NocoDB returned invalid JSON");
    }
    return text;
  }
}

function createNocodbError(
  status: number,
  payload: unknown,
  phase: "validate" | "execute",
  notFoundAsInvalidInput: boolean,
): ProviderRequestError {
  const message = extractNocodbMessage(payload) ?? `NocoDB request failed with ${status || 500}`;
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (status === 401 || status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message, payload);
  }
  if (status === 400 || status === 422 || (status === 404 && notFoundAsInvalidInput)) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(status >= 500 ? 502 : status || 502, message, payload);
}

function extractNocodbMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }
  const record = optionalRecord(payload);
  return (
    optionalString(record?.msg) ??
    optionalString(record?.message) ??
    optionalString(record?.error) ??
    optionalString(record?.description) ??
    optionalString(record?.detail)
  );
}

function readListPayload(payload: unknown, preferredKey: string): Array<Record<string, unknown>> {
  if (Array.isArray(payload)) {
    return payload.map((item) => requiredOutputObject(item, preferredKey));
  }
  const record = optionalRecord(payload);
  if (!record) {
    return [];
  }
  const preferred = record[preferredKey];
  if (Array.isArray(preferred)) {
    return preferred.map((item) => requiredOutputObject(item, preferredKey));
  }
  const list = record.list;
  if (Array.isArray(list)) {
    return list.map((item) => requiredOutputObject(item, "list"));
  }
  return [];
}

function normalizeRowsPayload(payload: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(payload)) {
    return payload.map((item) => requiredOutputObject(item, "row"));
  }
  const record = optionalRecord(payload);
  if (!record || Object.keys(record).length === 0) {
    return [];
  }
  if (Array.isArray(record.list)) {
    return record.list.map((item) => requiredOutputObject(item, "row"));
  }
  return [record];
}

function normalizeV3ListResponse(payload: Record<string, unknown>): Record<string, unknown> {
  return {
    records: normalizeV3RecordsPayload(payload),
    next: optionalString(payload.next) ?? null,
    prev: optionalString(payload.prev) ?? null,
    nestedNext: optionalString(payload.nestedNext) ?? null,
    nestedPrev: optionalString(payload.nestedPrev) ?? null,
  };
}

function normalizeV3RecordsPayload(payload: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(payload)) {
    return payload.map((item) => requiredOutputObject(item, "record"));
  }
  const record = optionalRecord(payload);
  if (!record) {
    return [];
  }
  if (Array.isArray(record.records)) {
    return record.records.map((item) => requiredOutputObject(item, "record"));
  }
  if (Array.isArray(record.list)) {
    return record.list.map((item) => requiredOutputObject(item, "record"));
  }
  if (Array.isArray(record.data)) {
    return record.data.map((item) => requiredOutputObject(item, "record"));
  }
  return [record];
}

function requestRowsMutation(
  context: NocodbContext,
  input: Record<string, unknown>,
  method: "POST" | "PATCH",
): Promise<{ rows: Array<Record<string, unknown>> }> {
  return requestNocodbJson(context, {
    path: `/api/v2/tables/${encodeURIComponent(requiredInputString(input.tableId, "tableId"))}/records`,
    method,
    body: rowsInput(input.rows),
    phase: "execute",
    notFoundAsInvalidInput: true,
  }).then((payload) => ({ rows: normalizeRowsPayload(payload) }));
}

function requestV3RecordsMutation(
  context: NocodbContext,
  input: Record<string, unknown>,
  method: "POST" | "PATCH" | "DELETE",
): Promise<{ records: Array<Record<string, unknown>> }> {
  return requestNocodbJson(context, {
    path: buildV3DataPath(input, "records"),
    method,
    body: objectArray(input.records, "records", providerInputError),
    phase: "execute",
    notFoundAsInvalidInput: true,
  }).then((payload) => ({ records: normalizeV3RecordsPayload(payload) }));
}

function buildV3DataPath(input: Record<string, unknown>, suffix: string): string {
  return `/api/v3/data/${encodeURIComponent(requiredInputString(input.baseId, "baseId"))}/${encodeURIComponent(
    requiredInputString(input.tableId, "tableId"),
  )}/${suffix}`;
}

function rowsInput(value: unknown): Array<Record<string, unknown>> {
  return objectArray(value, "rows", providerInputError);
}

function recordId(value: unknown, fieldName: string): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return requiredInputString(value, fieldName);
}

function readRequiredCount(value: unknown): number {
  const count = optionalInteger(value);
  if (count === undefined) {
    throw new ProviderRequestError(502, "NocoDB count response must include integer count");
  }
  return count;
}

function normalizeNocodbBaseUrl(value: unknown): string {
  const raw = requiredInputString(value, "baseUrl");
  const url = assertPublicHttpUrl(raw, {
    fieldName: "baseUrl",
    createError: (message) => new ProviderRequestError(400, message),
  });
  if (url.protocol !== "https:") {
    throw new ProviderRequestError(400, "baseUrl must use https");
  }
  if (url.pathname !== "/") {
    throw new ProviderRequestError(400, "baseUrl must be the instance root URL without any path");
  }
  url.hash = "";
  url.search = "";
  return url.toString().replace(/\/+$/, "");
}

function buildQuery(input: Record<string, string | number | boolean | undefined>): Record<string, string> {
  return queryParams(input);
}

function requiredOutputObject(value: unknown, label: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `NocoDB ${label} response must be an object`, value);
  }
  return record;
}

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: credentialProviderProxyBaseUrl("baseUrl"),
  auth: { type: "api_key_header", name: "xc-token" },
});
