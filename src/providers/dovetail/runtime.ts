import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject } from "../../core/cast.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

export const dovetailApiBaseUrl = "https://dovetail.com/api";

type DovetailRequestPhase = "validate" | "execute";
type DovetailActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

type DovetailQueryValue = string | number | boolean | undefined;

export const dovetailActionHandlers: ProviderActionHandlers<"dovetail", DovetailActionHandler> = {
  get_token_info(input, context) {
    return getTokenInfo(input, context);
  },
  list_projects(input, context) {
    return listProjects(input, context);
  },
  list_data(input, context) {
    return listData(input, context);
  },
  get_data(input, context) {
    return getData(input, context);
  },
  create_data(input, context) {
    return createData(input, context);
  },
  update_data(input, context) {
    return updateData(input, context);
  },
  export_data(input, context) {
    return exportData(input, context);
  },
};

export async function validateDovetailCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const token = await readTokenInfo(apiKey, fetcher, "validate", signal);
  const subdomain = readRequiredString(token.subdomain, "Dovetail token subdomain");
  const tokenId = readRequiredString(token.id, "Dovetail token id");

  return {
    profile: { accountId: tokenId, displayName: subdomain },
    grantedScopes: [],
    metadata: compactObject({
      tokenId,
      subdomain,
      apiBaseUrl: dovetailApiBaseUrl,
      validationEndpoint: "/v1/token/info",
    }),
  };
}

async function getTokenInfo(input: Record<string, unknown>, context: ApiKeyProviderContext) {
  return {
    token: await readTokenInfo(context.apiKey, context.fetcher, "execute", context.signal),
  };
}

async function listProjects(input: Record<string, unknown>, context: ApiKeyProviderContext) {
  const root = await requestDovetailJson({
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    path: "/v1/projects",
    method: "GET",
    phase: "execute",
    query: buildProjectsQuery(input),
    signal: context.signal,
  });

  return {
    projects: readDataArray(root, "Dovetail projects response"),
    ...readPageMetadata(root, "Dovetail projects response"),
  };
}

async function listData(input: Record<string, unknown>, context: ApiKeyProviderContext) {
  const root = await requestDovetailJson({
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    path: "/v1/data",
    method: "GET",
    phase: "execute",
    query: buildDataQuery(input),
    signal: context.signal,
  });

  return {
    dataItems: readDataArray(root, "Dovetail data response"),
    ...readPageMetadata(root, "Dovetail data response"),
  };
}

async function getData(input: Record<string, unknown>, context: ApiKeyProviderContext) {
  const dataId = requireInputString(input, "dataId");
  const root = await requestDovetailJson({
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    path: `/v1/data/${encodeURIComponent(dataId)}`,
    method: "GET",
    phase: "execute",
    signal: context.signal,
  });

  return {
    dataItem: readDataObject(root, "Dovetail data response"),
  };
}

async function createData(input: Record<string, unknown>, context: ApiKeyProviderContext) {
  const body = compactObject({
    project_id: requireInputString(input, "projectId"),
    title: readOptionalInputString(input, "title"),
    content: readOptionalInputString(input, "content"),
    fields: readOptionalArray(input.fields),
  });
  const root = await requestDovetailJson({
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    path: "/v1/data",
    method: "POST",
    phase: "execute",
    body,
    signal: context.signal,
  });

  return {
    dataItem: readDataObject(root, "Dovetail create data response"),
  };
}

async function updateData(input: Record<string, unknown>, context: ApiKeyProviderContext) {
  const dataId = requireInputString(input, "dataId");
  const body = compactObject({
    title: readOptionalInputString(input, "title"),
    fields: readOptionalArray(input.fields),
  });
  const root = await requestDovetailJson({
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    path: `/v1/data/${encodeURIComponent(dataId)}`,
    method: "PATCH",
    phase: "execute",
    body,
    signal: context.signal,
  });

  return {
    dataItem: readDataObject(root, "Dovetail update data response"),
  };
}

async function exportData(input: Record<string, unknown>, context: ApiKeyProviderContext) {
  const dataId = requireInputString(input, "dataId");
  const format = requireInputString(input, "format");
  const root = await requestDovetailJson({
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    path: `/v1/data/${encodeURIComponent(dataId)}/export/${encodeURIComponent(format)}`,
    method: "GET",
    phase: "execute",
    signal: context.signal,
  });

  return {
    exportedData: readDataObject(root, "Dovetail export data response"),
  };
}

async function readTokenInfo(apiKey: string, fetcher: typeof fetch, phase: DovetailRequestPhase, signal?: AbortSignal) {
  const root = await requestDovetailJson({
    apiKey,
    fetcher,
    path: "/v1/token/info",
    method: "GET",
    phase,
    signal,
  });

  return readDataObject(root, "Dovetail token response");
}

async function requestDovetailJson(input: {
  apiKey: string;
  fetcher: typeof fetch;
  path: string;
  method: "GET" | "POST" | "PATCH";
  phase: DovetailRequestPhase;
  query?: Record<string, DovetailQueryValue>;
  body?: unknown;
  signal?: AbortSignal;
}) {
  const response = await dovetailFetch(input);
  const payload = await readDovetailPayload(response);

  if (!response.ok) {
    throw buildDovetailError(response.status, payload, input.phase);
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new ProviderRequestError(502, "Dovetail returned invalid JSON");
  }

  return payload as Record<string, unknown>;
}

async function dovetailFetch(input: {
  apiKey: string;
  fetcher: typeof fetch;
  path: string;
  method: "GET" | "POST" | "PATCH";
  query?: Record<string, DovetailQueryValue>;
  body?: unknown;
  signal?: AbortSignal;
}) {
  const url = new URL(normalizePath(input.path), `${dovetailApiBaseUrl}/`);

  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value === undefined) {
      continue;
    }
    url.searchParams.set(key, String(value));
  }

  try {
    return await input.fetcher(url, {
      method: input.method,
      headers: buildDovetailHeaders(input.apiKey, input.body !== undefined),
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: input.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Dovetail request failed: ${error.message}` : "Dovetail request failed",
    );
  }
}

function buildDovetailHeaders(apiKey: string, hasBody: boolean) {
  const headers: Record<string, string> = {
    Accept: "application/json",
    Authorization: `Bearer ${apiKey}`,
    "User-Agent": providerUserAgent,
  };

  if (hasBody) {
    headers["Content-Type"] = "application/json";
  }

  return headers;
}

async function readDovetailPayload(response: Response) {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Dovetail returned invalid JSON");
  }
}

function buildDovetailError(status: number, payload: unknown, phase: DovetailRequestPhase) {
  const message =
    extractDovetailErrorMessage(payload) ??
    (phase === "validate" ? "invalid Dovetail personal API key" : `Dovetail request failed with ${status}`);

  if (status === 400) {
    return new ProviderRequestError(400, message);
  }

  if (status === 401) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message);
  }

  if (status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : 403, message);
  }

  if (status === 404) {
    return new ProviderRequestError(404, message);
  }

  if (status === 429) {
    return new ProviderRequestError(429, message);
  }

  return new ProviderRequestError(status || 500, message);
}

function buildProjectsQuery(input: Record<string, unknown>) {
  return compactObject({
    "page[start_cursor]": readOptionalInputString(input, "startCursor"),
    "page[limit]": readOptionalNumber(input.limit),
    sort: readOptionalInputString(input, "sort"),
    "filter[title][contains]": readOptionalInputString(input, "titleContains"),
  });
}

function buildDataQuery(input: Record<string, unknown>) {
  return compactObject({
    "page[start_cursor]": readOptionalInputString(input, "startCursor"),
    "page[limit]": readOptionalNumber(input.limit),
    sort: readOptionalInputString(input, "sort"),
    "filter[project_id]": readOptionalInputString(input, "projectId"),
    "filter[title][contains]": readOptionalInputString(input, "titleContains"),
    "filter[created_at][gte]": readOptionalInputString(input, "createdAtGte"),
    "filter[created_at][lte]": readOptionalInputString(input, "createdAtLte"),
  });
}

function readPageMetadata(root: Record<string, unknown>, label: string) {
  const page = readRequiredObject(root.page, `${label} page`);

  return {
    totalCount: readRequiredNumber(page.total_count, `${label} page total_count`),
    hasMore: readRequiredBoolean(page.has_more, `${label} page has_more`),
    nextCursor: readNullableString(page.next_cursor, `${label} page next_cursor`),
  };
}

function extractDovetailErrorMessage(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return undefined;
  }

  const errors = (payload as Record<string, unknown>).errors;
  if (!Array.isArray(errors) || errors.length === 0) {
    return undefined;
  }

  const firstError = errors[0];
  if (!firstError || typeof firstError !== "object" || Array.isArray(firstError)) {
    return undefined;
  }

  const message = (firstError as Record<string, unknown>).message;
  if (typeof message === "string" && message.trim().length > 0) {
    return message;
  }

  const title = (firstError as Record<string, unknown>).title;
  if (typeof title === "string" && title.trim().length > 0) {
    return title;
  }

  return undefined;
}

function normalizePath(path: string) {
  return path.startsWith("/") ? path.slice(1) : path;
}

function readDataArray(root: Record<string, unknown>, label: string) {
  const data = root.data;
  if (!Array.isArray(data)) {
    throw new ProviderRequestError(502, `${label} must contain a data array`);
  }

  return data.map((item) => readRequiredObject(item, `${label} item`));
}

function readDataObject(root: Record<string, unknown>, label: string) {
  return readRequiredObject(root.data, `${label} data`);
}

function readRequiredObject(value: unknown, label: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ProviderRequestError(502, `${label} must be an object`);
  }

  return value as Record<string, unknown>;
}

function readRequiredString(value: unknown, label: string) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ProviderRequestError(502, `${label} must be a non-empty string`);
  }

  return value;
}

function readNullableString(value: unknown, label: string) {
  if (value === null) {
    return null;
  }

  return readRequiredString(value, label);
}

function readRequiredNumber(value: unknown, label: string) {
  if (typeof value !== "number") {
    throw new ProviderRequestError(502, `${label} must be a number`);
  }

  return value;
}

function readRequiredBoolean(value: unknown, label: string) {
  if (typeof value !== "boolean") {
    throw new ProviderRequestError(502, `${label} must be a boolean`);
  }

  return value;
}

function requireInputString(input: Record<string, unknown>, key: string) {
  const value = input[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ProviderRequestError(400, `${key} is required`);
  }

  return value;
}

function readOptionalInputString(input: Record<string, unknown>, key: string) {
  const value = input[key];
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function readOptionalNumber(value: unknown) {
  return typeof value === "number" ? value : undefined;
}

function readOptionalArray(value: unknown) {
  return Array.isArray(value) ? value : undefined;
}
