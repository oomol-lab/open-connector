import type { CredentialValidationResult } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { optionalRecord, optionalString } from "../../core/cast.ts";
import { createProviderTimeout, providerUserAgent } from "../provider-runtime.ts";
import { loadScrapeCreatorsCatalog, readBoundedResponseText } from "./catalog.ts";
import { ScrapeCreatorsRequestError } from "./errors.ts";

const apiBaseUrl = "https://api.scrapecreators.com";
const requestTimeoutMs = 60_000;
const responseMaxBytes = 8 * 1024 * 1024;
const requestMaxBytes = 1024 * 1024;
const queryMaxKeys = 128;
const queryMaxValues = 256;

export async function validateScrapeCreatorsCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const result = await requestJson(
    "GET",
    "/v1/account/credit-balance",
    {},
    undefined,
    apiKey,
    fetcher,
    "validate",
    signal,
  );
  return {
    profile: {
      accountId: "scrape-creators",
      displayName: "Scrape Creators API Key",
    },
    grantedScopes: [],
    metadata: {
      validationEndpoint: "/v1/account/credit-balance",
      creditBalance: readBalance(result.payload),
    },
  };
}

export const scrapeCreatorsActionHandlers: Record<string, ProviderRuntimeHandler<ApiKeyProviderContext>> = {
  async get_credit_balance(_input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
    const result = await requestJson(
      "GET",
      "/v1/account/credit-balance",
      {},
      undefined,
      context.apiKey,
      context.fetcher,
      "execute",
      context.signal,
    );
    return { balance: readBalance(result.payload), raw: asObject(result.payload) };
  },
  discover_endpoints(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
    return discoverEndpoints(input, context.fetcher);
  },
  invoke_endpoint(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
    return invokeEndpoint(input, context.apiKey, context.fetcher, context.signal);
  },
};

async function discoverEndpoints(input: Record<string, unknown>, fetcher: typeof fetch) {
  const catalog = await loadScrapeCreatorsCatalog(fetcher);
  const query = optionalString(input.query)?.toLowerCase();
  const category = optionalString(input.category);
  const offset = typeof input.offset === "number" ? input.offset : 0;
  const limit = typeof input.limit === "number" ? input.limit : 20;
  const matching = catalog.snapshot.endpoints.filter((endpoint) => {
    if (category && endpoint.category !== category) return false;
    if (!query) return true;
    return [endpoint.category, endpoint.title, endpoint.description, endpoint.path].some((value) =>
      value.toLowerCase().includes(query),
    );
  });
  return {
    catalogVersion: catalog.snapshot.version,
    endpoints: matching.slice(offset, offset + limit),
    total: matching.length,
    nextOffset: offset + limit < matching.length ? offset + limit : null,
    stale: catalog.stale,
  };
}

async function invokeEndpoint(
  input: Record<string, unknown>,
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
) {
  const method = input.method === "GET" || input.method === "POST" ? input.method : undefined;
  const path = optionalString(input.path);
  if (!method || !path) throw new ScrapeCreatorsRequestError("invalid_input", "method and path are required", 400);
  const catalog = await loadScrapeCreatorsCatalog(fetcher);
  if (!catalog.snapshot.endpoints.some((endpoint) => endpoint.method === method && endpoint.path === path)) {
    throw new ScrapeCreatorsRequestError(
      "policy_denied",
      "endpoint is not present in the current Scrape Creators OpenAPI document",
      403,
    );
  }
  const request = optionalRecord(input.request) ?? {};
  const query = optionalRecord(request.query) ?? {};
  const body = method === "POST" ? request.body : undefined;
  const result = await requestJson(method, path, query, body, apiKey, fetcher, "execute", signal);
  return { method, path, status: result.status, response: result.payload };
}

async function requestJson(
  method: "GET" | "POST",
  path: string,
  query: Record<string, unknown>,
  body: unknown,
  apiKey: string,
  fetcher: typeof fetch,
  phase: "validate" | "execute",
  parentSignal?: AbortSignal,
) {
  const url = new URL(path, apiBaseUrl);
  if (url.origin !== apiBaseUrl)
    throw new ScrapeCreatorsRequestError(
      "policy_denied",
      "endpoint must resolve to the official Scrape Creators API origin",
      403,
    );
  if (Object.keys(query).length > queryMaxKeys)
    throw new ScrapeCreatorsRequestError(
      "invalid_input",
      `request.query cannot contain more than ${queryMaxKeys} keys`,
      400,
    );
  let queryValueCount = 0;
  for (const [name, value] of Object.entries(query))
    queryValueCount = appendQuery(url.searchParams, name, value, queryValueCount);
  const serializedBody = body === undefined ? undefined : JSON.stringify(body);
  if (serializedBody && new TextEncoder().encode(serializedBody).byteLength > requestMaxBytes)
    throw new ScrapeCreatorsRequestError("invalid_input", "request.body is too large", 400);
  const timeout = createProviderTimeout(parentSignal, requestTimeoutMs);
  try {
    const headers = new Headers({
      accept: "application/json",
      "x-api-key": apiKey,
      "user-agent": providerUserAgent,
    });
    if (serializedBody !== undefined) headers.set("content-type", "application/json");
    const response = await fetcher(url, {
      method,
      headers,
      body: serializedBody,
      redirect: "error",
      signal: timeout.signal,
    });
    const text = await readBoundedResponseText(response, responseMaxBytes, "Scrape Creators response");
    let payload: unknown = {};
    try {
      payload = text === "" ? {} : JSON.parse(text);
    } catch {
      throw new ScrapeCreatorsRequestError("provider_error", "Scrape Creators returned invalid JSON", 502);
    }
    if (!response.ok) throw mapError(response.status, payload, phase);
    return { status: response.status, payload };
  } catch (error) {
    if (error instanceof ScrapeCreatorsRequestError) throw error;
    if (timeout.didTimeout())
      throw new ScrapeCreatorsRequestError("provider_error", "Scrape Creators request timed out", 504);
    throw new ScrapeCreatorsRequestError("provider_error", "Scrape Creators request failed", 502);
  } finally {
    timeout.cleanup();
  }
}

function appendQuery(search: URLSearchParams, name: string, value: unknown, currentValueCount: number) {
  const values = Array.isArray(value) ? value : [value];
  const nextValueCount = currentValueCount + values.length;
  if (nextValueCount > queryMaxValues)
    throw new ScrapeCreatorsRequestError(
      "invalid_input",
      `request.query cannot contain more than ${queryMaxValues} scalar values`,
      400,
    );
  for (const item of values) {
    if (typeof item !== "string" && typeof item !== "number" && typeof item !== "boolean")
      throw new ScrapeCreatorsRequestError(
        "invalid_input",
        `request.query.${name} must be a scalar or scalar array`,
        400,
      );
    if (typeof item === "number" && !Number.isFinite(item))
      throw new ScrapeCreatorsRequestError("invalid_input", `request.query.${name} must contain finite numbers`, 400);
    search.append(name, String(item));
  }
  return nextValueCount;
}

function mapError(status: number, payload: unknown, phase: "validate" | "execute") {
  const message =
    optionalString(optionalRecord(payload)?.error) ??
    optionalString(optionalRecord(payload)?.message) ??
    `Scrape Creators returned HTTP ${status}`;
  if (status === 401)
    return new ScrapeCreatorsRequestError(phase === "validate" ? "invalid_input" : "credential_expired", message, 401);
  if (status === 402) return new ScrapeCreatorsRequestError("provider_error", message, 402);
  if (status === 429) return new ScrapeCreatorsRequestError("rate_limited", message, 429);
  return new ScrapeCreatorsRequestError("provider_error", message, status >= 500 ? 502 : status);
}

function readBalance(payload: unknown) {
  const record = optionalRecord(payload);
  for (const value of [
    record?.creditCount,
    record?.credits_remaining,
    record?.credit_balance,
    record?.balance,
    record?.credits,
  ])
    if (typeof value === "number") return value;
  return null;
}

function asObject(value: unknown) {
  const record = optionalRecord(value);
  if (!record)
    throw new ScrapeCreatorsRequestError("provider_error", "Scrape Creators returned a non-object response", 502);
  return record;
}
