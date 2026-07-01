import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";
import type { BaserowActionName } from "./actions.ts";

import {
  compactObject,
  optionalBoolean,
  optionalInteger,
  optionalRecord,
  optionalString,
} from "../../core/cast.ts";
import {
  defineProviderExecutors,
  ProviderRequestError,
  providerUserAgent,
  requireApiKeyCredential,
} from "../provider-runtime.ts";

const service = "baserow";
const baserowApiBaseUrl = "https://api.baserow.io";
const baserowValidationPath = "/api/database/tables/all-tables/";

type BaserowPhase = "validate" | "execute";
type BaserowActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const baserowActionHandlers: Record<BaserowActionName, BaserowActionHandler> = {
  async list_tables(_input, context) {
    const tables = asObjectArray(
      await requestBaserowJson({
        context,
        path: baserowValidationPath,
        phase: "execute",
      }),
    );

    return {
      tables,
    };
  },
  async list_table_fields(input, context) {
    const fields = asObjectArray(
      await requestBaserowJson({
        context,
        path: `/api/database/fields/table/${requireTableId(input)}/`,
        phase: "execute",
        notFoundAsInvalidInput: true,
      }),
    );

    return {
      fields,
    };
  },
  async list_table_rows(input, context) {
    const payload = asObject(
      await requestBaserowJson({
        context,
        path: `/api/database/rows/table/${requireTableId(input)}/`,
        query: compactObject({
          user_field_names: optionalBoolean(input.userFieldNames),
          search: optionalString(input.search),
          order_by: optionalString(input.orderBy),
          filters: readFilters(input),
          filter_type: optionalString(input.filterType),
          page: optionalInteger(input.page),
          size: optionalInteger(input.size),
        }),
        phase: "execute",
        notFoundAsInvalidInput: true,
      }),
    );

    return {
      count: optionalInteger(payload.count) ?? 0,
      next: optionalString(payload.next) ?? null,
      previous: optionalString(payload.previous) ?? null,
      rows: Array.isArray(payload.results) ? payload.results.map((row) => asObject(row)) : [],
    };
  },
  async get_table_row(input, context) {
    const row = asObject(
      await requestBaserowJson({
        context,
        path: `/api/database/rows/table/${requireTableId(input)}/${requireRowId(input)}/`,
        query: compactObject({
          user_field_names: optionalBoolean(input.userFieldNames),
        }),
        phase: "execute",
        notFoundAsInvalidInput: true,
      }),
    );

    return {
      row,
    };
  },
  async create_table_row(input, context) {
    const row = asObject(
      await requestBaserowJson({
        context,
        path: `/api/database/rows/table/${requireTableId(input)}/`,
        method: "POST",
        query: compactObject({
          user_field_names: optionalBoolean(input.userFieldNames),
        }),
        body: requireRowPayload(input),
        phase: "execute",
        notFoundAsInvalidInput: true,
      }),
    );

    return {
      row,
    };
  },
  async update_table_row(input, context) {
    const row = asObject(
      await requestBaserowJson({
        context,
        path: `/api/database/rows/table/${requireTableId(input)}/${requireRowId(input)}/`,
        method: "PATCH",
        query: compactObject({
          user_field_names: optionalBoolean(input.userFieldNames),
        }),
        body: requireRowPayload(input),
        phase: "execute",
        notFoundAsInvalidInput: true,
      }),
    );

    return {
      row,
    };
  },
  async delete_table_row(input, context) {
    const rowId = requireRowId(input);
    await requestBaserowJson({
      context,
      path: `/api/database/rows/table/${requireTableId(input)}/${rowId}/`,
      method: "DELETE",
      phase: "execute",
      notFoundAsInvalidInput: true,
    });

    return {
      deleted: true,
      rowId,
    };
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<ApiKeyProviderContext>({
  service,
  handlers: baserowActionHandlers,
  async createContext(context, fetcher): Promise<ApiKeyProviderContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      fetcher,
      signal: context.signal,
      transitFiles: context.transitFiles,
    };
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const tables = asObjectArray(
      await requestBaserowJson({
        context: {
          apiKey: input.apiKey,
          fetcher,
          signal,
        },
        path: baserowValidationPath,
        phase: "validate",
      }),
    );

    const firstTable = tables[0];
    const firstTableId = optionalInteger(firstTable?.id);
    return {
      profile: {
        accountId: firstTableId !== undefined ? `baserow:table:${firstTableId}` : undefined,
        displayName: optionalString(firstTable?.name) ?? "Baserow Database Token",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: baserowApiBaseUrl,
        validationEndpoint: baserowValidationPath,
        accessibleTableCount: tables.length,
        firstTableId,
        firstTableName: optionalString(firstTable?.name),
        firstDatabaseId: optionalInteger(firstTable?.database_id),
      }),
    };
  },
};

async function requestBaserowJson(input: {
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  path: string;
  phase: BaserowPhase;
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  notFoundAsInvalidInput?: boolean;
}): Promise<unknown> {
  const url = new URL(input.path, baserowApiBaseUrl);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  let response: Response;
  try {
    response = await input.context.fetcher(url, {
      method: input.method ?? "GET",
      headers: baserowHeaders(input.context.apiKey, input.body !== undefined),
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: input.context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      isAbortError(error) ? 504 : 502,
      error instanceof Error ? `Baserow request failed: ${error.message}` : "Baserow request failed",
    );
  }

  const payload = await readBaserowPayload(response);
  if (!response.ok) {
    throw createBaserowError(response.status, payload, input.phase, input.notFoundAsInvalidInput);
  }

  return payload;
}

function baserowHeaders(apiKey: string, hasBody: boolean): Headers {
  const headers = new Headers({
    Authorization: `Token ${apiKey}`,
    Accept: "application/json",
    "User-Agent": providerUserAgent,
  });
  if (hasBody) {
    headers.set("Content-Type", "application/json");
  }
  return headers;
}

async function readBaserowPayload(response: Response): Promise<unknown> {
  if (response.status === 204) {
    return null;
  }

  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    if (response.ok) {
      const reason = error instanceof Error ? error.message : "unknown parse error";
      throw new ProviderRequestError(502, `Baserow returned invalid JSON: ${reason}; body=${text}`);
    }

    return text;
  }
}

function createBaserowError(
  status: number,
  payload: unknown,
  phase: BaserowPhase,
  notFoundAsInvalidInput?: boolean,
): ProviderRequestError {
  const message = extractBaserowMessage(payload) ?? `Baserow request failed with ${status || 500}`;

  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (status === 401 || status === 400 || status === 413) {
    return new ProviderRequestError(400, message, payload);
  }
  if (status === 404 && (phase === "execute" || notFoundAsInvalidInput)) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(status || 500, message, payload);
}

function extractBaserowMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }

  const record = optionalRecord(payload);
  return (
    optionalString(record?.description) ??
    optionalString(record?.detail) ??
    optionalString(record?.error) ??
    optionalString(record?.message)
  );
}

function requireTableId(input: Record<string, unknown>): number {
  const tableId = optionalInteger(input.tableId);
  if (!tableId || tableId <= 0) {
    throw new ProviderRequestError(400, "tableId is required");
  }
  return tableId;
}

function requireRowId(input: Record<string, unknown>): number {
  const rowId = optionalInteger(input.rowId);
  if (!rowId || rowId <= 0) {
    throw new ProviderRequestError(400, "rowId is required");
  }
  return rowId;
}

function requireRowPayload(input: Record<string, unknown>): Record<string, unknown> {
  const row = optionalRecord(input.row);
  if (!row) {
    throw new ProviderRequestError(400, "row is required");
  }
  return row;
}

function readFilters(input: Record<string, unknown>): string | undefined {
  const filters = optionalRecord(input.filters);
  return filters ? JSON.stringify(filters) : undefined;
}

function asObject(value: unknown): Record<string, unknown> {
  return optionalRecord(value) ?? {};
}

function asObjectArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.map((item) => asObject(item)) : [];
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}
