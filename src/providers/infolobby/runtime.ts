import type { InfolobbyActionName } from "./actions.ts";

import { compactObject, requiredString } from "../../core/cast.ts";
import { ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

export interface InfolobbyCredentialCheck {
  providerAccountId?: string;
  accountLabel: string;
  providerScopes: string[];
  providerMetadata: Record<string, unknown>;
}

interface ApiKeyProviderActionInput {
  apiKey: string;
  actionName: string;
  input: Record<string, unknown>;
  providerMetadata?: Record<string, unknown>;
  values?: Record<string, string>;
}

export const infolobbyApiBaseUrl = "https://infolobby.com/api";

type RequestOptions = {
  path: string;
  apiKey: string;
  fetcher: typeof fetch;
  mode: "validate" | "execute";
  method?: "GET" | "POST";
  body?: unknown;
};

export async function validateInfolobbyCredential(
  input: Record<string, string>,
  fetcher: typeof fetch,
): Promise<InfolobbyCredentialCheck> {
  const apiKey = requiredString(input.apiKey, "apiKey", (message) => new ProviderRequestError(400, message));
  const payload = await requestInfolobby({
    path: "/spaces/list",
    apiKey,
    fetcher,
    mode: "validate",
  });
  const spaces = requireArray(payload, "spaces/list");
  const firstSpace = optionalRecord(spaces[0]);
  const account = readOptionalString(firstSpace?.account);

  return {
    accountLabel: account ?? "InfoLobby API Key",
    providerScopes: [],
    providerMetadata: {
      apiBaseUrl: infolobbyApiBaseUrl,
      accessibleSpaceCount: spaces.length,
    },
  };
}

export async function executeInfolobbyAction(
  input: ApiKeyProviderActionInput & {
    actionName: InfolobbyActionName;
    input: Record<string, unknown>;
  },
  fetcher: typeof fetch,
): Promise<unknown> {
  const context = { apiKey: input.apiKey, fetcher };
  const value = input.input;
  const tableId = value.tableId;
  const recordId = value.recordId;

  switch (input.actionName) {
    case "list_spaces":
      return { spaces: requireArray(await get("/spaces/list", context), "spaces/list") };
    case "get_space":
      return {
        space: requireObject(await get(`/space/${value.spaceId}/get`, context), "space/get"),
      };
    case "list_tables":
      return {
        tables: requireArray(await get(`/space/${value.spaceId}/tables/list`, context), "tables/list"),
      };
    case "get_table":
      return { table: requireObject(await get(`/table/${tableId}/get`, context), "table/get") };
    case "create_record":
      return {
        record: requireObject(
          await post(`/table/${tableId}/records/create`, { data: value.data }, context),
          "records/create",
        ),
      };
    case "get_record":
      return {
        record: requireObject(await get(`/table/${tableId}/record/${recordId}/get`, context), "record/get"),
      };
    case "update_record":
      return {
        record: requireObject(
          await post(`/table/${tableId}/record/${recordId}/update`, { data: value.data }, context),
          "record/update",
        ),
      };
    case "delete_record":
      return {
        result: await post(`/table/${tableId}/record/${recordId}/delete`, undefined, context),
      };
    case "query_records":
      return {
        records: requireArray(
          await post(`/table/${tableId}/records/query`, buildQueryBody(value, true), context),
          "records/query",
        ),
      };
    case "count_records": {
      const result = requireObject(
        await post(`/table/${tableId}/records/count`, buildQueryBody(value, false), context),
        "records/count",
      );
      return {
        count: result.count,
        total: result.total,
        totalApprox: result.total_approx,
        restricted: result.restricted,
      };
    }
  }
}

function buildQueryBody(input: Record<string, unknown>, includePage: boolean) {
  if (Array.isArray(input.filters)) {
    for (const filterValue of input.filters) {
      const filter = optionalRecord(filterValue);
      if (filter && filter.column === undefined && filter.field === undefined) {
        throw new ProviderRequestError(400, "a filter requires column or field");
      }
    }
  }
  return compactObject({
    fields: input.fields,
    where: input.where,
    filters: input.filters,
    search: input.search,
    view_id: input.viewId,
    order_by: includePage ? input.orderBy : undefined,
    order_dir: includePage ? input.orderDir : undefined,
    limit: includePage ? input.limit : undefined,
    offset: includePage ? input.offset : undefined,
  });
}

async function get(path: string, context: { apiKey: string; fetcher: typeof fetch }) {
  return requestInfolobby({ ...context, path, mode: "execute" });
}

async function post(path: string, body: unknown, context: { apiKey: string; fetcher: typeof fetch }) {
  return requestInfolobby({ ...context, path, body, method: "POST", mode: "execute" });
}

async function requestInfolobby(options: RequestOptions) {
  const headers: Record<string, string> = {
    accept: "application/json",
    authorization: `Bearer ${options.apiKey}`,
    "user-agent": providerUserAgent,
  };
  if (options.method === "POST") {
    headers["content-type"] = "application/json";
  }

  const response = await options.fetcher(`${infolobbyApiBaseUrl}${options.path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.method === "POST" ? JSON.stringify(options.body ?? {}) : undefined,
  });
  const text = await response.text();
  if (!response.ok) {
    throw mapInfolobbyError(response.status, text, options.mode);
  }
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "InfoLobby returned invalid JSON");
  }
}

function mapInfolobbyError(status: number, text: string, mode: "validate" | "execute") {
  const message = text.trim() || `InfoLobby API request failed with status ${status}`;
  if (status === 401) {
    return mode === "validate" ? new ProviderRequestError(400, message) : new ProviderRequestError(409, message);
  }
  if (status === 403 || status === 405) {
    return new ProviderRequestError(400, message);
  }
  if (status === 500 && isDocumentedClientError(message)) {
    return new ProviderRequestError(400, message);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message);
  }
  return new ProviderRequestError(502, message);
}

function isDocumentedClientError(message: string) {
  const exactMessages = [
    "Invalid Table",
    "Record not found",
    "Invalid parameters",
    "Invalid filter",
    "Missing title",
    "Already subscribed",
    "Not subscribed",
  ];
  if (exactMessages.includes(message)) {
    return true;
  }

  const documentedPrefixes = [
    "Invalid field for where:",
    "Invalid compare for where:",
    "Invalid Option ",
    "Unassignable - cannot set computed field:",
    "Unauthorized - no field edit permissions for field:",
  ];
  return documentedPrefixes.some((prefix) => message.startsWith(prefix));
}

function requireObject(value: unknown, endpoint: string) {
  const result = optionalRecord(value);
  if (!result) {
    throw new ProviderRequestError(502, `InfoLobby ${endpoint} returned an invalid object`);
  }
  return result;
}

function requireArray(value: unknown, endpoint: string) {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `InfoLobby ${endpoint} returned an invalid array`);
  }
  return value;
}

function optionalRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function readOptionalString(value: unknown) {
  return typeof value === "string" && value ? value : undefined;
}
