import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, objectArray, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

export const cockroachLabsApiBaseUrl = "https://cockroachlabs.cloud";
const cockroachLabsApiVersion = "2024-09-16";
const cockroachLabsDefaultRequestTimeoutMs = 30_000;

interface CockroachLabsCredentialInput {
  apiKey: string;
}

type CockroachLabsRequestPhase = "validate" | "execute";
type CockroachLabsRuntimeContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
type CockroachLabsActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const cockroachLabsActionHandlers: ProviderActionHandlers<"cockroach_labs", CockroachLabsActionHandler> = {
  async get_organization(_input, context) {
    return {
      organization: await requestCockroachLabsObject({
        context,
        path: "/api/v1/organization",
        phase: "execute",
        responseContext: "CockroachDB Cloud organization response",
      }),
    };
  },

  async list_clusters(input, context) {
    const payload = await requestCockroachLabsObject({
      context,
      path: "/api/v1/clusters",
      query: buildQueryParams({
        show_inactive: input.showInactive,
        "pagination.page": input.page,
        "pagination.limit": input.limit,
        "pagination.as_of_time": input.asOfTime,
        "pagination.sort_order": input.sortOrder,
        "pagination.sort_by": input.sortBy,
      }),
      phase: "execute",
      responseContext: "CockroachDB Cloud cluster list response",
    });

    return {
      clusters: objectArray(payload.clusters, "clusters", providerResponseError),
      pagination: normalizePagination(payload.pagination),
    };
  },

  async get_cluster(input, context) {
    const clusterId = requiredString(input.clusterId, "clusterId", invalidInputError);
    return {
      cluster: await requestCockroachLabsObject({
        context,
        path: `/api/v1/clusters/${encodeURIComponent(clusterId)}`,
        phase: "execute",
        responseContext: "CockroachDB Cloud cluster response",
      }),
    };
  },

  async list_available_regions(input, context) {
    const payload = await requestCockroachLabsObject({
      context,
      path: "/api/v1/clusters/available-regions",
      query: buildQueryParams({
        provider: input.provider,
        serverless: input.serverless,
        "pagination.page": input.page,
        "pagination.limit": input.limit,
        "pagination.as_of_time": input.asOfTime,
        "pagination.sort_order": input.sortOrder,
      }),
      phase: "execute",
      responseContext: "CockroachDB Cloud available region list response",
    });

    return {
      regions: objectArray(payload.regions, "regions", providerResponseError),
      pagination: normalizePagination(payload.pagination),
    };
  },

  async list_cluster_nodes(input, context) {
    const clusterId = requiredString(input.clusterId, "clusterId", invalidInputError);
    const payload = await requestCockroachLabsObject({
      context,
      path: `/api/v1/clusters/${encodeURIComponent(clusterId)}/nodes`,
      query: buildQueryParams({
        region_name: input.regionName,
        "pagination.page": input.page,
        "pagination.limit": input.limit,
        "pagination.as_of_time": input.asOfTime,
        "pagination.sort_order": input.sortOrder,
      }),
      phase: "execute",
      responseContext: "CockroachDB Cloud cluster node list response",
    });

    return {
      nodes: objectArray(payload.nodes, "nodes", providerResponseError),
      pagination: normalizePagination(payload.pagination),
    };
  },

  async list_databases(input, context) {
    const clusterId = requiredString(input.clusterId, "clusterId", invalidInputError);
    const payload = await requestCockroachLabsObject({
      context,
      path: `/api/v1/clusters/${encodeURIComponent(clusterId)}/databases`,
      query: buildPaginationQuery(input),
      phase: "execute",
      responseContext: "CockroachDB Cloud database list response",
    });

    return {
      databases: objectArray(payload.databases, "databases", providerResponseError),
      pagination: normalizePagination(payload.pagination),
    };
  },

  async list_sql_users(input, context) {
    const clusterId = requiredString(input.clusterId, "clusterId", invalidInputError);
    const payload = await requestCockroachLabsObject({
      context,
      path: `/api/v1/clusters/${encodeURIComponent(clusterId)}/sql-users`,
      query: buildPaginationQuery(input),
      phase: "execute",
      responseContext: "CockroachDB Cloud SQL user list response",
    });

    return {
      users: objectArray(payload.users, "users", providerResponseError),
      pagination: normalizePagination(payload.pagination),
    };
  },
};

export async function validateCockroachLabsApiKey(
  input: CockroachLabsCredentialInput,
  options: { fetcher: typeof fetch; signal?: AbortSignal },
): Promise<CredentialValidationResult> {
  const context: CockroachLabsRuntimeContext = {
    apiKey: input.apiKey,
    fetcher: options.fetcher,
    signal: options.signal,
  };
  const organization = await requestCockroachLabsObject({
    context,
    path: "/api/v1/organization",
    phase: "validate",
    responseContext: "CockroachDB Cloud organization response",
  });

  const organizationId = requiredString(organization.id, "id", providerResponseError);
  const accountLabel =
    optionalString(organization.name) ?? optionalString(organization.label) ?? "CockroachDB Cloud Organization";

  return {
    profile: {
      accountId: organizationId,
      displayName: accountLabel,
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: cockroachLabsApiBaseUrl,
      validationEndpoint: "/api/v1/organization",
      organizationId,
      organizationLabel: optionalString(organization.label),
      organizationName: optionalString(organization.name),
    }),
  };
}

async function requestCockroachLabsObject(input: {
  context: CockroachLabsRuntimeContext;
  path: string;
  phase: CockroachLabsRequestPhase;
  responseContext: string;
  query?: URLSearchParams;
}): Promise<Record<string, unknown>> {
  const payload = await requestCockroachLabsJson(input);
  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, `${input.responseContext} is not a JSON object`, payload);
  }

  return record;
}

async function requestCockroachLabsJson(input: {
  context: CockroachLabsRuntimeContext;
  path: string;
  phase: CockroachLabsRequestPhase;
  query?: URLSearchParams;
}): Promise<unknown> {
  const timeout = createProviderTimeout(input.context.signal, cockroachLabsDefaultRequestTimeoutMs);
  try {
    const response = await input.context.fetcher(buildCockroachLabsUrl(input.path, input.query), {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${input.context.apiKey}`,
        "cc-version": cockroachLabsApiVersion,
        "user-agent": providerUserAgent,
      },
      signal: timeout.signal,
    });
    const payload = await readCockroachLabsPayload(response);
    if (!response.ok) {
      throw createCockroachLabsError(response.status, payload, input.phase);
    }

    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "CockroachDB Cloud request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error
        ? `CockroachDB Cloud request failed: ${error.message}`
        : "CockroachDB Cloud request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

function buildCockroachLabsUrl(path: string, query?: URLSearchParams): URL {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(normalizedPath, `${cockroachLabsApiBaseUrl}/`);
  if (query) {
    for (const [key, value] of query.entries()) {
      url.searchParams.set(key, value);
    }
  }

  return url;
}

async function readCockroachLabsPayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (response.ok) {
      throw new ProviderRequestError(502, "CockroachDB Cloud returned invalid JSON");
    }
    return text;
  }
}

function createCockroachLabsError(
  status: number,
  payload: unknown,
  phase: CockroachLabsRequestPhase,
): ProviderRequestError {
  const message =
    extractCockroachLabsErrorMessage(payload) ?? `CockroachDB Cloud request failed with status ${status || 500}`;

  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (phase === "validate" && (status === 401 || status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (phase === "execute" && (status === 401 || status === 403)) {
    return new ProviderRequestError(401, message, payload);
  }
  if ([400, 404, 422].includes(status)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (status >= 500) {
    return new ProviderRequestError(502, message, payload);
  }

  return new ProviderRequestError(status || 502, message, payload);
}

function extractCockroachLabsErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }

  const record = optionalRecord(payload);
  return optionalString(record?.message) ?? optionalString(record?.error);
}

function buildPaginationQuery(input: Record<string, unknown>): URLSearchParams {
  return buildQueryParams({
    "pagination.page": input.page,
    "pagination.limit": input.limit,
    "pagination.as_of_time": input.asOfTime,
    "pagination.sort_order": input.sortOrder,
  });
}

function buildQueryParams(input: Record<string, unknown>): URLSearchParams {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined && value !== null && value !== "") {
      query.set(key, String(value));
    }
  }
  return query;
}

function normalizePagination(value: unknown): Record<string, unknown> | null {
  const pagination = optionalRecord(value);
  if (!pagination) {
    return null;
  }

  return compactObject({
    nextPage: optionalString(pagination.next_page),
    previousPage: optionalString(pagination.previous_page),
  });
}

function invalidInputError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}

function providerResponseError(message: string): ProviderRequestError {
  return new ProviderRequestError(502, `CockroachDB Cloud ${message}`);
}
