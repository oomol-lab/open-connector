import type {
  CredentialValidationResult,
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ElasticsearchActionName } from "./actions.ts";

import { Buffer } from "node:buffer";
import { optionalBoolean, optionalNumber, optionalRecord, optionalString } from "../../core/cast.ts";
import { assertPublicHttpUrl } from "../../core/request.ts";
import {
  createProviderProxyUrl,
  defineProviderExecutors,
  normalizeProviderProxyHeaders,
  ProviderRequestError,
  providerUserAgent,
  readProviderProxyResponse,
  requireApiKeyCredential,
  requireCustomCredential,
  toProviderProxyError,
} from "../provider-runtime.ts";
import { elasticsearchExpandWildcardValues } from "./actions.ts";

const elasticsearchUserAgent = providerUserAgent;
const elasticsearchIndexInfoColumns = [
  "health",
  "status",
  "index",
  "uuid",
  "pri",
  "rep",
  "docs.count",
  "docs.deleted",
  "store.size",
  "pri.store.size",
  "creation.date",
  "creation.date.string",
] as const;

type ElasticsearchActionContext = {
  baseUrl: string;
  authorization: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
};

type ElasticsearchRequestInput = {
  baseUrl: string;
  authorization: string;
  method: "GET" | "POST";
  path: string;
  query?: Record<string, string | number | boolean | undefined>;
  body?: Record<string, unknown>;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  phase: "validate" | "execute";
};

type ElasticsearchRequestResult<T> = {
  payload: T;
  status: number;
};

type ElasticsearchActionHandler = (
  input: Record<string, unknown>,
  context: ElasticsearchActionContext,
) => Promise<unknown>;

export const elasticsearchActionHandlers: Record<ElasticsearchActionName, ElasticsearchActionHandler> = {
  ping_cluster(_input: Record<string, unknown>, context: ElasticsearchActionContext): Promise<unknown> {
    return pingElasticsearchCluster(context);
  },
  list_indices(input: Record<string, unknown>, context: ElasticsearchActionContext): Promise<unknown> {
    return listElasticsearchIndices(input, context);
  },
  get_index_schema(input: Record<string, unknown>, context: ElasticsearchActionContext): Promise<unknown> {
    return getElasticsearchIndexSchema(input, context);
  },
  query_index(input: Record<string, unknown>, context: ElasticsearchActionContext): Promise<unknown> {
    return queryElasticsearchIndex(input, context);
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<ElasticsearchActionContext>({
  service: "elasticsearch",
  handlers: elasticsearchActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<ElasticsearchActionContext> {
    const credential = await context.getCredential("elasticsearch");
    if (credential?.authType === "api_key") {
      const apiKeyCredential = await requireApiKeyCredential(context, "elasticsearch");
      return {
        baseUrl: normalizeElasticsearchBaseUrl(apiKeyCredential.values.baseUrl ?? apiKeyCredential.metadata.baseUrl),
        authorization: buildApiKeyAuthHeader(requireElasticsearchField(apiKeyCredential.apiKey, "apiKey")),
        fetcher,
        signal: context.signal,
      };
    }

    const customCredential = await requireCustomCredential(context, "elasticsearch");
    return {
      baseUrl: normalizeElasticsearchBaseUrl(customCredential.values.baseUrl ?? customCredential.metadata.baseUrl),
      authorization: buildBasicAuthHeader(
        requireElasticsearchField(customCredential.values.username, "username"),
        requireElasticsearchField(customCredential.values.password, "password"),
      ),
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = async (input, context) => {
  try {
    const credential = await context.getCredential("elasticsearch");
    let baseUrl: string;
    let authorization: string;
    if (credential?.authType === "api_key") {
      const apiKeyCredential = await requireApiKeyCredential(context, "elasticsearch");
      baseUrl = normalizeElasticsearchBaseUrl(apiKeyCredential.values.baseUrl ?? apiKeyCredential.metadata.baseUrl);
      authorization = buildApiKeyAuthHeader(requireElasticsearchField(apiKeyCredential.apiKey, "apiKey"));
    } else {
      const customCredential = await requireCustomCredential(context, "elasticsearch");
      baseUrl = normalizeElasticsearchBaseUrl(customCredential.values.baseUrl ?? customCredential.metadata.baseUrl);
      authorization = buildBasicAuthHeader(
        requireElasticsearchField(customCredential.values.username, "username"),
        requireElasticsearchField(customCredential.values.password, "password"),
      );
    }

    const url = createProviderProxyUrl(baseUrl, input.endpoint, input.query);
    const headers = normalizeProviderProxyHeaders(input.headers);
    headers.set("authorization", authorization);
    headers.set("user-agent", elasticsearchUserAgent);

    const init: RequestInit = {
      method: input.method,
      headers,
      signal: context.signal,
    };
    if (input.body !== undefined) {
      init.body = typeof input.body === "string" ? input.body : JSON.stringify(input.body);
      if (!headers.has("content-type") && typeof input.body !== "string") {
        headers.set("content-type", "application/json");
      }
    }

    const response = await fetch(url, init);
    if (!response.ok) {
      throw new ProviderRequestError(response.status, await readElasticsearchError(response));
    }

    return {
      ok: true,
      response: await readProviderProxyResponse(response),
    };
  } catch (error) {
    return toProviderProxyError(error, "elasticsearch request failed");
  }
};

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    const baseUrl = normalizeElasticsearchBaseUrl(input.values.baseUrl);
    const { payload } = await elasticsearchRequest<Record<string, unknown>>({
      baseUrl,
      authorization: buildApiKeyAuthHeader(requireElasticsearchField(input.apiKey, "apiKey")),
      method: "GET",
      path: "/_security/_authenticate",
      fetcher,
      signal,
      phase: "validate",
    });
    const authenticatedUsername = optionalString(payload.username)?.trim();
    const fullName = optionalString(payload.full_name)?.trim();
    const apiKeyMetadata = optionalRecord(payload.api_key);
    const apiKeyId = optionalString(apiKeyMetadata?.id)?.trim();
    const apiKeyName = optionalString(apiKeyMetadata?.name)?.trim();
    const accountId = apiKeyId ?? authenticatedUsername ?? "api_key";
    const accountName = apiKeyName ?? fullName ?? authenticatedUsername ?? "API Key";

    return {
      profile: {
        accountId: `elasticsearch:${buildInstanceKey(baseUrl)}:${accountId}`,
        displayName: `Elasticsearch - ${accountName}`,
      },
      grantedScopes: [],
      metadata: {
        baseUrl,
        ...(apiKeyId ? { apiKeyId } : {}),
        ...(apiKeyName ? { apiKeyName } : {}),
        ...(authenticatedUsername ? { username: authenticatedUsername } : {}),
      },
    };
  },
  async customCredential(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    const baseUrl = normalizeElasticsearchBaseUrl(input.values.baseUrl);
    const username = requireElasticsearchField(input.values.username, "username");
    const password = requireElasticsearchField(input.values.password, "password");
    const { payload } = await elasticsearchRequest<Record<string, unknown>>({
      baseUrl,
      authorization: buildBasicAuthHeader(username, password),
      method: "GET",
      path: "/_security/_authenticate",
      fetcher,
      signal,
      phase: "validate",
    });
    const authenticatedUsername = optionalString(payload.username)?.trim() || username;
    const fullName = optionalString(payload.full_name)?.trim();

    return {
      profile: {
        accountId: `elasticsearch:${buildInstanceKey(baseUrl)}:${authenticatedUsername}`,
        displayName: fullName || `Elasticsearch - ${authenticatedUsername}`,
      },
      grantedScopes: [],
      metadata: {
        baseUrl,
        username: authenticatedUsername,
      },
    };
  },
};

async function pingElasticsearchCluster(context: ElasticsearchActionContext) {
  const { payload, status } = await elasticsearchRequest<Record<string, unknown>>({
    ...context,
    method: "GET",
    path: "/_cluster/health",
    phase: "execute",
  });
  const clusterStatus = optionalString(payload.status) ?? null;
  const clusterName = optionalString(payload.cluster_name) ?? null;

  return {
    isRunning: true,
    statusCode: status,
    status: clusterStatus,
    clusterName,
    message: clusterStatus
      ? `Elasticsearch cluster is reachable with ${clusterStatus} health.`
      : "Elasticsearch cluster is reachable.",
  };
}

async function listElasticsearchIndices(input: Record<string, unknown>, context: ElasticsearchActionContext) {
  const index = optionalString(input.index)?.trim();
  const { payload } = await elasticsearchRequest<unknown>({
    ...context,
    method: "GET",
    path: index ? `/_cat/indices/${encodePathSegment(index)}` : "/_cat/indices",
    query: {
      format: "json",
      h: elasticsearchIndexInfoColumns.join(","),
      health: optionalString(input.health),
      s: optionalString(input.sortBy),
      expand_wildcards: normalizeElasticsearchExpandWildcards(input.expandWildcards),
      pri: optionalBoolean(input.includePrimaryShardsOnly) ? true : undefined,
    },
    phase: "execute",
  });
  const indices = Array.isArray(payload)
    ? payload.map((item) => normalizeElasticsearchIndexInfo(optionalRecord(item) ?? {}))
    : [];

  return { indices };
}

async function getElasticsearchIndexSchema(input: Record<string, unknown>, context: ElasticsearchActionContext) {
  const indexName = requireElasticsearchField(input.indexName, "indexName");
  const { payload } = await elasticsearchRequest<Record<string, unknown>>({
    ...context,
    method: "GET",
    path: `/${encodePathSegment(indexName)}`,
    query: {
      features: "aliases,mappings,settings",
    },
    phase: "execute",
  });
  const indexPayload = optionalRecord(payload[indexName]) ?? firstObjectValue(payload);
  if (!indexPayload) {
    throw new ProviderRequestError(502, "elasticsearch index schema response is empty");
  }

  const aliases = optionalRecord(indexPayload.aliases) ?? {};
  const mappings = optionalRecord(indexPayload.mappings) ?? {};
  const settings = optionalRecord(indexPayload.settings) ?? {};

  return {
    indexName,
    schema: {
      aliases,
      mappings,
      settings,
    },
    statistics: collectMappingStatistics(mappings),
  };
}

async function queryElasticsearchIndex(input: Record<string, unknown>, context: ElasticsearchActionContext) {
  const indexName = requireElasticsearchField(input.indexName, "indexName");
  const from = readNumber(input.from, 0);
  const size = readNumber(input.size, 10);
  const body = buildSearchBody(input, from, size);
  const { payload } = await elasticsearchRequest<Record<string, unknown>>({
    ...context,
    method: "POST",
    path: `/${encodePathSegment(indexName)}/_search`,
    body,
    phase: "execute",
  });

  return normalizeSearchResponse(indexName, payload, from, size);
}

function buildSearchBody(input: Record<string, unknown>, from: number, size: number) {
  const query = optionalString(input.query)?.trim();
  const filters = [
    ...normalizeTermFilters(input.termFilters),
    ...normalizeRangeFilters(input.rangeFilters),
    ...normalizeTimeFilter(input.timeFilter),
  ];
  const body: Record<string, unknown> = {
    from,
    size,
    query: buildSearchQuery(query, filters),
  };
  const fields = normalizeStringArray(input.fields);
  if (fields) {
    body._source = fields;
  }
  const sort = normalizeSortFields(input.sort);
  if (sort) {
    body.sort = sort;
  }
  if (optionalBoolean(input.highlight)) {
    body.highlight = {
      fields: Object.fromEntries((fields ?? ["*"]).map((field) => [field, {}] as const)),
    };
  }

  return body;
}

function buildSearchQuery(query: string | undefined, filters: Record<string, unknown>[]) {
  const must = query ? [{ query_string: { query } }] : [];
  if (must.length > 0 || filters.length > 0) {
    return {
      bool: {
        ...(must.length > 0 ? { must } : {}),
        ...(filters.length > 0 ? { filter: filters } : {}),
      },
    };
  }

  return { match_all: {} };
}

function normalizeTermFilters(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => optionalRecord(item))
    .filter((item): item is Record<string, unknown> => item != null)
    .map((item) => ({
      term: {
        [requireElasticsearchField(item.field, "termFilters.field")]: item.value,
      },
    }));
}

function normalizeRangeFilters(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => optionalRecord(item))
    .filter((item): item is Record<string, unknown> => item != null)
    .map((item) => normalizeRangeFilter(item, "rangeFilters.field"));
}

function normalizeTimeFilter(value: unknown) {
  const filter = optionalRecord(value);
  return filter ? [normalizeRangeFilter(filter, "timeFilter.field")] : [];
}

function normalizeRangeFilter(filter: Record<string, unknown>, fieldName: string) {
  const field = requireElasticsearchField(filter.field, fieldName);
  const range = Object.fromEntries(
    (["gt", "gte", "lt", "lte"] as const)
      .map((key) => [key, filter[key]] as const)
      .filter(([, value]) => value !== undefined),
  );
  if (Object.keys(range).length === 0) {
    throw new ProviderRequestError(400, `${fieldName} requires at least one range bound`);
  }

  return {
    range: {
      [field]: range,
    },
  };
}

function normalizeSortFields(value: unknown) {
  if (!Array.isArray(value) || value.length === 0) {
    return undefined;
  }

  return value
    .map((item) => optionalRecord(item))
    .filter((item): item is Record<string, unknown> => item != null)
    .map((item) => ({
      [requireElasticsearchField(item.field, "sort.field")]: {
        order: optionalString(item.order) ?? "asc",
      },
    }));
}

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value) || value.length === 0) {
    return undefined;
  }

  const normalized = value.map((item) => optionalString(item)?.trim()).filter((item): item is string => Boolean(item));
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeElasticsearchExpandWildcards(value: unknown) {
  const raw = optionalString(value)?.trim();
  if (!raw) {
    return undefined;
  }

  const parts = raw
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  const allowedValues = elasticsearchExpandWildcardValues as readonly string[];
  if (parts.some((part) => !allowedValues.includes(part))) {
    return undefined;
  }
  return parts.join(",");
}

async function elasticsearchRequest<T>(input: ElasticsearchRequestInput): Promise<ElasticsearchRequestResult<T>> {
  const url = buildElasticsearchUrl(input.baseUrl, input.path, input.query);
  const response = await input.fetcher(url.toString(), {
    method: input.method,
    headers: {
      accept: "application/json",
      authorization: input.authorization,
      "user-agent": elasticsearchUserAgent,
      ...(input.body !== undefined ? { "content-type": "application/json" } : {}),
    },
    ...(input.body !== undefined ? { body: JSON.stringify(input.body) } : {}),
    signal: input.signal,
  });

  if (response.ok) {
    return {
      payload: (await readElasticsearchPayload(response)) as T,
      status: response.status,
    };
  }

  const message = await readElasticsearchError(response);
  if (response.status === 429) {
    throw new ProviderRequestError(429, message);
  }
  if (input.phase === "validate" && (response.status === 401 || response.status === 403)) {
    throw new ProviderRequestError(400, message);
  }
  if (input.phase === "execute" && response.status === 401) {
    throw new ProviderRequestError(401, message);
  }
  if (input.phase === "execute" && response.status === 403) {
    throw new ProviderRequestError(403, message);
  }
  if (response.status === 400 || response.status === 404) {
    throw new ProviderRequestError(400, message);
  }

  throw new ProviderRequestError(response.status >= 500 ? 502 : response.status, message);
}

function buildElasticsearchUrl(
  baseUrl: string,
  path: string,
  query?: Record<string, string | number | boolean | undefined>,
) {
  let normalizedBaseUrl = baseUrl;
  if (!normalizedBaseUrl.endsWith("/")) {
    normalizedBaseUrl = `${normalizedBaseUrl}/`;
  }

  let normalizedPath = path;
  while (normalizedPath.startsWith("/")) {
    normalizedPath = normalizedPath.slice(1);
  }

  const url = new URL(normalizedPath, normalizedBaseUrl);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined) {
      continue;
    }
    url.searchParams.set(key, String(value));
  }
  return url;
}

function normalizeElasticsearchBaseUrl(value: unknown) {
  const trimmed = optionalString(value);
  if (!trimmed) {
    throw new ProviderRequestError(400, "baseUrl is required");
  }

  let parsed: URL;
  try {
    parsed = assertPublicHttpUrl(trimmed, {
      fieldName: "baseUrl",
      createError: (message) => new ProviderRequestError(400, message),
    });
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(400, "baseUrl must be a valid absolute URL");
  }

  if (parsed.protocol !== "https:") {
    throw new ProviderRequestError(400, "baseUrl must use HTTPS");
  }
  if (parsed.username || parsed.password) {
    throw new ProviderRequestError(400, "baseUrl must not include username or password");
  }

  parsed.search = "";
  parsed.hash = "";

  let pathname = parsed.pathname;
  while (pathname.endsWith("/") && pathname !== "/") {
    pathname = pathname.slice(0, -1);
  }
  parsed.pathname = pathname;

  return `${parsed.origin}${parsed.pathname === "/" ? "" : parsed.pathname}`;
}

function buildBasicAuthHeader(username: string, password: string) {
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
}

function buildApiKeyAuthHeader(apiKey: string) {
  return `ApiKey ${apiKey}`;
}

function encodePathSegment(value: string) {
  return encodeURIComponent(value);
}

async function readElasticsearchPayload(response: Response) {
  if (response.status === 204) {
    return null;
  }
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return response.json();
  }
  return response.text();
}

async function readElasticsearchError(response: Response) {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return `elasticsearch request failed with ${response.status}`;
  }

  try {
    const payload = JSON.parse(text) as Record<string, unknown>;
    const error = payload.error;
    if (typeof error === "string" && error.trim()) {
      return error;
    }

    const errorObject = optionalRecord(error);
    const rootCause = Array.isArray(errorObject?.root_cause) ? optionalRecord(errorObject.root_cause[0]) : undefined;
    const reason =
      optionalString(errorObject?.reason) ?? optionalString(rootCause?.reason) ?? optionalString(payload.message);
    const type = optionalString(errorObject?.type) ?? optionalString(rootCause?.type);
    if (reason && type) {
      return `${reason} (${type})`;
    }
    if (reason) {
      return reason;
    }
  } catch {
    return text.trim();
  }

  return text.trim();
}

function normalizeElasticsearchIndexInfo(payload: Record<string, unknown>) {
  return {
    index: optionalString(payload.index) ?? "",
    health: optionalString(payload.health) ?? null,
    status: optionalString(payload.status) ?? null,
    uuid: optionalString(payload.uuid) ?? null,
    primaryShards: optionalString(payload.pri) ?? null,
    replicaShards: optionalString(payload.rep) ?? null,
    docsCount: optionalString(payload["docs.count"]) ?? null,
    docsDeleted: optionalString(payload["docs.deleted"]) ?? null,
    storeSize: optionalString(payload["store.size"]) ?? null,
    primaryStoreSize: optionalString(payload["pri.store.size"]) ?? null,
    creationDate: optionalString(payload["creation.date"]) ?? null,
    creationDateString: optionalString(payload["creation.date.string"]) ?? null,
  };
}

function normalizeSearchResponse(indexName: string, payload: Record<string, unknown>, from: number, size: number) {
  const hitsContainer = optionalRecord(payload.hits) ?? {};
  const hits = Array.isArray(hitsContainer.hits)
    ? hitsContainer.hits.map((item) => normalizeSearchHit(optionalRecord(item) ?? {}))
    : [];
  const totalHits = normalizeTotalHits(hitsContainer.total);
  const aggregations = optionalRecord(payload.aggregations);

  return {
    indexName,
    totalHits,
    hits,
    pagination: {
      from,
      size,
      returned: hits.length,
      hasMore: from + hits.length < totalHits,
    },
    took: readOptionalInteger(payload.took),
    timedOut: optionalBoolean(payload.timed_out) ?? null,
    maxScore: optionalNumber(hitsContainer.max_score) ?? null,
    ...(aggregations
      ? {
          aggregations: Object.entries(aggregations).map(([name, result]) => ({
            name,
            result: optionalRecord(result) ?? {},
          })),
        }
      : {}),
  };
}

function normalizeSearchHit(payload: Record<string, unknown>) {
  const source = optionalRecord(payload._source) ?? {};
  const highlight = optionalRecord(payload.highlight);
  return {
    index: optionalString(payload._index) ?? "",
    id: optionalString(payload._id) ?? "",
    score: optionalNumber(payload._score) ?? null,
    source,
    ...(highlight
      ? {
          highlight: Object.fromEntries(
            Object.entries(highlight)
              .map(([key, value]) => [key, Array.isArray(value) ? value.map(String) : []] as const)
              .filter(([, value]) => value.length > 0),
          ),
        }
      : {}),
  };
}

function normalizeTotalHits(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.trunc(value));
  }

  const object = optionalRecord(value);
  const nestedValue = optionalNumber(object?.value);
  if (nestedValue !== undefined && Number.isFinite(nestedValue)) {
    return Math.max(0, Math.trunc(nestedValue));
  }

  return 0;
}

function collectMappingStatistics(mappings: Record<string, unknown>) {
  const fieldTypes: Record<string, number> = {};
  let totalFields = 0;

  function visitProperties(properties: unknown) {
    const object = optionalRecord(properties);
    if (!object) {
      return;
    }

    for (const field of Object.values(object)) {
      const fieldObject = optionalRecord(field);
      if (!fieldObject) {
        continue;
      }
      totalFields += 1;
      const type = optionalString(fieldObject.type) ?? "object";
      fieldTypes[type] = (fieldTypes[type] ?? 0) + 1;
      visitProperties(fieldObject.properties);
    }
  }

  visitProperties(mappings.properties);
  return {
    totalFields,
    fieldTypes,
  };
}

function firstObjectValue(value: Record<string, unknown>) {
  for (const child of Object.values(value)) {
    const object = optionalRecord(child);
    if (object) {
      return object;
    }
  }
  return undefined;
}

function readNumber(value: unknown, fallback: number) {
  const numberValue = optionalNumber(value);
  return numberValue === undefined ? fallback : numberValue;
}

function readOptionalInteger(value: unknown) {
  const numberValue = optionalNumber(value);
  if (numberValue === undefined || !Number.isFinite(numberValue)) {
    return null;
  }
  return Math.trunc(numberValue);
}

function requireElasticsearchField(value: unknown, name: string) {
  const resolved = optionalString(value)?.trim();
  if (!resolved) {
    throw new ProviderRequestError(400, `${name} is required`);
  }
  return resolved;
}

function buildInstanceKey(baseUrl: string) {
  const parsed = new URL(baseUrl);
  return parsed.pathname === "/" ? parsed.host : `${parsed.host}${parsed.pathname}`;
}
