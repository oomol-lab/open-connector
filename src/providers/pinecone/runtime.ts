import type { CredentialValidationResult, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalInteger, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { compactJson } from "../../core/request.ts";
import { defineApiKeyProviderExecutors, ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

export const pineconeControlApiBaseUrl = "https://api.pinecone.io";
export const pineconeApiVersion = "2026-04";

type PineconeActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;
type PineconeHttpMethod = "GET" | "POST" | "PATCH" | "DELETE";

export const pineconeActionHandlers: ProviderActionHandlers<"pinecone", PineconeActionHandler> = {
  async list_indexes(_input, context) {
    const payload = await requestControlJson(context, "/indexes", "GET");
    const record = requireObjectPayload(payload, "Pinecone indexes response");
    return {
      indexes: Array.isArray(record.indexes) ? record.indexes : [],
    };
  },

  async describe_index(input, context) {
    const name = requiredString(input.name, "name", invalidInputError);
    const payload = await requestControlJson(context, `/indexes/${encodeURIComponent(name)}`, "GET", undefined, true);
    return {
      index: requireObjectPayload(payload, "Pinecone index response"),
    };
  },

  async create_index(input, context) {
    const body = compactObject({
      name: requiredString(input.name, "name", invalidInputError),
      dimension: optionalInteger(input.dimension),
      metric: optionalString(input.metric),
      vector_type: optionalString(input.vectorType),
      deletion_protection: optionalString(input.deletionProtection),
      tags: optionalRecord(input.tags),
      spec: {
        serverless: {
          cloud: requiredString(input.cloud, "cloud", invalidInputError),
          region: requiredString(input.region, "region", invalidInputError),
        },
      },
    });
    const payload = await requestControlJson(context, "/indexes", "POST", body);
    return {
      index: requireObjectPayload(payload, "Pinecone create index response"),
    };
  },

  async configure_index(input, context) {
    const name = requiredString(input.name, "name", invalidInputError);
    const body = compactObject({
      deletion_protection: optionalString(input.deletionProtection),
      tags: optionalRecord(input.tags),
      spec: input.readCapacity
        ? {
            serverless: {
              read_capacity: optionalRecord(input.readCapacity),
            },
          }
        : undefined,
    });
    const payload = await requestControlJson(context, `/indexes/${encodeURIComponent(name)}`, "PATCH", body, true);
    return {
      index: requireObjectPayload(payload, "Pinecone configure index response"),
    };
  },

  async delete_index(input, context) {
    const name = requiredString(input.name, "name", invalidInputError);
    await requestControlJson(context, `/indexes/${encodeURIComponent(name)}`, "DELETE", undefined, true);
    return { accepted: true };
  },

  async get_index_stats(input, context) {
    const payload = await requestDataJson(input, context, "/describe_index_stats", "POST", {
      filter: optionalRecord(input.filter),
    });
    return {
      stats: requireObjectPayload(payload, "Pinecone index stats response"),
    };
  },

  async upsert_vectors(input, context) {
    const payload = await requestDataJson(input, context, "/vectors/upsert", "POST", {
      vectors: input.vectors,
      namespace: optionalString(input.namespace),
    });
    const record = requireObjectPayload(payload, "Pinecone upsert response");
    return {
      upsertedCount: typeof record.upsertedCount === "number" ? record.upsertedCount : 0,
      raw: record,
    };
  },

  async query_vectors(input, context) {
    if (!input.values && !input.sparseValues && !input.id) {
      throw new ProviderRequestError(400, "query_vectors requires values, sparseValues, or id");
    }

    const payload = await requestDataJson(input, context, "/query", "POST", {
      vector: input.values,
      sparseVector: input.sparseValues,
      id: optionalString(input.id),
      topK: input.topK,
      namespace: optionalString(input.namespace),
      filter: optionalRecord(input.filter),
      includeValues: input.includeValues,
      includeMetadata: input.includeMetadata,
    });
    const record = requireObjectPayload(payload, "Pinecone query response");
    return {
      matches: Array.isArray(record.matches) ? record.matches : [],
      namespace: optionalString(record.namespace) ?? null,
      usage: optionalRecord(record.usage) ?? null,
      raw: record,
    };
  },

  async fetch_vectors(input, context) {
    const ids = Array.isArray(input.ids) ? input.ids.map((id) => String(id)) : [];
    const payload = await requestDataJson(input, context, "/vectors/fetch", "GET", undefined, {
      namespace: optionalString(input.namespace),
      ids,
    });
    const record = requireObjectPayload(payload, "Pinecone fetch response");
    return {
      vectors: optionalRecord(record.vectors) ?? {},
      namespace: optionalString(record.namespace) ?? null,
      usage: optionalRecord(record.usage) ?? null,
      raw: record,
    };
  },

  async list_vector_ids(input, context) {
    const payload = await requestDataJson(input, context, "/vectors/list", "GET", undefined, {
      namespace: optionalString(input.namespace),
      prefix: optionalString(input.prefix),
      limit: input.limit === undefined ? undefined : String(input.limit),
      paginationToken: optionalString(input.paginationToken),
    });
    const record = requireObjectPayload(payload, "Pinecone list vectors response");
    return {
      vectors: Array.isArray(record.vectors) ? record.vectors : [],
      pagination: optionalRecord(record.pagination) ?? null,
      raw: record,
    };
  },

  async delete_vectors(input, context) {
    if (!input.ids && !input.filter && input.deleteAll !== true) {
      throw new ProviderRequestError(400, "delete_vectors requires ids, filter, or deleteAll");
    }

    const payload = await requestDataJson(input, context, "/vectors/delete", "POST", {
      ids: input.ids,
      namespace: optionalString(input.namespace),
      filter: optionalRecord(input.filter),
      deleteAll: input.deleteAll,
    });
    return {
      raw: requireObjectPayload(payload, "Pinecone delete vectors response"),
    };
  },

  async update_vector(input, context) {
    if (!input.id && !input.filter) {
      throw new ProviderRequestError(400, "update_vector requires id or filter");
    }

    const payload = await requestDataJson(input, context, "/vectors/update", "POST", {
      id: optionalString(input.id),
      values: input.values,
      sparseValues: input.sparseValues,
      setMetadata: optionalRecord(input.setMetadata),
      namespace: optionalString(input.namespace),
      filter: optionalRecord(input.filter),
      dryRun: input.dryRun,
    });
    const record = requireObjectPayload(payload, "Pinecone update vector response");
    return {
      matchedRecords: typeof record.matchedRecords === "number" ? record.matchedRecords : null,
      raw: record,
    };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors("pinecone", pineconeActionHandlers);

export async function validatePineconeCredential(
  input: Record<string, string>,
  fetcher: typeof fetch,
): Promise<CredentialValidationResult> {
  const apiKey = requiredString(input.apiKey, "apiKey", (message) => new ProviderRequestError(401, message));
  const payload = await requestPineconeJson({
    apiKey,
    baseUrl: pineconeControlApiBaseUrl,
    path: "/indexes",
    method: "GET",
    fetcher,
    phase: "validate",
  });
  const record = requireObjectPayload(payload, "Pinecone indexes response");
  const indexes = Array.isArray(record.indexes) ? record.indexes : [];
  const firstIndex = optionalRecord(indexes[0]);
  const firstName = optionalString(firstIndex?.name);

  return {
    profile: {
      accountId: firstName ?? "pinecone-api-key",
      displayName: firstName ? `Pinecone project (${firstName})` : "Pinecone API key",
      grantedScopes: [],
    },
    metadata: compactObject({
      apiBaseUrl: pineconeControlApiBaseUrl,
      apiVersion: pineconeApiVersion,
      validationEndpoint: "/indexes",
      indexCount: indexes.length,
      firstIndexName: firstName,
      firstIndexHost: optionalString(firstIndex?.host),
    }),
  };
}

function requestControlJson(
  context: ApiKeyProviderContext,
  path: string,
  method: PineconeHttpMethod,
  body?: Record<string, unknown>,
  notFoundAsInvalidInput = false,
) {
  return requestPineconeJson({
    apiKey: context.apiKey,
    baseUrl: pineconeControlApiBaseUrl,
    path,
    method,
    body,
    fetcher: context.fetcher,
    phase: "execute",
    notFoundAsInvalidInput,
    signal: context.signal,
  });
}

function requestDataJson(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
  path: string,
  method: PineconeHttpMethod,
  body?: Record<string, unknown>,
  query?: Record<string, string | string[] | undefined>,
) {
  return requestPineconeJson({
    apiKey: context.apiKey,
    baseUrl: requireIndexHost(input.indexHost),
    path,
    method,
    body,
    query,
    fetcher: context.fetcher,
    phase: "execute",
    signal: context.signal,
  });
}

async function requestPineconeJson(input: {
  apiKey: string;
  baseUrl: string;
  path: string;
  method: PineconeHttpMethod;
  body?: Record<string, unknown>;
  query?: Record<string, string | string[] | undefined>;
  fetcher: typeof fetch;
  phase: "validate" | "execute";
  notFoundAsInvalidInput?: boolean;
  signal?: AbortSignal;
}) {
  let response: Response;
  try {
    response = await input.fetcher(buildPineconeUrl(input.baseUrl, input.path, input.query), {
      method: input.method,
      headers: buildPineconeHeaders(input.apiKey, input.body !== undefined),
      body: input.body === undefined ? undefined : JSON.stringify(compactJson(input.body)),
      signal: input.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Pinecone request failed: ${error.message}` : "Pinecone request failed",
    );
  }

  const payload = await readPineconePayload(response);
  if (!response.ok) {
    throw createPineconeError(response.status, payload, input.phase, input.notFoundAsInvalidInput);
  }
  return payload;
}

function buildPineconeUrl(baseUrl: string, path: string, query?: Record<string, string | string[] | undefined>) {
  const url = new URL(path, `${baseUrl.replace(/\/+$/, "")}/`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        url.searchParams.append(key, item);
      }
    } else {
      url.searchParams.set(key, value);
    }
  }
  return url;
}

function buildPineconeHeaders(apiKey: string, hasBody: boolean) {
  const headers = new Headers({
    accept: "application/json",
    "api-key": apiKey,
    "user-agent": providerUserAgent,
    "x-pinecone-api-version": pineconeApiVersion,
  });
  if (hasBody) {
    headers.set("content-type", "application/json");
  }
  return headers;
}

async function readPineconePayload(response: Response) {
  const text = await response.text();
  if (!text.trim()) {
    return {};
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Pinecone returned invalid JSON");
  }
}

function createPineconeError(
  status: number,
  payload: unknown,
  phase: "validate" | "execute",
  notFoundAsInvalidInput?: boolean,
) {
  const message = extractPineconeErrorMessage(payload) ?? `Pinecone request failed with status ${status}`;
  if (status === 429) return new ProviderRequestError(429, message, payload);
  if (phase === "validate" && status >= 400 && status < 500) return new ProviderRequestError(400, message, payload);
  if (status === 401 || status === 403) return new ProviderRequestError(status, message, payload);
  if (notFoundAsInvalidInput && status === 404) return new ProviderRequestError(404, message, payload);
  if (status >= 400 && status < 500) return new ProviderRequestError(400, message, payload);
  return new ProviderRequestError(502, message, payload);
}

function extractPineconeErrorMessage(payload: unknown) {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }
  const error = optionalRecord(record.error);
  return optionalString(record.message) ?? optionalString(error?.message);
}

function requireObjectPayload(payload: unknown, label: string) {
  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, `${label} must be a JSON object`);
  }
  return record;
}

function requireIndexHost(value: unknown) {
  const host = requiredString(value, "indexHost", invalidInputError);
  let parsed: URL;
  try {
    parsed = new URL(host);
  } catch {
    throw new ProviderRequestError(400, "indexHost must be a valid absolute URL");
  }
  if (parsed.protocol !== "https:") {
    throw new ProviderRequestError(400, "indexHost must use https");
  }
  if (parsed.username || parsed.password) {
    throw new ProviderRequestError(400, "indexHost must not include credentials");
  }
  parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString().replace(/\/+$/, "");
}

function invalidInputError(message: string) {
  return new ProviderRequestError(400, message);
}
