import type {
  TikHubDiscoverInput,
  TikHubDiscoverResult,
  TikHubDiscoveredEndpoint,
  TikHubLlmsIndexEntry,
} from "./endpoint-types.ts";

import { createHash } from "node:crypto";
import { createProviderTimeout, isAbortLikeError } from "../provider-runtime.ts";
import { cancelResponseBody, readBoundedResponseText } from "./bounded-response.ts";
import { parseTikHubEndpointDocument } from "./endpoint-document.ts";
import { parseTikHubLlmsIndex, tikhubDocsIndexUrl } from "./endpoint-index.ts";
import { isEligibleTikHubEndpointCategory } from "./endpoint-policy.ts";
import { TikHubRequestError } from "./errors.ts";

export { parseTikHubEndpointDocument } from "./endpoint-document.ts";
export { parseTikHubLlmsIndex } from "./endpoint-index.ts";
export type {
  TikHubDiscoverInput,
  TikHubDiscoverResult,
  TikHubDiscoveredEndpoint,
  TikHubLlmsIndexEntry,
} from "./endpoint-types.ts";

const tikhubDocsTimeoutMs = 15_000;
const tikhubDocsIndexMaxBytes = 512 * 1024;
const tikhubEndpointDocumentMaxBytes = 768 * 1024;
const tikhubCatalogTtlMs = 60_000;
const tikhubCatalogStaleTtlMs = 60 * 60_000;
const tikhubEndpointDocumentTtlMs = 5 * 60_000;
const tikhubEndpointFailureTtlMs = 30_000;
const tikhubEndpointCacheMaxEntries = 256;
const tikhubEndpointCacheMaxBytes = 16 * 1024 * 1024;
const tikhubDiscoveryPageMaxBytes = 4 * 1024 * 1024;
const tikhubEndpointFetchConcurrency = 8;
const tikhubEndpointFetchQueueMax = 128;
const tikhubCursorMaxLength = 1_024;

interface CatalogSnapshot {
  catalogVersion: string;
  generation: number;
  entries: TikHubLlmsIndexEntry[];
  freshUntil: number;
  staleUntil: number;
}

interface CatalogCacheState {
  snapshot?: CatalogSnapshot;
  inFlight?: Promise<{ snapshot: CatalogSnapshot; stale: boolean }>;
  retryAfter?: number;
}

interface EndpointDocumentCacheValue {
  endpoint: TikHubDiscoveredEndpoint | null;
  generation: number;
  freshUntil: number;
  staleUntil: number;
  sizeBytes: number;
  retryAfter?: number;
}

interface EndpointDocumentCacheState {
  value?: EndpointDocumentCacheValue;
  failure?: { error: TikHubRequestError; retryAfter: number };
}

class TransientTikHubDocumentationError extends TikHubRequestError {}

interface TikHubEndpointCatalogCache {
  catalog: CatalogCacheState;
  endpoints: Map<string, EndpointDocumentCacheState>;
  endpointInFlight: Map<string, Promise<{ endpoint: TikHubDiscoveredEndpoint | null; stale: boolean }>>;
  lastKnownEndpoints: Map<string, EndpointDocumentCacheValue>;
  nextCatalogGeneration: number;
  endpointCacheBytes: number;
  lastKnownCacheBytes: number;
  activeEndpointFetches: number;
  endpointFetchWaiters: Array<() => void>;
}

const defaultTikHubEndpointCatalog = createTikHubEndpointCatalog();

export interface TikHubEndpointCatalog {
  discoverEndpoints(input: TikHubDiscoverInput, fetcher: typeof fetch): Promise<TikHubDiscoverResult>;
}

export function createTikHubEndpointCatalog(): TikHubEndpointCatalog {
  const cache: TikHubEndpointCatalogCache = {
    catalog: {},
    endpoints: new Map(),
    endpointInFlight: new Map(),
    lastKnownEndpoints: new Map(),
    nextCatalogGeneration: 0,
    endpointCacheBytes: 0,
    lastKnownCacheBytes: 0,
    activeEndpointFetches: 0,
    endpointFetchWaiters: [],
  };
  return {
    discoverEndpoints(input: TikHubDiscoverInput, fetcher: typeof fetch) {
      return discoverTikHubEndpointsWithCache(input, fetcher, cache);
    },
  };
}

export async function discoverTikHubEndpoints(
  input: TikHubDiscoverInput,
  fetcher: typeof fetch,
): Promise<TikHubDiscoverResult> {
  return defaultTikHubEndpointCatalog.discoverEndpoints(input, fetcher);
}

async function discoverTikHubEndpointsWithCache(
  input: TikHubDiscoverInput,
  fetcher: typeof fetch,
  cache: TikHubEndpointCatalogCache,
): Promise<TikHubDiscoverResult> {
  assertCursorInput(input.cursor);
  const limit = input.limit ?? 10;
  if (!Number.isInteger(limit) || limit < 1 || limit > 20) {
    throw new TikHubRequestError("invalid_input", "limit must be an integer between 1 and 20", 400);
  }
  if (input.category !== undefined && !isEligibleTikHubEndpointCategory(input.category)) {
    throw new TikHubRequestError(
      "authorization_failed",
      `TikHub account category is unavailable through dynamic discovery: ${input.category}`,
      403,
    );
  }

  const catalog = await loadCatalog(fetcher, cache);
  const filterHash = discoveryFilterHash(input);
  const cursorOffset = decodeCursor(input.cursor, catalog.snapshot.catalogVersion, filterHash);
  const eligibleEntries = catalog.snapshot.entries.filter(
    (entry) =>
      isEligibleTikHubEndpointCategory(entry.category) &&
      (input.category === undefined || entry.category === input.category),
  );
  if (cursorOffset > eligibleEntries.length) {
    throw new TikHubRequestError("invalid_input", "cursor offset is outside the current catalog", 400);
  }

  const pageEntries = eligibleEntries.slice(cursorOffset, cursorOffset + limit);
  const parsedEndpoints = await Promise.all(
    pageEntries.map((entry) =>
      loadEndpointDocument(entry, catalog.snapshot.catalogVersion, catalog.snapshot.generation, fetcher, cache),
    ),
  );
  const discoveredEndpoints = parsedEndpoints
    .map((result) => result.endpoint)
    .filter(
      (endpoint): endpoint is TikHubDiscoveredEndpoint =>
        endpoint !== null && matchesEndpointQuery(endpoint, input.query),
    );
  const endpoints = [
    ...new Map(discoveredEndpoints.map((endpoint) => [`${endpoint.method}:${endpoint.path}`, endpoint])).values(),
  ];
  if (new TextEncoder().encode(JSON.stringify(endpoints)).byteLength > tikhubDiscoveryPageMaxBytes) {
    throw new TikHubRequestError(
      "provider_error",
      `TikHub discovery page exceeds the ${tikhubDiscoveryPageMaxBytes} byte limit`,
      502,
    );
  }
  const nextOffset = cursorOffset + pageEntries.length;
  const nextCursor =
    nextOffset < eligibleEntries.length ? encodeCursor(catalog.snapshot.catalogVersion, filterHash, nextOffset) : null;

  return {
    catalogVersion: catalog.snapshot.catalogVersion,
    endpoints,
    nextCursor,
    stale: catalog.stale || parsedEndpoints.some((result) => result.stale),
  };
}

async function loadCatalog(fetcher: typeof fetch, cache: TikHubEndpointCatalogCache) {
  const state = cache.catalog;
  const now = Date.now();
  if (state.snapshot && now < state.snapshot.freshUntil) {
    return { snapshot: state.snapshot, stale: false };
  }
  if (state.snapshot && state.retryAfter && now < state.retryAfter && now < state.snapshot.staleUntil) {
    return { snapshot: state.snapshot, stale: true };
  }
  if (state.inFlight) {
    return state.inFlight;
  }

  state.inFlight = (async () => {
    try {
      const content = await fetchTikHubDocument(tikhubDocsIndexUrl, tikhubDocsIndexMaxBytes, fetcher);
      const fetchedAt = Date.now();
      const entries = parseTikHubLlmsIndex(content);
      if (entries.length === 0) {
        throw new TikHubRequestError("provider_error", "TikHub documentation index contains no API Docs entries", 502);
      }
      cache.nextCatalogGeneration += 1;
      const snapshot = {
        catalogVersion: sha256Hex(content),
        generation: cache.nextCatalogGeneration,
        entries,
        freshUntil: fetchedAt + tikhubCatalogTtlMs,
        staleUntil: fetchedAt + tikhubCatalogStaleTtlMs,
      } satisfies CatalogSnapshot;
      for (const [endpointId, value] of cache.lastKnownEndpoints) {
        if (fetchedAt >= value.staleUntil) {
          cache.lastKnownEndpoints.delete(endpointId);
          cache.lastKnownCacheBytes -= value.sizeBytes;
        }
      }
      if (state.snapshot && state.snapshot.catalogVersion !== snapshot.catalogVersion) {
        cache.endpoints.clear();
        cache.endpointCacheBytes = 0;
      }
      state.snapshot = snapshot;
      state.retryAfter = undefined;
      return { snapshot, stale: false };
    } catch (error) {
      if (
        error instanceof TransientTikHubDocumentationError &&
        state.snapshot &&
        Date.now() < state.snapshot.staleUntil
      ) {
        state.retryAfter = Date.now() + tikhubEndpointFailureTtlMs;
        return { snapshot: state.snapshot, stale: true };
      }
      throw error;
    } finally {
      state.inFlight = undefined;
    }
  })();

  return state.inFlight;
}

async function loadEndpointDocument(
  entry: TikHubLlmsIndexEntry,
  catalogVersion: string,
  catalogGeneration: number,
  fetcher: typeof fetch,
  cache: TikHubEndpointCatalogCache,
) {
  const cacheKey = `${catalogVersion}:${entry.category}:${entry.endpointId}`;
  const lastKnownKey = `${entry.category}:${entry.endpointId}`;
  const cachedState = cache.endpoints.get(cacheKey);
  const staleCandidate = cachedState?.value ?? cache.lastKnownEndpoints.get(lastKnownKey);
  if (cachedState) {
    touchCacheEntry(cache.endpoints, cacheKey, cachedState);
    if (cachedState.failure && Date.now() < cachedState.failure.retryAfter) {
      throw cachedState.failure.error;
    }
    cachedState.failure = undefined;
    if (cachedState.value && Date.now() < cachedState.value.freshUntil) {
      return { endpoint: cachedState.value.endpoint, stale: false };
    }
  }
  if (staleCandidate?.retryAfter && Date.now() < staleCandidate.retryAfter && Date.now() < staleCandidate.staleUntil) {
    return { endpoint: staleCandidate.endpoint, stale: true };
  }
  const currentInFlight = cache.endpointInFlight.get(cacheKey);
  if (currentInFlight) {
    return currentInFlight;
  }

  let inFlight!: Promise<{ endpoint: TikHubDiscoveredEndpoint | null; stale: boolean }>;
  inFlight = (async () => {
    try {
      const endpoint = await withEndpointFetchPermit(cache, async () => {
        const content = await fetchTikHubDocument(entry.documentationUrl, tikhubEndpointDocumentMaxBytes, fetcher);
        return parseTikHubEndpointDocument(entry, content) ?? null;
      });
      const value = {
        endpoint,
        generation: catalogGeneration,
        freshUntil: Date.now() + tikhubEndpointDocumentTtlMs,
        staleUntil: Date.now() + tikhubCatalogStaleTtlMs,
        sizeBytes: new TextEncoder().encode(JSON.stringify(endpoint)).byteLength,
      } satisfies EndpointDocumentCacheValue;
      storeEndpointDocumentValue(cache, cacheKey, lastKnownKey, value);
      return { endpoint, stale: false };
    } catch (error) {
      const currentState = cache.endpoints.get(cacheKey);
      const fallback = currentState?.value ?? cache.lastKnownEndpoints.get(lastKnownKey);
      if (error instanceof TransientTikHubDocumentationError && fallback && Date.now() < fallback.staleUntil) {
        fallback.retryAfter = Date.now() + tikhubEndpointFailureTtlMs;
        return { endpoint: fallback.endpoint, stale: true };
      }
      const connectorError =
        error instanceof TikHubRequestError
          ? error
          : new TikHubRequestError("provider_error", "TikHub endpoint document request failed", 502);
      storeEndpointDocumentFailure(cache, cacheKey, catalogGeneration, connectorError);
      throw connectorError;
    } finally {
      if (cache.endpointInFlight.get(cacheKey) === inFlight) {
        cache.endpointInFlight.delete(cacheKey);
      }
    }
  })();
  cache.endpointInFlight.set(cacheKey, inFlight);
  return inFlight;
}

function storeEndpointDocumentValue(
  cache: TikHubEndpointCatalogCache,
  cacheKey: string,
  lastKnownKey: string,
  value: EndpointDocumentCacheValue,
) {
  if ((cache.catalog.snapshot?.generation ?? 0) > value.generation) {
    return;
  }
  const state = cache.endpoints.get(cacheKey) ?? {};
  if (state.value) {
    cache.endpointCacheBytes -= state.value.sizeBytes;
  }
  state.value = value;
  cache.endpointCacheBytes += value.sizeBytes;
  touchCacheEntry(cache.endpoints, cacheKey, state);

  const previousLastKnown = cache.lastKnownEndpoints.get(lastKnownKey);
  if (!previousLastKnown || previousLastKnown.generation <= value.generation) {
    if (previousLastKnown) {
      cache.lastKnownCacheBytes -= previousLastKnown.sizeBytes;
    }
    cache.lastKnownEndpoints.delete(lastKnownKey);
    cache.lastKnownEndpoints.set(lastKnownKey, value);
    cache.lastKnownCacheBytes += value.sizeBytes;
  }
  pruneEndpointCache(cache);
}

function storeEndpointDocumentFailure(
  cache: TikHubEndpointCatalogCache,
  cacheKey: string,
  generation: number,
  error: TikHubRequestError,
) {
  if ((cache.catalog.snapshot?.generation ?? 0) > generation) {
    return;
  }
  const state = cache.endpoints.get(cacheKey) ?? {};
  state.failure = { error, retryAfter: Date.now() + tikhubEndpointFailureTtlMs };
  touchCacheEntry(cache.endpoints, cacheKey, state);
  pruneEndpointCache(cache);
}

function touchCacheEntry<T>(cache: Map<string, T>, key: string, value: T) {
  cache.delete(key);
  cache.set(key, value);
}

function pruneEndpointCache(cache: TikHubEndpointCatalogCache) {
  while (
    cache.endpoints.size > tikhubEndpointCacheMaxEntries ||
    cache.endpointCacheBytes > tikhubEndpointCacheMaxBytes
  ) {
    const oldestKey = cache.endpoints.keys().next().value as string | undefined;
    if (oldestKey === undefined) {
      break;
    }
    const oldest = cache.endpoints.get(oldestKey);
    cache.endpoints.delete(oldestKey);
    if (oldest?.value) {
      cache.endpointCacheBytes -= oldest.value.sizeBytes;
    }
  }
  while (
    cache.lastKnownEndpoints.size > tikhubEndpointCacheMaxEntries ||
    cache.lastKnownCacheBytes > tikhubEndpointCacheMaxBytes
  ) {
    const oldestEndpointId = cache.lastKnownEndpoints.keys().next().value as string | undefined;
    if (oldestEndpointId === undefined) {
      break;
    }
    const oldest = cache.lastKnownEndpoints.get(oldestEndpointId);
    cache.lastKnownEndpoints.delete(oldestEndpointId);
    if (oldest) {
      cache.lastKnownCacheBytes -= oldest.sizeBytes;
    }
  }
}

async function withEndpointFetchPermit<T>(cache: TikHubEndpointCatalogCache, run: () => Promise<T>) {
  if (cache.activeEndpointFetches >= tikhubEndpointFetchConcurrency) {
    if (cache.endpointFetchWaiters.length >= tikhubEndpointFetchQueueMax) {
      throw new TikHubRequestError("rate_limited", "TikHub discovery queue is full", 429);
    }
    await new Promise<void>((resolve) => cache.endpointFetchWaiters.push(resolve));
  } else {
    cache.activeEndpointFetches += 1;
  }
  try {
    return await run();
  } finally {
    const next = cache.endpointFetchWaiters.shift();
    if (next) {
      next();
    } else {
      cache.activeEndpointFetches -= 1;
    }
  }
}

async function fetchTikHubDocument(url: string, maxBytes: number, fetcher: typeof fetch) {
  const timeout = createProviderTimeout(undefined, tikhubDocsTimeoutMs);
  try {
    const response = await fetcher(url, {
      method: "GET",
      headers: { accept: "text/plain, text/markdown;q=0.9" },
      redirect: "error",
      signal: timeout.signal,
    });
    if (!response.ok) {
      await cancelResponseBody(response);
      const args = [
        "provider_error",
        `TikHub documentation request failed with status ${response.status}`,
        502,
        { upstreamStatus: response.status, url },
      ] as const;
      throw response.status === 429 || response.status >= 500
        ? new TransientTikHubDocumentationError(...args)
        : new TikHubRequestError(...args);
    }
    const content = await readBoundedResponseText(response, {
      maxBytes,
      label: "TikHub documentation",
    });
    return content;
  } catch (error) {
    if (error instanceof TikHubRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new TransientTikHubDocumentationError("provider_error", "TikHub documentation request timed out", 504);
    }
    throw new TransientTikHubDocumentationError(
      "provider_error",
      error instanceof Error
        ? `TikHub documentation request failed: ${error.message}`
        : "TikHub documentation request failed",
      502,
    );
  } finally {
    timeout.cleanup();
  }
}

function matchesEndpointQuery(endpoint: TikHubDiscoveredEndpoint, query: string | undefined) {
  if (query === undefined || query.trim() === "") {
    return true;
  }
  const searchable = [endpoint.category, endpoint.title, endpoint.operationId, endpoint.path].join(" ").toLowerCase();
  const tokens = discoveryQueryTokens(query);
  return tokens.every((token) => searchable.includes(token));
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
  return (
    query
      ?.trim()
      .toLowerCase()
      .split(" ")
      .filter((token) => token !== "") ?? []
  );
}

function encodeCursor(catalogVersion: string, filterHash: string, offset: number) {
  return Buffer.from(JSON.stringify({ version: catalogVersion, filterHash, offset }), "utf8").toString("base64url");
}

function assertCursorInput(cursor: string | null | undefined) {
  if (cursor === undefined || cursor === null) {
    return;
  }
  if (cursor.length === 0 || cursor.length > tikhubCursorMaxLength) {
    throw new TikHubRequestError("invalid_input", "cursor length is invalid", 400);
  }
  for (const character of cursor) {
    const code = character.charCodeAt(0);
    const isDigit = code >= 48 && code <= 57;
    const isUppercase = code >= 65 && code <= 90;
    const isLowercase = code >= 97 && code <= 122;
    if (!isDigit && !isUppercase && !isLowercase && character !== "-" && character !== "_") {
      throw new TikHubRequestError("invalid_input", "cursor encoding is invalid", 400);
    }
  }
}

function decodeCursor(cursor: string | null | undefined, catalogVersion: string, filterHash: string) {
  if (cursor === undefined || cursor === null) {
    return 0;
  }
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
    throw new TikHubRequestError(
      "invalid_input",
      "cursor does not belong to the current TikHub catalog version and filters",
      400,
    );
  }
}

function stableJsonStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJsonStringify).join(",")}]`;
  }
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
