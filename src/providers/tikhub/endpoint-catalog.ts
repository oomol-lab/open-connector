import type { TikHubDiscoverInput, TikHubDiscoverResult, TikHubDiscoveredEndpoint } from "./endpoint-types.ts";

import { createHash } from "node:crypto";
import { createProviderTimeout, isAbortLikeError, ProviderRequestError } from "../provider-runtime.ts";
import { cancelResponseBody, readBoundedResponseText } from "./bounded-response.ts";
import { parseTikHubOpenApiCatalog } from "./endpoint-document.ts";
import { isEligibleTikHubEndpointCategory } from "./endpoint-policy.ts";

const tikhubOpenApiUrl = "https://api.tikhub.io/openapi.json";

const openApiTimeoutMs = 15_000;
const openApiMaxBytes = 8 * 1024 * 1024;
const catalogTtlMs = 60_000;
const catalogStaleTtlMs = 60 * 60_000;
const catalogFailureTtlMs = 30_000;
const discoveryPageMaxBytes = 4 * 1024 * 1024;
const cursorMaxLength = 1_024;

interface CatalogSnapshot {
  catalogVersion: string;
  endpoints: TikHubDiscoveredEndpoint[];
  freshUntil: number;
  staleUntil: number;
}

interface CatalogCache {
  snapshot?: CatalogSnapshot;
  inFlight?: Promise<{ snapshot: CatalogSnapshot; stale: boolean }>;
  retryAfter?: number;
}

interface TikHubEndpointCatalog {
  discoverEndpoints(input: TikHubDiscoverInput, fetcher: typeof fetch): Promise<TikHubDiscoverResult>;
}

class TransientOpenApiError extends ProviderRequestError {}

const defaultCatalog = createTikHubEndpointCatalog();

function createTikHubEndpointCatalog(): TikHubEndpointCatalog {
  const cache: CatalogCache = {};
  return {
    discoverEndpoints(input: TikHubDiscoverInput, fetcher: typeof fetch) {
      return discoverWithCache(input, fetcher, cache);
    },
  };
}

export function discoverTikHubEndpoints(
  input: TikHubDiscoverInput,
  fetcher: typeof fetch,
): Promise<TikHubDiscoverResult> {
  return defaultCatalog.discoverEndpoints(input, fetcher);
}

async function discoverWithCache(
  input: TikHubDiscoverInput,
  fetcher: typeof fetch,
  cache: CatalogCache,
): Promise<TikHubDiscoverResult> {
  assertCursorInput(input.cursor);
  const limit = input.limit ?? 10;
  if (!Number.isInteger(limit) || limit < 1 || limit > 20) {
    throw new ProviderRequestError(400, "limit must be an integer between 1 and 20");
  }
  if (input.category !== undefined && !isEligibleTikHubEndpointCategory(input.category)) {
    throw new ProviderRequestError(
      403,
      `TikHub account category is unavailable through dynamic discovery: ${input.category}`,
    );
  }

  const catalog = await loadCatalog(fetcher, cache);
  const filterHash = discoveryFilterHash(input);
  const offset = decodeCursor(input.cursor, catalog.snapshot.catalogVersion, filterHash);
  const eligible = catalog.snapshot.endpoints.filter(
    (endpoint) =>
      (input.category === undefined || endpoint.category === input.category) &&
      matchesEndpointQuery(endpoint, input.query),
  );
  if (offset > eligible.length) {
    throw new ProviderRequestError(400, "cursor offset is outside the current catalog");
  }
  const endpoints = eligible.slice(offset, offset + limit);
  if (new TextEncoder().encode(JSON.stringify(endpoints)).byteLength > discoveryPageMaxBytes) {
    throw new ProviderRequestError(502, `TikHub discovery page exceeds the ${discoveryPageMaxBytes} byte limit`);
  }
  const nextOffset = offset + Math.min(limit, eligible.length - offset);
  return {
    catalogVersion: catalog.snapshot.catalogVersion,
    endpoints,
    nextCursor:
      nextOffset < eligible.length ? encodeCursor(catalog.snapshot.catalogVersion, filterHash, nextOffset) : null,
    stale: catalog.stale,
  };
}

async function loadCatalog(fetcher: typeof fetch, cache: CatalogCache) {
  const now = Date.now();
  if (cache.snapshot && now < cache.snapshot.freshUntil) {
    return { snapshot: cache.snapshot, stale: false };
  }
  if (cache.snapshot && cache.retryAfter && now < cache.retryAfter && now < cache.snapshot.staleUntil) {
    return { snapshot: cache.snapshot, stale: true };
  }
  if (cache.inFlight) {
    return cache.inFlight;
  }
  cache.inFlight = refreshCatalog(fetcher, cache);
  try {
    return await cache.inFlight;
  } finally {
    cache.inFlight = undefined;
  }
}

async function refreshCatalog(fetcher: typeof fetch, cache: CatalogCache) {
  try {
    const content = await fetchOpenApi(fetcher);
    const endpoints = parseTikHubOpenApiCatalog(content);
    if (endpoints.length === 0) {
      throw new ProviderRequestError(502, "TikHub OpenAPI catalog contains no eligible API operations");
    }
    const fetchedAt = Date.now();
    const snapshot: CatalogSnapshot = {
      catalogVersion: sha256Hex(content),
      endpoints,
      freshUntil: fetchedAt + catalogTtlMs,
      staleUntil: fetchedAt + catalogStaleTtlMs,
    };
    cache.snapshot = snapshot;
    cache.retryAfter = undefined;
    return { snapshot, stale: false };
  } catch (error) {
    if (error instanceof TransientOpenApiError && cache.snapshot && Date.now() < cache.snapshot.staleUntil) {
      cache.retryAfter = Date.now() + catalogFailureTtlMs;
      return { snapshot: cache.snapshot, stale: true };
    }
    throw error;
  }
}

async function fetchOpenApi(fetcher: typeof fetch) {
  const timeout = createProviderTimeout(undefined, openApiTimeoutMs);
  try {
    const response = await fetcher(tikhubOpenApiUrl, {
      method: "GET",
      headers: { accept: "application/json" },
      redirect: "manual",
      signal: timeout.signal,
    });
    if (!response.ok) {
      await cancelResponseBody(response);
      const message = `TikHub OpenAPI request failed with status ${response.status}`;
      const details = { upstreamStatus: response.status, url: tikhubOpenApiUrl };
      throw response.status === 429 || response.status >= 500
        ? new TransientOpenApiError(502, message, details)
        : new ProviderRequestError(502, message, details);
    }
    return await readBoundedResponseText(response, {
      maxBytes: openApiMaxBytes,
      label: "TikHub OpenAPI catalog",
    });
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new TransientOpenApiError(504, "TikHub OpenAPI request timed out");
    }
    throw new TransientOpenApiError(
      502,
      error instanceof Error ? `TikHub OpenAPI request failed: ${error.message}` : "TikHub OpenAPI request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

function matchesEndpointQuery(endpoint: TikHubDiscoveredEndpoint, query: string | undefined) {
  if (query === undefined || query.trim() === "") return true;
  const searchable = [endpoint.category, endpoint.title, endpoint.operationId, endpoint.path].join(" ").toLowerCase();
  return discoveryQueryTokens(query).every((token) => searchable.includes(token));
}

function discoveryFilterHash(input: TikHubDiscoverInput) {
  return sha256Hex(
    stableJsonStringify({
      category: input.category ?? null,
      query: discoveryQueryTokens(input.query).join(" "),
    }),
  );
}

function discoveryQueryTokens(query: string | undefined) {
  return query?.trim().toLowerCase().split(" ").filter(Boolean) ?? [];
}

function encodeCursor(catalogVersion: string, filterHash: string, offset: number) {
  return Buffer.from(JSON.stringify({ version: catalogVersion, filterHash, offset }), "utf8").toString("base64url");
}

function assertCursorInput(cursor: string | null | undefined) {
  if (cursor === undefined || cursor === null) return;
  if (cursor.length === 0 || cursor.length > cursorMaxLength) {
    throw new ProviderRequestError(400, "cursor length is invalid");
  }
  for (const character of cursor) {
    const code = character.charCodeAt(0);
    const canonical =
      (48 <= code && code <= 57) ||
      (65 <= code && code <= 90) ||
      (97 <= code && code <= 122) ||
      character === "-" ||
      character === "_";
    if (!canonical) {
      throw new ProviderRequestError(400, "cursor encoding is invalid");
    }
  }
}

function decodeCursor(cursor: string | null | undefined, catalogVersion: string, filterHash: string) {
  if (cursor === undefined || cursor === null) return 0;
  try {
    const decoded = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as unknown;
    if (
      !isRecord(decoded) ||
      decoded.version !== catalogVersion ||
      decoded.filterHash !== filterHash ||
      !Number.isInteger(decoded.offset) ||
      (decoded.offset as number) < 0
    ) {
      throw new Error("invalid cursor");
    }
    return decoded.offset as number;
  } catch {
    throw new ProviderRequestError(400, "cursor does not belong to the current TikHub catalog version and filters");
  }
}

function stableJsonStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJsonStringify).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJsonStringify(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256Hex(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
