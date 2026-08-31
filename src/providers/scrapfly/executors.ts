import type { CredentialValidationResult, CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import {
  compactObject,
  optionalBoolean,
  optionalInteger,
  optionalRawString,
  optionalRecord,
  optionalString,
  requiredString,
} from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  ProviderRequestError,
  providerUserAgent,
  requiredInputString,
} from "../provider-runtime.ts";

const service = "scrapfly";
const scrapflyApiBaseUrl = "https://api.scrapfly.io";
const scrapflyScrapeApiUrl = `${scrapflyApiBaseUrl}/scrape`;
const scrapflyMetricsApiUrl = `${scrapflyApiBaseUrl}/scrape/monitoring/metrics`;
const scrapflyDefaultRequestTimeoutMs = 160_000;
const maxNonJsonErrorMessageLength = 300;

type ScrapflyPhase = "validate" | "execute";
type ScrapflyQueryValue = string | number | boolean | undefined;
type ScrapflyActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const scrapflyActionHandlers: ProviderActionHandlers<"scrapfly", ScrapflyActionHandler> = {
  async scrape(input, context) {
    const response = await requestScrapflyJson(
      scrapflyScrapeApiUrl,
      buildScrapeQuery(input),
      buildScrapeRequest(input),
      context,
      "execute",
    );
    const payload = requireRecordPayload(
      await readJsonResponse(response, "Scrapfly scrape response"),
      "Scrapfly scrape response",
    );
    return {
      result: requireRecordPayload(payload.result, "Scrapfly scrape result"),
      config: optionalRecord(payload.config) ?? {},
      context: optionalRecord(payload.context) ?? {},
      metadata: buildResponseMetadata(response),
      headers: responseHeadersToObject(response.headers),
    };
  },
  async get_monitoring_metrics(input, context) {
    const response = await requestScrapflyJson(
      scrapflyMetricsApiUrl,
      buildMonitoringQuery(input),
      { method: "GET" },
      context,
      "execute",
    );
    return {
      metrics: requireRecordPayload(
        await readJsonResponse(response, "Scrapfly monitoring metrics response"),
        "Scrapfly monitoring metrics response",
      ),
      metadata: buildResponseMetadata(response),
      headers: responseHeadersToObject(response.headers),
    };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, scrapflyActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    const apiKey = requiredString(input.apiKey, "apiKey", (message) => new ProviderRequestError(401, message));
    const validation = await requestScrapflyValidation(apiKey, fetcher, signal);
    return {
      profile: {
        accountId: "scrapfly",
        displayName: "Scrapfly API Key",
      },
      grantedScopes: [],
      metadata: compactObject({
        validationEndpoint: "/scrape/monitoring/metrics",
        apiBaseUrl: scrapflyApiBaseUrl,
        validationStatus: validation.status,
      }),
    };
  },
};

async function requestScrapflyValidation(
  apiKey: string,
  fetcher: typeof fetch,
  signal: AbortSignal | undefined,
): Promise<{ status: "valid" | "valid_non_enterprise" }> {
  const response = await requestScrapflyRaw(
    scrapflyMetricsApiUrl,
    {
      aggregation: "account",
      period: "last24h",
    },
    { method: "GET" },
    { apiKey, fetcher, signal },
    "validate",
    { allowValidNonEnterpriseStatus: true },
  );
  if (response.status === 402) {
    return { status: "valid_non_enterprise" };
  }
  return { status: "valid" };
}

async function requestScrapflyJson(
  url: string,
  query: Record<string, ScrapflyQueryValue | string[]>,
  init: RequestInit,
  context: ApiKeyProviderContext,
  phase: ScrapflyPhase,
): Promise<Response> {
  return requestScrapflyRaw(url, query, init, context, phase, {});
}

async function requestScrapflyRaw(
  url: string,
  query: Record<string, ScrapflyQueryValue | string[]>,
  init: RequestInit,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  phase: ScrapflyPhase,
  options: { allowValidNonEnterpriseStatus?: boolean },
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), scrapflyDefaultRequestTimeoutMs);
  const signal = mergeAbortSignals(controller.signal, context.signal);
  try {
    const response = await context.fetcher(buildScrapflyUrl(url, query, context.apiKey), {
      ...init,
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
        ...init.headers,
      },
      signal,
    });
    if (!response.ok && !(options.allowValidNonEnterpriseStatus && response.status === 402)) {
      throw createScrapflyError(response.status, await response.text(), response.headers, phase);
    }
    return response;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (isAbortError(error)) {
      throw new ProviderRequestError(504, "Scrapfly request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Scrapfly request failed: ${error.message}` : "Scrapfly request failed",
    );
  } finally {
    clearTimeout(timeout);
  }
}

function buildScrapflyUrl(url: string, query: Record<string, ScrapflyQueryValue | string[]>, apiKey: string): URL {
  const requestUrl = new URL(url);
  requestUrl.searchParams.set("key", apiKey);
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const child of value) {
        requestUrl.searchParams.append(`${key}[]`, child);
      }
      continue;
    }
    requestUrl.searchParams.set(key, String(value));
  }
  return requestUrl;
}

function buildScrapeQuery(input: Record<string, unknown>): Record<string, ScrapflyQueryValue | string[]> {
  return compactObject({
    url: requiredInputString(input.url, "url"),
    country: optionalString(input.country),
    proxy_pool: optionalString(input.proxy_pool),
    render_js: optionalBoolean(input.render_js),
    asp: optionalBoolean(input.asp),
    retry: optionalBoolean(input.retry),
    timeout: optionalInteger(input.timeout),
    wait_for_selector: optionalString(input.wait_for_selector),
    cache: optionalBoolean(input.cache),
    cache_ttl: optionalInteger(input.cache_ttl),
    cache_clear: optionalBoolean(input.cache_clear),
    session: optionalString(input.session),
    session_sticky_proxy: optionalBoolean(input.session_sticky_proxy),
    format: optionalString(input.format),
    correlation_id: optionalString(input.correlation_id),
    debug: optionalBoolean(input.debug),
    ...buildPrefixedStringRecord("headers", input.headers),
    tags: readOptionalStringArray(input.tags),
  });
}

function buildMonitoringQuery(input: Record<string, unknown>): Record<string, ScrapflyQueryValue> {
  return compactObject({
    aggregation: optionalString(input.aggregation),
    period: optionalString(input.period),
    start: optionalString(input.start),
    end: optionalString(input.end),
    group_subdomain: optionalBoolean(input.group_subdomain),
  });
}

function buildScrapeRequest(input: Record<string, unknown>): RequestInit {
  const method = optionalString(input.method) ?? "GET";
  const body = optionalRawString(input.body);
  const contentType = optionalString(input.content_type);
  if ((method === "GET" || method === "HEAD") && body) {
    throw new ProviderRequestError(400, `${method} scrape requests cannot include body`);
  }
  if (body && !contentType) {
    throw new ProviderRequestError(400, "content_type is required when body is set");
  }
  return {
    method,
    body: body || undefined,
    headers: contentType ? { "content-type": contentType } : undefined,
  };
}

function buildResponseMetadata(response: Response): Record<string, unknown> {
  return {
    status_code: response.status,
    api_cost: readOptionalHeaderInteger(response.headers, "x-scrapfly-api-cost"),
    remaining_api_credit: readOptionalHeaderInteger(response.headers, "x-scrapfly-remaining-api-credit"),
    reject_code: response.headers.get("x-scrapfly-reject-code"),
    reject_description: response.headers.get("x-scrapfly-reject-description"),
    reject_retryable: response.headers.get("x-scrapfly-reject-retryable"),
  };
}

function responseHeadersToObject(headers: Headers): Record<string, string> {
  return Object.fromEntries(headers.entries());
}

async function readJsonResponse(response: Response, label: string): Promise<unknown> {
  const body = await response.text();
  if (body.trim() === "") {
    throw new ProviderRequestError(502, `${label} returned an empty body`);
  }
  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new ProviderRequestError(502, `${label} returned invalid JSON`);
  }
}

function requireRecordPayload(payload: unknown, label: string): Record<string, unknown> {
  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, `${label} must be a JSON object`);
  }
  return record;
}

function createScrapflyError(
  status: number,
  body: string,
  headers: Headers,
  phase: ScrapflyPhase,
): ProviderRequestError {
  const rejectCode = headers.get("x-scrapfly-reject-code");
  const message = extractScrapflyErrorMessage(body) ?? rejectCode ?? `Scrapfly request failed with status ${status}`;
  if (status === 429) {
    return new ProviderRequestError(429, message);
  }
  if (phase === "validate" && status >= 400 && status < 500) {
    return new ProviderRequestError(400, message);
  }
  return new ProviderRequestError(status || 500, message);
}

function extractScrapflyErrorMessage(body: string): string | undefined {
  const trimmed = body.trim();
  if (!trimmed) {
    return undefined;
  }
  try {
    const record = optionalRecord(JSON.parse(trimmed) as unknown);
    const message = optionalString(record?.message) ?? optionalString(record?.error) ?? optionalString(record?.detail);
    if (message) {
      return message;
    }
  } catch {}
  if (looksLikeHtml(trimmed)) {
    return "Scrapfly returned a non-JSON error response";
  }
  return trimmed.length <= maxNonJsonErrorMessageLength
    ? trimmed
    : `${trimmed.slice(0, maxNonJsonErrorMessageLength)}...`;
}

function buildPrefixedStringRecord(prefix: string, value: unknown): Record<string, string> {
  const record = optionalRecord(value);
  if (!record) {
    return {};
  }
  const output: Record<string, string> = {};
  for (const [key, child] of Object.entries(record)) {
    const parsed = optionalString(child);
    if (parsed) {
      output[`${prefix}[${key}]`] = parsed;
    }
  }
  return output;
}

function readOptionalStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const items = value.map((item) => optionalString(item)).filter((item): item is string => Boolean(item));
  return items.length > 0 ? items : undefined;
}

function readOptionalHeaderInteger(headers: Headers, name: string): number | null {
  const value = headers.get(name);
  if (!value) {
    return null;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function looksLikeHtml(value: string): boolean {
  return /^<!doctype html/i.test(value) || /^<html[\s>]/i.test(value);
}

function mergeAbortSignals(timeoutSignal: AbortSignal, contextSignal: AbortSignal | undefined): AbortSignal {
  if (!contextSignal) {
    return timeoutSignal;
  }
  if (contextSignal.aborted) {
    return contextSignal;
  }
  const controller = new AbortController();
  const abort = (): void => controller.abort();
  timeoutSignal.addEventListener("abort", abort, { once: true });
  contextSignal.addEventListener("abort", abort, { once: true });
  return controller.signal;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}
