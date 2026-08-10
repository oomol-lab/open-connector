import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalInteger, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  ProviderRequestError,
  providerUserAgent,
  setSearchParams,
} from "../provider-runtime.ts";

const service = "urlscan";
const urlscanApiBaseUrl = "https://urlscan.io";

type UrlscanPhase = "validate" | "execute";
type UrlscanActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const urlscanActionHandlers: Record<string, UrlscanActionHandler> = {
  async submit_scan(input, context) {
    const payload = await requestUrlscanJson({
      context,
      path: "/api/v1/scan/",
      method: "POST",
      body: compactObject({
        url: requiredString(input.url, "url"),
        visibility: optionalString(input.visibility),
        tags: readOptionalStringArray(input.tags, "tags"),
        customagent: optionalString(input.customagent),
        referer: optionalString(input.referer),
        overrideSafety: typeof input.overrideSafety === "boolean" ? input.overrideSafety : undefined,
        country: optionalString(input.country),
      }),
      phase: "execute",
    });
    return normalizeSubmitResponse(payload);
  },
  async get_result(input, context) {
    const uuid = requiredString(input.uuid, "uuid");
    const payload = await requestUrlscanJson({
      context,
      path: `/api/v1/result/${encodeURIComponent(uuid)}/`,
      method: "GET",
      phase: "execute",
    });
    return { uuid, result: payload };
  },
  async search_scans(input, context) {
    const payload = await requestUrlscanJson({
      context,
      path: "/api/v1/search/",
      method: "GET",
      query: compactObject({
        q: optionalString(input.query) ?? "*",
        size: optionalInteger(input.size),
        search_after: normalizeSearchAfterInput(input.searchAfter),
      }),
      phase: "execute",
    });
    return normalizeSearchResponse(payload);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, urlscanActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    await requestUrlscanJson({
      context: { apiKey: input.apiKey, fetcher, signal },
      path: "/user/quotas/",
      method: "GET",
      phase: "validate",
    });
    return {
      profile: { displayName: "urlscan.io API Key" },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: urlscanApiBaseUrl,
        validationEndpoint: "/user/quotas/",
      },
    };
  },
};

async function requestUrlscanJson(input: {
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  path: string;
  method: "GET" | "POST";
  phase: UrlscanPhase;
  query?: Record<string, string | number | boolean | undefined>;
  body?: Record<string, unknown>;
}): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    const headers = new Headers({
      accept: "application/json",
      "user-agent": providerUserAgent,
      "API-Key": input.context.apiKey,
    });
    if (input.method === "POST") headers.set("content-type", "application/json");
    response = await input.context.fetcher(buildUrlscanUrl(input.path, input.query), {
      method: input.method,
      headers,
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: input.context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `urlscan.io request failed: ${error.message}` : "urlscan.io request failed",
    );
  }

  const payload = await readUrlscanPayload(response);
  if (!response.ok) throw createUrlscanError(response.status, payload, input.phase);
  const record = optionalRecord(payload);
  if (!record) throw new ProviderRequestError(502, "urlscan.io returned an invalid JSON response");
  return record;
}

function buildUrlscanUrl(path: string, query?: Record<string, string | number | boolean | undefined>): URL {
  const url = new URL(path, urlscanApiBaseUrl);
  if (query)
    setSearchParams(
      url,
      Object.fromEntries(
        Object.entries(query).map(([key, value]) => [key, value === undefined ? undefined : String(value)]),
      ),
    );
  return url;
}

async function readUrlscanPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "urlscan.io returned an invalid JSON response");
  }
}

function createUrlscanError(status: number, payload: unknown, phase: UrlscanPhase): ProviderRequestError {
  const message = readUrlscanMessage(payload) ?? `urlscan.io request failed with ${status || 500}`;
  if (status === 429) return new ProviderRequestError(429, message, payload);
  if (phase === "validate" && status >= 400 && status < 500) return new ProviderRequestError(400, message, payload);
  if (phase === "execute" && (status === 401 || status === 403))
    return new ProviderRequestError(status, message, payload);
  if (phase === "execute" && status >= 400 && status < 500) return new ProviderRequestError(400, message, payload);
  return new ProviderRequestError(status || 500, message, payload);
}

function readUrlscanMessage(payload: unknown): string | undefined {
  const record = optionalRecord(payload);
  return record
    ? (optionalString(record.message) ?? optionalString(record.description) ?? optionalString(record.error))
    : undefined;
}

function normalizeSubmitResponse(payload: Record<string, unknown>): Record<string, unknown> {
  const country = optionalString(payload.country);
  const options = optionalRecord(payload.options);
  return compactObject({
    message: requiredString(payload.message, "message"),
    uuid: requiredString(payload.uuid, "uuid"),
    resultUrl: requiredString(payload.result, "result"),
    apiUrl: requiredString(payload.api, "api"),
    visibility: requiredString(payload.visibility, "visibility"),
    url: requiredString(payload.url, "url"),
    country,
    options,
  });
}

function normalizeSearchResponse(payload: Record<string, unknown>): Record<string, unknown> {
  const results = readObjectArray(payload.results, "results");
  const total = optionalInteger(payload.total);
  const nextSearchAfter = readNextSearchAfter(results);
  return compactObject({
    results,
    total,
    hasMore: typeof payload.has_more === "boolean" ? payload.has_more : undefined,
    nextSearchAfter,
    raw: payload,
  });
}

function readNextSearchAfter(results: Array<Record<string, unknown>>): Array<string | number> | undefined {
  const last = results.at(-1);
  if (!Array.isArray(last?.sort)) return undefined;
  const values = last.sort.filter((item) => typeof item === "string" || typeof item === "number");
  return values.length > 0 ? values : undefined;
}

function normalizeSearchAfterInput(value: unknown): string | undefined {
  if (typeof value === "string") return value.trim() || undefined;
  if (!Array.isArray(value)) return undefined;
  const parts = value.map((item) => String(item).trim()).filter(Boolean);
  return parts.length > 0 ? parts.join(",") : undefined;
}

function readOptionalStringArray(value: unknown, fieldName: string): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new ProviderRequestError(400, `${fieldName} must be an array`);
  return value.map((item) => {
    const text = optionalString(item);
    if (!text) throw new ProviderRequestError(400, `${fieldName} must contain non-empty strings`);
    return text;
  });
}

function readObjectArray(value: unknown, fieldName: string): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) throw new ProviderRequestError(502, `urlscan.io ${fieldName} response is invalid`);
  return value.map((item) => {
    const record = optionalRecord(item);
    if (!record) throw new ProviderRequestError(502, `urlscan.io ${fieldName} response is invalid`);
    return record;
  });
}

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://urlscan.io",
  auth: { type: "api_key_header", name: "api-key" },
});
