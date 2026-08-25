import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";

import {
  compactObject,
  nullableString,
  objectArray,
  optionalBoolean,
  optionalInteger,
  optionalRecord,
  optionalString,
} from "../../core/cast.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

export const teableApiBaseUrl = "https://app.teable.cn/api";
const teableCurrentUserPath = "/auth/user";

type TeableRequestPhase = "validate" | "execute";

interface TeableRequestInput extends Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal"> {
  method: string;
  phase: TeableRequestPhase;
  searchParams?: URLSearchParams;
  body?: Record<string, unknown>;
}

export const teableActionHandlers: ProviderActionHandlers<"teable", ProviderRuntimeHandler<ApiKeyProviderContext>> = {
  get_current_user(_input, context) {
    return executeGetCurrentUser(context);
  },
  list_spaces(_input, context) {
    return executeListSpaces(context);
  },
  list_bases(input, context) {
    return executeListBases(input, context);
  },
  list_tables(input, context) {
    return executeListTables(input, context);
  },
  list_records(input, context) {
    return executeListRecords(input, context);
  },
  get_record(input, context) {
    return executeGetRecord(input, context);
  },
  create_records(input, context) {
    return executeCreateRecords(input, context);
  },
  update_record(input, context) {
    return executeUpdateRecord(input, context);
  },
  delete_record(input, context) {
    return executeDeleteRecord(input, context);
  },
};

export async function validateTeableCredential(
  apiKey: string,
  fetcher: ApiKeyProviderContext["fetcher"],
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const user = parseCurrentUser(
    await teableRequest(teableCurrentUserPath, { apiKey, fetcher, signal, method: "GET", phase: "validate" }),
  );
  return {
    profile: { displayName: `Teable ${user.name}` },
    grantedScopes: [],
    metadata: { apiBaseUrl: teableApiBaseUrl, validationEndpoint: teableCurrentUserPath },
  };
}

async function executeGetCurrentUser(context: ApiKeyProviderContext) {
  const payload = await teableRequest(teableCurrentUserPath, {
    ...context,
    method: "GET",
    phase: "execute",
  });
  return parseCurrentUser(payload);
}

function providerError(_code: string, message: string, status: number): ProviderRequestError {
  return new ProviderRequestError(status, message);
}

async function executeListSpaces(context: ApiKeyProviderContext) {
  const payload = await teableRequest("/space", {
    ...context,
    method: "GET",
    phase: "execute",
  });
  return { spaces: requireObjectArray(payload, "space list") };
}

async function executeListBases(input: Record<string, unknown>, context: ApiKeyProviderContext) {
  const payload = await teableRequest(`/space/${encodePath(input.spaceId)}/base`, {
    ...context,
    method: "GET",
    phase: "execute",
  });
  return { bases: requireObjectArray(payload, "base list") };
}

async function executeListTables(input: Record<string, unknown>, context: ApiKeyProviderContext) {
  const payload = await teableRequest(`/base/${encodePath(input.baseId)}/table`, {
    ...context,
    method: "GET",
    phase: "execute",
  });
  return { tables: requireObjectArray(payload, "table list") };
}

async function executeListRecords(input: Record<string, unknown>, context: ApiKeyProviderContext) {
  const payload = await teableRequest(`/table/${encodePath(input.tableId)}/record`, {
    ...context,
    method: "GET",
    phase: "execute",
    searchParams: recordListSearchParams(input),
  });
  const root = requireObject(payload, "record list");
  const records = requireObjectArray(root.records, "record list records");

  return compactObject({
    records,
    extra: root.extra === undefined ? undefined : requireObject(root.extra, "record list extra"),
  });
}

async function executeGetRecord(input: Record<string, unknown>, context: ApiKeyProviderContext) {
  const payload = await teableRequest(`/table/${encodePath(input.tableId)}/record/${encodePath(input.recordId)}`, {
    ...context,
    method: "GET",
    phase: "execute",
    searchParams: recordReadSearchParams(input),
  });
  return { record: requireObject(payload, "record") };
}

async function executeCreateRecords(input: Record<string, unknown>, context: ApiKeyProviderContext) {
  const payload = await teableRequest(`/table/${encodePath(input.tableId)}/record`, {
    ...context,
    method: "POST",
    phase: "execute",
    body: compactObject({
      records: objectArray(input.records, "records"),
      fieldKeyType: optionalString(input.fieldKeyType),
      typecast: optionalBoolean(input.typecast),
    }),
  });
  const root = requireObject(payload, "create records response");
  return { records: requireObjectArray(root.records, "created records") };
}

async function executeUpdateRecord(input: Record<string, unknown>, context: ApiKeyProviderContext) {
  const payload = await teableRequest(`/table/${encodePath(input.tableId)}/record/${encodePath(input.recordId)}`, {
    ...context,
    method: "PATCH",
    phase: "execute",
    body: compactObject({
      record: {
        fields: optionalRecord(input.fields) ?? {},
      },
      fieldKeyType: optionalString(input.fieldKeyType),
      typecast: optionalBoolean(input.typecast),
    }),
  });
  return { record: requireObject(payload, "updated record") };
}

async function executeDeleteRecord(input: Record<string, unknown>, context: ApiKeyProviderContext) {
  await teableRequest(`/table/${encodePath(input.tableId)}/record/${encodePath(input.recordId)}`, {
    ...context,
    method: "DELETE",
    phase: "execute",
  });

  return {
    deleted: true,
    recordId: optionalString(input.recordId) ?? "",
  };
}

async function teableRequest(path: string, input: TeableRequestInput) {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(normalizedPath, `${teableApiBaseUrl}/`);
  if (input.searchParams) {
    for (const [key, value] of input.searchParams) {
      url.searchParams.append(key, value);
    }
  }

  let response: Response;
  let payload: unknown;
  try {
    response = await input.fetcher(url, {
      method: input.method,
      headers: teableHeaders(input.apiKey, input.body !== undefined),
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: input.signal,
    });
    payload = await readTeablePayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw providerError(
      "provider_error",
      error instanceof Error ? `Teable request failed: ${error.message}` : "Teable request failed",
      502,
    );
  }

  if (!response.ok) {
    throw createTeableError(response, payload, input.phase);
  }
  return payload;
}

function teableHeaders(apiKey: string, hasBody: boolean) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    accept: "application/json",
    "user-agent": providerUserAgent,
  };
  if (hasBody) {
    headers["content-type"] = "application/json";
  }
  return headers;
}

async function readTeablePayload(response: Response) {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    if (response.ok) {
      throw providerError(
        "provider_error",
        error instanceof Error ? `Teable returned malformed JSON: ${error.message}` : "Teable returned malformed JSON",
        502,
      );
    }
    return text;
  }
}

function createTeableError(response: Response, payload: unknown, phase: TeableRequestPhase) {
  const message = extractTeableErrorMessage(payload) || response.statusText || "Teable request failed";

  if (response.status === 429) {
    return providerError("rate_limited", message, 429);
  }
  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    return providerError("invalid_input", message, 400);
  }
  if (phase === "execute" && response.status === 401) {
    return providerError("credential_expired", message, 409);
  }
  if (phase === "execute" && response.status === 403) {
    return providerError("scope_missing", message, 403);
  }
  if (phase === "execute" && [400, 404, 422].includes(response.status)) {
    return providerError("invalid_input", message, 400);
  }
  return providerError("provider_error", message, response.status || 500);
}

function extractTeableErrorMessage(payload: unknown) {
  const root = optionalRecord(payload);
  if (!root) {
    return typeof payload === "string" && payload ? payload : undefined;
  }
  return optionalString(root.message) || optionalString(root.error) || optionalString(root.code);
}

function parseCurrentUser(payload: unknown) {
  const user = requireObject(payload, "current user");
  const id = optionalString(user.id);
  const name = optionalString(user.name);
  if (!id || !name) {
    throw providerError("provider_error", "Teable current user response did not include id and name", 502);
  }

  return compactObject({
    id,
    name,
    avatar: nullableString(user.avatar),
    email: optionalString(user.email),
  });
}

function requireObject(payload: unknown, label: string) {
  const value = optionalRecord(payload);
  if (!value) {
    throw providerError("provider_error", `Teable returned an invalid ${label} response`, 502);
  }
  return value;
}

function requireObjectArray(payload: unknown, label: string) {
  try {
    return objectArray(payload, label);
  } catch {
    throw providerError("provider_error", `Teable returned an invalid ${label} response`, 502);
  }
}

function recordReadSearchParams(input: Record<string, unknown>) {
  const searchParams = new URLSearchParams();
  appendStringArray(searchParams, "projection", input.projection);
  setOptionalString(searchParams, "cellFormat", input.cellFormat);
  setOptionalString(searchParams, "fieldKeyType", input.fieldKeyType);
  return searchParams;
}

function recordListSearchParams(input: Record<string, unknown>) {
  const searchParams = recordReadSearchParams(input);
  setOptionalString(searchParams, "viewId", input.viewId);
  setOptionalBoolean(searchParams, "ignoreViewQuery", input.ignoreViewQuery);
  setOptionalJson(searchParams, "filter", input.filter);
  setOptionalJson(searchParams, "orderBy", input.orderBy);
  setOptionalInteger(searchParams, "take", input.take);
  setOptionalInteger(searchParams, "skip", input.skip);
  return searchParams;
}

function appendStringArray(searchParams: URLSearchParams, name: string, value: unknown) {
  if (!Array.isArray(value)) return;
  for (const item of value) {
    if (typeof item === "string") {
      searchParams.append(name, item);
    }
  }
}

function setOptionalString(searchParams: URLSearchParams, name: string, value: unknown) {
  const parsed = optionalString(value);
  if (parsed !== undefined) {
    searchParams.set(name, parsed);
  }
}

function setOptionalBoolean(searchParams: URLSearchParams, name: string, value: unknown) {
  const parsed = optionalBoolean(value);
  if (parsed !== undefined) {
    searchParams.set(name, String(parsed));
  }
}

function setOptionalJson(searchParams: URLSearchParams, name: string, value: unknown) {
  if (value !== undefined) {
    searchParams.set(name, JSON.stringify(value));
  }
}

function setOptionalInteger(searchParams: URLSearchParams, name: string, value: unknown) {
  const parsed = optionalInteger(value);
  if (parsed !== undefined) {
    searchParams.set(name, String(parsed));
  }
}

function encodePath(value: unknown) {
  return encodeURIComponent(String(value));
}
