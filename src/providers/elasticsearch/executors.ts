import type {
  CredentialValidationResult,
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { Buffer } from "node:buffer";
import { optionalBoolean, optionalNumber, optionalRecord, optionalString } from "../../core/cast.ts";
import { assertPublicHttpUrl, encodePathSegment, isPrivateNetworkAccessAllowed } from "../../core/request.ts";
import {
  createProviderFetch,
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

const elasticsearchFetch = createProviderFetch({ allowPrivateNetwork: isPrivateNetworkAccessAllowed });
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
const elasticsearchShardColumns = [
  "index",
  "shard",
  "prirep",
  "state",
  "docs",
  "store",
  "node",
  "unassigned.reason",
] as const;
const elasticsearchIndexStatsMetrics = "docs,store,search,indexing,get";
const elasticsearchNodeUptimeFilterPath = "nodes.*.name,nodes.*.jvm.uptime_in_millis";
const elasticsearchClusterNodesFilterPath =
  "cluster_name,nodes.*.name,nodes.*.roles,nodes.*.host,nodes.*.jvm.uptime_in_millis,nodes.*.jvm.mem.heap_used_percent,nodes.*.fs.total.total_in_bytes,nodes.*.fs.total.free_in_bytes,nodes.*.os.cpu.percent";
const elasticsearchCounterWindowNote =
  "Search and get counters are cumulative since each node started and reset on restart. Compare them against node uptime before concluding an index is unused.";
const elasticsearchLongRunningTimeoutMs = 55_000;
const elasticsearchFailureChainDepth = 4;

type ElasticsearchActionContext = {
  baseUrl: string;
  authorization: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
};

type ElasticsearchRequestInput = {
  baseUrl: string;
  authorization: string;
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  query?: Record<string, string | number | boolean | undefined>;
  body?: Record<string, unknown>;
  ndjsonBody?: string;
  allowNotFound?: boolean;
  timeoutMs?: number;
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

export const elasticsearchActionHandlers: ProviderActionHandlers<"elasticsearch", ElasticsearchActionHandler> = {
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
  create_index: createElasticsearchIndex,
  delete_index: deleteElasticsearchIndices,
  update_index_mappings: updateElasticsearchIndexMappings,
  get_index_stats: getElasticsearchIndexStats,
  list_aliases: listElasticsearchAliases,
  update_aliases: updateElasticsearchAliases,
  get_cluster_health: getElasticsearchClusterHealth,
  get_cluster_nodes: (_input, context) => getElasticsearchClusterNodes(context),
  list_shards: listElasticsearchShards,
  get_document: getElasticsearchDocument,
  index_document: indexElasticsearchDocument,
  delete_document: deleteElasticsearchDocument,
  bulk_index_documents: bulkIndexElasticsearchDocuments,
  count_documents: countElasticsearchDocuments,
  delete_by_query: deleteElasticsearchDocumentsByQuery,
  reindex: startElasticsearchReindex,
  get_task: getElasticsearchTask,
};

export const executors: ProviderExecutors = defineProviderExecutors<ElasticsearchActionContext>({
  service: "elasticsearch",
  handlers: elasticsearchActionHandlers,
  allowPrivateNetwork: isPrivateNetworkAccessAllowed,
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

    const response = await elasticsearchFetch(url, init);
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
    const guardedFetcher = createProviderFetch({ fetch: fetcher, allowPrivateNetwork: isPrivateNetworkAccessAllowed });
    const baseUrl = normalizeElasticsearchBaseUrl(input.values.baseUrl);
    const { payload } = await elasticsearchRequest<Record<string, unknown>>({
      baseUrl,
      authorization: buildApiKeyAuthHeader(requireElasticsearchField(input.apiKey, "apiKey")),
      method: "GET",
      path: "/_security/_authenticate",
      fetcher: guardedFetcher,
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
    const guardedFetcher = createProviderFetch({ fetch: fetcher, allowPrivateNetwork: isPrivateNetworkAccessAllowed });
    const baseUrl = normalizeElasticsearchBaseUrl(input.values.baseUrl);
    const username = requireElasticsearchField(input.values.username, "username");
    const password = requireElasticsearchField(input.values.password, "password");
    const { payload } = await elasticsearchRequest<Record<string, unknown>>({
      baseUrl,
      authorization: buildBasicAuthHeader(username, password),
      method: "GET",
      path: "/_security/_authenticate",
      fetcher: guardedFetcher,
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
  const body = input.ndjsonBody ?? (input.body !== undefined ? JSON.stringify(input.body) : undefined);
  const response = await input.fetcher(url.toString(), {
    method: input.method,
    headers: {
      accept: "application/json",
      authorization: input.authorization,
      "user-agent": elasticsearchUserAgent,
      ...(input.ndjsonBody !== undefined
        ? { "content-type": "application/x-ndjson" }
        : input.body !== undefined
          ? { "content-type": "application/json" }
          : {}),
    },
    ...(body !== undefined ? { body } : {}),
    signal: input.signal,
  });

  if (response.ok || (input.allowNotFound && response.status === 404)) {
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

function normalizeElasticsearchBaseUrl(value: unknown, allowPrivateNetwork: boolean = isPrivateNetworkAccessAllowed()) {
  const trimmed = optionalString(value);
  if (!trimmed) {
    throw new ProviderRequestError(400, "baseUrl is required");
  }

  let parsed: URL;
  try {
    parsed = assertPublicHttpUrl(trimmed, {
      fieldName: "baseUrl",
      allowPrivateNetwork,
      createError: (message) => new ProviderRequestError(400, message),
    });
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(400, "baseUrl must be a valid absolute URL");
  }

  if (parsed.protocol !== "https:" && !allowPrivateNetwork) {
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
async function createElasticsearchIndex(input: Record<string, unknown>, context: ElasticsearchActionContext) {
  const indexName = requireElasticsearchField(input.indexName, "indexName");
  const body: Record<string, unknown> = {};
  const mappings = optionalRecord(input.mappings);
  const settings = optionalRecord(input.settings);
  const aliases = optionalRecord(input.aliases);
  if (mappings) {
    body.mappings = mappings;
  }
  if (settings) {
    body.settings = settings;
  }
  if (aliases) {
    body.aliases = aliases;
  }

  const { payload } = await elasticsearchRequest<Record<string, unknown>>({
    ...context,
    method: "PUT",
    path: `/${encodeIndexPattern(indexName)}`,
    ...(Object.keys(body).length > 0 ? { body } : {}),
    phase: "execute",
  });

  return {
    indexName,
    acknowledged: optionalBoolean(payload.acknowledged) ?? false,
    shardsAcknowledged: optionalBoolean(payload.shards_acknowledged) ?? false,
  };
}

async function deleteElasticsearchIndices(input: Record<string, unknown>, context: ElasticsearchActionContext) {
  const indices = normalizeStringArray(input.indices) ?? [];
  if (indices.length === 0) {
    throw new ProviderRequestError(400, "indices is required");
  }
  if (readOptionalInteger(input.expectedCount) !== indices.length) {
    throw new ProviderRequestError(400, "expectedCount must equal the number of indices supplied");
  }
  if (
    new Set(indices).size !== indices.length ||
    indices.some((index) => index === "_all" || index.includes("*") || index.includes("?") || index.includes(","))
  ) {
    throw new ProviderRequestError(400, "indices must contain unique exact index names and must not target _all");
  }

  // Commas delimit Elasticsearch indices, so encode each index separately before joining them.
  const path = `/${indices.map((index) => encodePathSegment(index)).join(",")}`;
  const { payload } = await elasticsearchRequest<Record<string, unknown>>({
    ...context,
    method: "DELETE",
    path,
    query: {
      ignore_unavailable: optionalBoolean(input.ignoreUnavailable) ?? false,
    },
    phase: "execute",
  });

  return {
    acknowledged: optionalBoolean(payload.acknowledged) ?? false,
    deletedIndices: indices,
  };
}

async function updateElasticsearchIndexMappings(input: Record<string, unknown>, context: ElasticsearchActionContext) {
  const indexName = requireElasticsearchField(input.indexName, "indexName");
  if (indexName === "_all") throw new ProviderRequestError(400, "indexName must not target _all");
  const properties = optionalRecord(input.properties);
  if (!properties) {
    throw new ProviderRequestError(400, "properties is required");
  }

  const dynamic = optionalString(input.dynamic)?.trim();
  const { payload } = await elasticsearchRequest<Record<string, unknown>>({
    ...context,
    method: "PUT",
    path: `/${encodeIndexPattern(indexName)}/_mapping`,
    body: {
      properties,
      ...(dynamic ? { dynamic } : {}),
    },
    phase: "execute",
  });

  return {
    indexName,
    acknowledged: optionalBoolean(payload.acknowledged) ?? false,
  };
}

async function getElasticsearchIndexStats(input: Record<string, unknown>, context: ElasticsearchActionContext) {
  const index = optionalString(input.index)?.trim();
  const includeCounterWindow = optionalBoolean(input.includeCounterWindow) ?? true;
  const { payload } = await elasticsearchRequest<Record<string, unknown>>({
    ...context,
    method: "GET",
    path: index
      ? `/${encodeIndexPattern(index)}/_stats/${elasticsearchIndexStatsMetrics}`
      : `/_stats/${elasticsearchIndexStatsMetrics}`,
    phase: "execute",
  });

  const indicesPayload = optionalRecord(payload.indices) ?? {};
  const indices = Object.entries(indicesPayload)
    .map(([name, value]) => normalizeIndexStatsEntry(name, optionalRecord(value) ?? {}))
    .sort((left, right) => compareText(left.index, right.index));

  if (!includeCounterWindow) {
    return { indices, counterWindow: null };
  }

  const { payload: nodesPayload } = await elasticsearchRequest<Record<string, unknown>>({
    ...context,
    method: "GET",
    path: "/_nodes/stats/jvm",
    query: {
      filter_path: elasticsearchNodeUptimeFilterPath,
    },
    phase: "execute",
  });
  const nodes = Object.values(optionalRecord(nodesPayload.nodes) ?? {})
    .map((value) => optionalRecord(value) ?? {})
    .map((node) => ({
      name: optionalString(node.name) ?? "",
      uptimeMs: readOptionalInteger((optionalRecord(node.jvm) ?? {}).uptime_in_millis),
    }))
    .sort((left, right) => compareText(left.name, right.name));

  return {
    indices,
    counterWindow: {
      note: elasticsearchCounterWindowNote,
      nodes,
    },
  };
}

async function listElasticsearchAliases(input: Record<string, unknown>, context: ElasticsearchActionContext) {
  const alias = optionalString(input.alias)?.trim();
  const index = optionalString(input.index)?.trim();
  const indexPrefix = index ? `/${encodeIndexPattern(index)}` : "";
  const aliasSuffix = alias ? `/${encodeIndexPattern(alias)}` : "";
  const { payload } = await elasticsearchRequest<Record<string, unknown>>({
    ...context,
    method: "GET",
    path: `${indexPrefix}/_alias${aliasSuffix}`,
    phase: "execute",
  });

  const aliases: ReturnType<typeof normalizeAliasEntry>[] = [];
  for (const [indexName, indexValue] of Object.entries(payload)) {
    const indexEntry = optionalRecord(indexValue) ?? {};
    for (const [aliasName, aliasValue] of Object.entries(optionalRecord(indexEntry.aliases) ?? {})) {
      aliases.push(normalizeAliasEntry(aliasName, indexName, optionalRecord(aliasValue) ?? {}));
    }
  }
  aliases.sort((left, right) => compareText(left.alias, right.alias) || compareText(left.index, right.index));

  return { aliases };
}

async function updateElasticsearchAliases(input: Record<string, unknown>, context: ElasticsearchActionContext) {
  const actions = readObjectArray(input.actions).map((action) => buildAliasAction(action));
  if (actions.length === 0) {
    throw new ProviderRequestError(400, "actions is required");
  }

  const { payload } = await elasticsearchRequest<Record<string, unknown>>({
    ...context,
    method: "POST",
    path: "/_aliases",
    body: { actions },
    phase: "execute",
  });

  return {
    acknowledged: optionalBoolean(payload.acknowledged) ?? false,
    appliedActions: actions.length,
  };
}

async function getElasticsearchClusterHealth(input: Record<string, unknown>, context: ElasticsearchActionContext) {
  const index = optionalString(input.index)?.trim();
  const level = optionalString(input.level)?.trim() || "cluster";
  const { payload } = await elasticsearchRequest<Record<string, unknown>>({
    ...context,
    method: "GET",
    path: index ? `/_cluster/health/${encodeIndexPattern(index)}` : "/_cluster/health",
    query: { level },
    phase: "execute",
  });

  const indicesPayload = optionalRecord(payload.indices);
  const indices =
    level === "cluster" || !indicesPayload
      ? null
      : Object.entries(indicesPayload)
          .map(([name, value]) => normalizeClusterHealthIndex(name, optionalRecord(value) ?? {}))
          .sort((left, right) => compareText(left.index, right.index));

  return {
    clusterName: optionalString(payload.cluster_name) ?? "",
    status: optionalString(payload.status) ?? "",
    timedOut: optionalBoolean(payload.timed_out) ?? false,
    numberOfNodes: readInteger(payload.number_of_nodes),
    numberOfDataNodes: readInteger(payload.number_of_data_nodes),
    activePrimaryShards: readInteger(payload.active_primary_shards),
    activeShards: readInteger(payload.active_shards),
    relocatingShards: readInteger(payload.relocating_shards),
    initializingShards: readInteger(payload.initializing_shards),
    unassignedShards: readInteger(payload.unassigned_shards),
    delayedUnassignedShards: readInteger(payload.delayed_unassigned_shards),
    numberOfPendingTasks: readInteger(payload.number_of_pending_tasks),
    activeShardsPercent: optionalNumber(payload.active_shards_percent_as_number) ?? null,
    indices,
  };
}

async function getElasticsearchClusterNodes(context: ElasticsearchActionContext) {
  const { payload } = await elasticsearchRequest<Record<string, unknown>>({
    ...context,
    method: "GET",
    path: "/_nodes/stats",
    query: {
      filter_path: elasticsearchClusterNodesFilterPath,
    },
    phase: "execute",
  });

  const nodes = Object.entries(optionalRecord(payload.nodes) ?? {})
    .map(([id, value]) => normalizeClusterNode(id, optionalRecord(value) ?? {}))
    .sort((left, right) => compareText(left.name, right.name));

  return {
    clusterName: optionalString(payload.cluster_name) ?? null,
    nodes,
  };
}

async function listElasticsearchShards(input: Record<string, unknown>, context: ElasticsearchActionContext) {
  const index = optionalString(input.index)?.trim();
  const state = optionalString(input.state)?.trim();
  const { payload } = await elasticsearchRequest<unknown>({
    ...context,
    method: "GET",
    path: index ? `/_cat/shards/${encodeIndexPattern(index)}` : "/_cat/shards",
    query: {
      format: "json",
      h: elasticsearchShardColumns.join(","),
      s: optionalString(input.sortBy),
    },
    phase: "execute",
  });

  const rows = Array.isArray(payload) ? payload : [];
  const shards = rows
    .map((item) => normalizeShardEntry(optionalRecord(item) ?? {}))
    .filter((shard) => !state || shard.state === state);

  return { shards };
}

async function getElasticsearchDocument(input: Record<string, unknown>, context: ElasticsearchActionContext) {
  const indexName = requireElasticsearchField(input.indexName, "indexName");
  const documentId = requireElasticsearchField(input.documentId, "documentId");
  const fields = normalizeStringArray(input.fields);
  const { payload, status } = await elasticsearchRequest<Record<string, unknown>>({
    ...context,
    method: "GET",
    path: `/${encodePathSegment(indexName)}/_doc/${encodePathSegment(documentId)}`,
    query: {
      _source_includes: fields ? fields.join(",") : undefined,
    },
    allowNotFound: true,
    phase: "execute",
  });

  if (status === 404) {
    return {
      index: indexName,
      id: documentId,
      found: false,
      version: null,
      source: null,
    };
  }

  return {
    index: optionalString(payload._index) ?? indexName,
    id: optionalString(payload._id) ?? documentId,
    found: optionalBoolean(payload.found) ?? false,
    version: readOptionalInteger(payload._version),
    source: optionalRecord(payload._source) ?? null,
  };
}

async function indexElasticsearchDocument(input: Record<string, unknown>, context: ElasticsearchActionContext) {
  const indexName = requireElasticsearchField(input.indexName, "indexName");
  const document = optionalRecord(input.document);
  if (!document) {
    throw new ProviderRequestError(400, "document is required");
  }

  const documentId = optionalString(input.documentId)?.trim();
  const opType = optionalString(input.opType)?.trim() || "index";
  const { path, method } = buildIndexDocumentTarget(indexName, documentId, opType);
  const { payload } = await elasticsearchRequest<Record<string, unknown>>({
    ...context,
    method,
    path,
    query: {
      refresh: optionalString(input.refresh) ?? "false",
    },
    body: document,
    phase: "execute",
  });

  const shards = optionalRecord(payload._shards) ?? {};
  return {
    index: optionalString(payload._index) ?? indexName,
    id: optionalString(payload._id) ?? documentId ?? "",
    result: optionalString(payload.result) ?? "",
    version: readOptionalInteger(payload._version),
    successfulShards: readOptionalInteger(shards.successful),
    failedShards: readOptionalInteger(shards.failed),
  };
}

async function deleteElasticsearchDocument(input: Record<string, unknown>, context: ElasticsearchActionContext) {
  const indexName = requireElasticsearchField(input.indexName, "indexName");
  const documentId = requireElasticsearchField(input.documentId, "documentId");
  const { payload, status } = await elasticsearchRequest<Record<string, unknown>>({
    ...context,
    method: "DELETE",
    path: `/${encodePathSegment(indexName)}/_doc/${encodePathSegment(documentId)}`,
    query: {
      refresh: optionalString(input.refresh) ?? "false",
    },
    allowNotFound: true,
    phase: "execute",
  });

  const result = optionalString(payload.result);
  return {
    index: optionalString(payload._index) ?? indexName,
    id: optionalString(payload._id) ?? documentId,
    result: result ?? (status === 404 ? "not_found" : ""),
    version: readOptionalInteger(payload._version),
  };
}

async function bulkIndexElasticsearchDocuments(input: Record<string, unknown>, context: ElasticsearchActionContext) {
  const operations = readObjectArray(input.operations);
  if (operations.length === 0) {
    throw new ProviderRequestError(400, "operations is required");
  }

  const { payload } = await elasticsearchRequest<Record<string, unknown>>({
    ...context,
    method: "POST",
    path: "/_bulk",
    query: {
      refresh: optionalString(input.refresh) ?? "false",
    },
    ndjsonBody: buildBulkNdjson(operations),
    phase: "execute",
  });

  const items = Array.isArray(payload.items) ? payload.items : [];
  const normalizedItems = items.map((item, position) =>
    normalizeBulkItem(optionalRecord(item) ?? {}, operations[position]),
  );
  const failureCount = normalizedItems.filter((item) => item.error !== null).length;

  return {
    took: readOptionalInteger(payload.took),
    errors: optionalBoolean(payload.errors) ?? failureCount > 0,
    successCount: normalizedItems.length - failureCount,
    failureCount,
    items: normalizedItems,
  };
}

async function countElasticsearchDocuments(input: Record<string, unknown>, context: ElasticsearchActionContext) {
  const indexName = requireElasticsearchField(input.indexName, "indexName");
  const { payload } = await elasticsearchRequest<Record<string, unknown>>({
    ...context,
    method: "POST",
    path: `/${encodeIndexPattern(indexName)}/_count`,
    body: {
      query: buildFilteredQuery(input),
    },
    phase: "execute",
  });

  const shards = optionalRecord(payload._shards) ?? {};
  return {
    indexName,
    count: Math.max(0, readInteger(payload.count)),
    successfulShards: readOptionalInteger(shards.successful),
    failedShards: readOptionalInteger(shards.failed),
  };
}

async function deleteElasticsearchDocumentsByQuery(
  input: Record<string, unknown>,
  context: ElasticsearchActionContext,
) {
  const indexName = requireElasticsearchField(input.indexName, "indexName");
  if (indexName === "_all" || indexName.includes("*") || indexName.includes("?") || indexName.includes(",")) {
    throw new ProviderRequestError(400, "indexName must be one exact index name and must not target _all");
  }
  const query = buildFilteredQuery(input);
  // Defense in depth: the schema requires a filter, and runtime also rejects an unbounded query.
  if (isMatchAllQuery(query)) {
    throw new ProviderRequestError(
      400,
      "delete_by_query requires at least one of query, termFilters, rangeFilters, or timeFilter.",
    );
  }

  const { payload } = await elasticsearchRequest<Record<string, unknown>>({
    ...context,
    method: "POST",
    path: `/${encodePathSegment(indexName)}/_delete_by_query`,
    query: {
      max_docs: readOptionalInteger(input.maxDocs) ?? undefined,
      conflicts: optionalString(input.conflicts) ?? "abort",
      refresh: optionalBoolean(input.refresh) ?? false,
      wait_for_completion: true,
    },
    body: { query },
    timeoutMs: elasticsearchLongRunningTimeoutMs,
    phase: "execute",
  });

  return {
    indexName,
    took: readOptionalInteger(payload.took),
    timedOut: optionalBoolean(payload.timed_out) ?? null,
    total: readOptionalInteger(payload.total),
    deleted: readOptionalInteger(payload.deleted),
    batches: readOptionalInteger(payload.batches),
    versionConflicts: readOptionalInteger(payload.version_conflicts),
    failures: readFailureMessages(payload.failures),
  };
}

async function startElasticsearchReindex(input: Record<string, unknown>, context: ElasticsearchActionContext) {
  const sourceIndex = requireElasticsearchField(input.sourceIndex, "sourceIndex");
  const destIndex = requireElasticsearchField(input.destIndex, "destIndex");
  const query = buildFilteredQuery(input);
  const opType = optionalString(input.opType)?.trim();
  const conflicts = optionalString(input.conflicts)?.trim();
  const maxDocs = readOptionalInteger(input.maxDocs);
  const requestsPerSecond = readOptionalInteger(input.requestsPerSecond);

  const { payload } = await elasticsearchRequest<Record<string, unknown>>({
    ...context,
    method: "POST",
    path: "/_reindex",
    query: {
      wait_for_completion: false,
      requests_per_second: requestsPerSecond ?? undefined,
    },
    body: {
      source: {
        index: sourceIndex,
        ...(isMatchAllQuery(query) ? {} : { query }),
      },
      dest: {
        index: destIndex,
        ...(opType ? { op_type: opType } : {}),
      },
      ...(conflicts ? { conflicts } : {}),
      ...(maxDocs === null ? {} : { max_docs: maxDocs }),
    },
    phase: "execute",
  });

  const taskId = optionalString(payload.task)?.trim();
  if (!taskId) {
    throw new ProviderRequestError(502, "elasticsearch reindex response did not include a task id");
  }

  return { taskId, sourceIndex, destIndex };
}

async function getElasticsearchTask(input: Record<string, unknown>, context: ElasticsearchActionContext) {
  const taskId = requireElasticsearchField(input.taskId, "taskId");
  // get_task is polled repeatedly. A node restart or expired task result yields 404, which is a terminal failure.
  const { payload, status } = await elasticsearchRequest<Record<string, unknown>>({
    ...context,
    method: "GET",
    path: `/_tasks/${encodePathSegment(taskId)}`,
    allowNotFound: true,
    phase: "execute",
  });
  if (status === 404) {
    return buildMissingElasticsearchTask(taskId, payload);
  }

  const task = optionalRecord(payload.task) ?? {};
  const response = optionalRecord(payload.response);
  const completed = optionalBoolean(payload.completed) ?? false;
  const failures = readFailureMessages(response?.failures ?? payload.failures);
  const error = payload.error == null ? null : formatElasticsearchFailure(payload.error);
  const progressSource = response ?? optionalRecord(task.status) ?? {};
  const runningTimeNanos = optionalNumber(task.running_time_in_nanos);

  return {
    taskId,
    state: resolveTaskState(completed, error, failures),
    completed,
    action: optionalString(task.action) ?? null,
    description: optionalString(task.description) ?? null,
    startTimeMs: readOptionalInteger(task.start_time_in_millis),
    runningTimeMs:
      runningTimeNanos === undefined || !Number.isFinite(runningTimeNanos)
        ? null
        : Math.trunc(runningTimeNanos / 1_000_000),
    progress: {
      total: readOptionalInteger(progressSource.total),
      created: readOptionalInteger(progressSource.created),
      updated: readOptionalInteger(progressSource.updated),
      deleted: readOptionalInteger(progressSource.deleted),
      batches: readOptionalInteger(progressSource.batches),
      versionConflicts: readOptionalInteger(progressSource.version_conflicts),
      noops: readOptionalInteger(progressSource.noops),
    },
    failures: error === null ? failures : [error, ...failures],
  };
}

function buildIndexDocumentTarget(indexName: string, documentId: string | undefined, opType: string) {
  const encodedIndex = encodePathSegment(indexName);
  if (!documentId) {
    return { path: `/${encodedIndex}/_doc`, method: "POST" as const };
  }
  if (opType === "create") {
    return {
      path: `/${encodedIndex}/_create/${encodePathSegment(documentId)}`,
      method: "PUT" as const,
    };
  }
  return { path: `/${encodedIndex}/_doc/${encodePathSegment(documentId)}`, method: "PUT" as const };
}

function buildBulkNdjson(operations: Record<string, unknown>[]) {
  const lines: string[] = [];
  for (const operation of operations) {
    const action = requireElasticsearchField(operation.action, "operations.action");
    const indexName = requireElasticsearchField(operation.indexName, "operations.indexName");
    const documentId = optionalString(operation.documentId)?.trim();
    const document = optionalRecord(operation.document);
    if (action === "delete" && !documentId)
      throw new ProviderRequestError(400, "documentId is required for delete operations");
    if (action !== "delete" && !document)
      throw new ProviderRequestError(400, "document is required for index, create, and update operations");
    lines.push(
      JSON.stringify({
        [action]: {
          _index: indexName,
          ...(documentId ? { _id: documentId } : {}),
        },
      }),
    );
    if (action === "delete") {
      continue;
    }
    lines.push(JSON.stringify(action === "update" ? { doc: document } : document));
  }

  // NDJSON must end with a newline or Elasticsearch ignores the final entry.
  return `${lines.join("\n")}\n`;
}

function normalizeBulkItem(item: Record<string, unknown>, operation: Record<string, unknown> | undefined) {
  const [responseAction, responseDetail] = Object.entries(item)[0] ?? [];
  const detail = optionalRecord(responseDetail) ?? {};
  const status = readOptionalInteger(detail.status);
  const result = optionalString(detail.result) ?? null;
  // Failed bulk entries include error. Fall back to status only when both error and result are absent,
  // otherwise deleting a missing document (404 with result=not_found) would be reported as a failure.
  const error =
    detail.error == null
      ? result === null && status !== null && status >= 400
        ? `elasticsearch bulk operation failed with ${status}`
        : null
      : formatElasticsearchFailure(detail.error);

  return {
    action: responseAction ?? optionalString(operation?.action) ?? "",
    index: optionalString(detail._index) ?? optionalString(operation?.indexName) ?? "",
    id: optionalString(detail._id) ?? optionalString(operation?.documentId) ?? "",
    status,
    result,
    error,
  };
}

function buildAliasAction(action: Record<string, unknown>) {
  const type = requireElasticsearchField(action.type, "actions.type");
  const index = requireElasticsearchField(action.index, "actions.index");
  const alias = requireElasticsearchField(action.alias, "actions.alias");
  if (type === "remove") {
    return { remove: { index, alias } };
  }

  const isWriteIndex = optionalBoolean(action.isWriteIndex);
  const filter = optionalRecord(action.filter);
  const indexRouting = optionalString(action.indexRouting)?.trim();
  const searchRouting = optionalString(action.searchRouting)?.trim();
  return {
    add: {
      index,
      alias,
      ...(isWriteIndex === undefined ? {} : { is_write_index: isWriteIndex }),
      ...(filter ? { filter } : {}),
      ...(indexRouting ? { index_routing: indexRouting } : {}),
      ...(searchRouting ? { search_routing: searchRouting } : {}),
    },
  };
}

function normalizeAliasEntry(alias: string, index: string, payload: Record<string, unknown>) {
  return {
    alias,
    index,
    isWriteIndex: optionalBoolean(payload.is_write_index) ?? null,
    filter: optionalRecord(payload.filter) ?? null,
    indexRouting: optionalString(payload.index_routing) ?? null,
    searchRouting: optionalString(payload.search_routing) ?? null,
  };
}

function normalizeIndexStatsEntry(index: string, payload: Record<string, unknown>) {
  const total = optionalRecord(payload.total) ?? {};
  const docs = optionalRecord(total.docs) ?? {};
  const store = optionalRecord(total.store) ?? {};
  const search = optionalRecord(total.search) ?? {};
  const get = optionalRecord(total.get) ?? {};
  const indexing = optionalRecord(total.indexing) ?? {};

  return {
    index,
    health: optionalString(payload.health) ?? null,
    status: optionalString(payload.status) ?? null,
    uuid: optionalString(payload.uuid) ?? null,
    docsCount: readOptionalInteger(docs.count),
    docsDeleted: readOptionalInteger(docs.deleted),
    storeSizeBytes: readOptionalInteger(store.size_in_bytes),
    searchQueryTotal: readOptionalInteger(search.query_total),
    searchQueryTimeMs: readOptionalInteger(search.query_time_in_millis),
    searchFetchTotal: readOptionalInteger(search.fetch_total),
    getTotal: readOptionalInteger(get.total),
    getTimeMs: readOptionalInteger(get.time_in_millis),
    indexingIndexTotal: readOptionalInteger(indexing.index_total),
    indexingDeleteTotal: readOptionalInteger(indexing.delete_total),
  };
}

function normalizeClusterHealthIndex(index: string, payload: Record<string, unknown>) {
  return {
    index,
    status: optionalString(payload.status) ?? "",
    numberOfShards: readInteger(payload.number_of_shards),
    numberOfReplicas: readInteger(payload.number_of_replicas),
    activePrimaryShards: readInteger(payload.active_primary_shards),
    activeShards: readInteger(payload.active_shards),
    relocatingShards: readInteger(payload.relocating_shards),
    initializingShards: readInteger(payload.initializing_shards),
    unassignedShards: readInteger(payload.unassigned_shards),
  };
}

function normalizeClusterNode(id: string, payload: Record<string, unknown>) {
  const jvm = optionalRecord(payload.jvm) ?? {};
  const jvmMemory = optionalRecord(jvm.mem) ?? {};
  const fileSystemTotal = optionalRecord((optionalRecord(payload.fs) ?? {}).total) ?? {};
  const cpu = optionalRecord((optionalRecord(payload.os) ?? {}).cpu) ?? {};

  return {
    id,
    name: optionalString(payload.name) ?? "",
    host: optionalString(payload.host) ?? null,
    roles: Array.isArray(payload.roles) ? payload.roles.map((role) => String(role)) : [],
    uptimeMs: readOptionalInteger(jvm.uptime_in_millis),
    heapUsedPercent: readOptionalInteger(jvmMemory.heap_used_percent),
    cpuPercent: readOptionalInteger(cpu.percent),
    diskTotalBytes: readOptionalInteger(fileSystemTotal.total_in_bytes),
    diskFreeBytes: readOptionalInteger(fileSystemTotal.free_in_bytes),
  };
}

function normalizeShardEntry(payload: Record<string, unknown>) {
  return {
    index: readCatValue(payload.index),
    shard: readCatValue(payload.shard),
    prirep: readCatValue(payload.prirep),
    state: readCatValue(payload.state),
    docs: readCatValue(payload.docs),
    store: readCatValue(payload.store),
    node: readCatValue(payload.node),
    unassignedReason: readCatValue(payload["unassigned.reason"]),
  };
}

function resolveTaskState(completed: boolean, error: string | null, failures: string[]) {
  if (!completed) {
    return "running" as const;
  }
  if (error !== null || failures.length > 0) {
    return "failed" as const;
  }
  return "completed" as const;
}

function readFailureMessages(value: unknown) {
  return Array.isArray(value) ? value.map((failure) => formatElasticsearchFailure(failure)) : [];
}

function formatElasticsearchFailure(value: unknown) {
  const text = optionalString(value)?.trim();
  if (text) {
    return text;
  }

  const failure = optionalRecord(value);
  if (!failure) {
    return "unknown elasticsearch failure";
  }

  // Remove the outer wrapper, then follow caused_by to the root cause.
  const visited = new Set<Record<string, unknown>>();
  const segments: string[] = [];
  let current: Record<string, unknown> | undefined = unwrapElasticsearchFailure(failure);
  for (let depth = 0; depth < elasticsearchFailureChainDepth; depth += 1) {
    if (!current || visited.has(current)) {
      break;
    }
    visited.add(current);
    const segment = describeElasticsearchFailureNode(current);
    if (segment) {
      segments.push(segment);
    }
    const next = optionalRecord(current.caused_by);
    current = next === undefined ? undefined : unwrapElasticsearchFailure(next);
  }

  return segments.length > 0 ? segments.join("; caused by: ") : JSON.stringify(failure);
}

/**
 * Find the exception object that actually carries reason and type.
 *
 * The failures array has three observed shapes; following only caused_by misses the latter two:
 * 1. The exception itself has a string reason, such as `{type, reason, caused_by}`.
 * 2. Bulk failures wrap it in cause, such as `{index, id, cause: {type, reason}, status}`.
 * 3. Search failures wrap it in an object reason, such as `{shard, index, reason: {type, reason}}`.
 */
function unwrapElasticsearchFailure(failure: Record<string, unknown>) {
  if (optionalString(failure.reason)?.trim()) {
    return failure;
  }
  return optionalRecord(failure.cause) ?? optionalRecord(failure.reason) ?? failure;
}

function describeElasticsearchFailureNode(failure: Record<string, unknown>) {
  const reason = optionalString(failure.reason)?.trim();
  const type = optionalString(failure.type)?.trim();
  if (reason && type) {
    return `${reason} (${type})`;
  }
  return reason || type || "";
}
function buildMissingElasticsearchTask(taskId: string, payload: unknown) {
  const error = optionalRecord(payload)?.error;
  const detail =
    error == null
      ? "it may have finished and been cleaned up, or the node running it may have restarted"
      : formatElasticsearchFailure(error);

  return {
    taskId,
    state: "failed" as const,
    completed: true,
    action: null,
    description: null,
    startTimeMs: null,
    runningTimeMs: null,
    progress: {
      total: null,
      created: null,
      updated: null,
      deleted: null,
      batches: null,
      versionConflicts: null,
      noops: null,
    },
    failures: [`elasticsearch task ${taskId} is no longer available: ${detail}`],
  };
}

function buildSearchBody(input: Record<string, unknown>, from: number, size: number) {
  const body: Record<string, unknown> = {
    from,
    size,
    query: buildFilteredQuery(input),
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
  const aggregations = buildAggregations(input.aggregations);
  if (aggregations) {
    body.aggs = aggregations;
  }

  return body;
}

// query_index, count_documents, delete_by_query, and reindex share the same filter builder.
function buildFilteredQuery(input: Record<string, unknown>) {
  const query = optionalString(input.query)?.trim();
  const filters = [
    ...normalizeTermFilters(input.termFilters),
    ...normalizeRangeFilters(input.rangeFilters),
    ...normalizeTimeFilter(input.timeFilter),
  ];
  return buildSearchQuery(query, filters);
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

function isMatchAllQuery(query: Record<string, unknown>) {
  return Object.hasOwn(query, "match_all");
}
function buildAggregations(value: unknown) {
  const requests = readObjectArray(value);
  if (requests.length === 0) {
    return undefined;
  }

  return Object.fromEntries(
    requests.map(
      (request) => [requireElasticsearchField(request.name, "aggregations.name"), buildAggregation(request)] as const,
    ),
  );
}

function buildAggregation(request: Record<string, unknown>) {
  const type = requireElasticsearchField(request.type, "aggregations.type");
  const field = requireElasticsearchField(request.field, "aggregations.field");
  if (type === "terms") {
    return {
      terms: {
        field,
        size: readNumber(request.size, 10),
        order: { _count: optionalString(request.order) ?? "desc" },
      },
    };
  }
  if (type === "date_histogram") {
    const interval = optionalString(request.interval)?.trim();
    if (!interval) {
      throw new ProviderRequestError(400, "aggregations.interval is required when type is date_histogram");
    }
    const intervalKey = optionalString(request.intervalType) === "fixed" ? "fixed_interval" : "calendar_interval";
    return {
      date_histogram: {
        field,
        [intervalKey]: interval,
      },
    };
  }

  return { [type]: { field } };
}

// Commas delimit index patterns, so encode each segment before joining them.
function encodeIndexPattern(value: string) {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map((part) => encodePathSegment(part))
    .join(",");
}

function readObjectArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => optionalRecord(item)).filter((item): item is Record<string, unknown> => item != null);
}

function readNumber(value: unknown, fallback: number) {
  const numberValue = optionalNumber(value);
  return numberValue === undefined ? fallback : numberValue;
}

function readInteger(value: unknown) {
  return readOptionalInteger(value) ?? 0;
}

function readOptionalInteger(value: unknown) {
  const numberValue = optionalNumber(value);
  if (numberValue === undefined || !Number.isFinite(numberValue)) {
    return null;
  }
  return Math.trunc(numberValue);
}

// The _cat API returns a literal "-" for missing values; normalize it to null.
function readCatValue(value: unknown) {
  if (value == null) {
    return null;
  }
  const text = typeof value === "string" ? value.trim() : String(value);
  if (text === "" || text === "-") {
    return null;
  }
  return text;
}

function compareText(left: string, right: string) {
  if (left === right) {
    return 0;
  }
  return left < right ? -1 : 1;
}
