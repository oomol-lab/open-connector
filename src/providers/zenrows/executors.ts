import type {
  CredentialValidationResult,
  CredentialValidators,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";

import {
  compactObject,
  optionalBoolean,
  optionalNumber,
  optionalRecord,
  optionalString,
  requiredString,
} from "../../core/cast.ts";
import {
  createProviderTimeout,
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  isAbortLikeError,
  providerProxyEndpointPrefixes,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

const service = "zenrows";
const zenrowsApiBaseUrl = "https://api.zenrows.com/v1/";
const zenrowsSubscriptionsApiUrl = "https://api.zenrows.com/v1/subscriptions/self/details/";
const zenrowsDefaultRequestTimeoutMs = 60_000;
const maxNonJsonErrorMessageLength = 300;

type ZenrowsPhase = "validate" | "execute";
type ZenrowsQueryValue = string | number | boolean | undefined;
type ZenrowsAuthLocation = "query" | "header";
type ZenrowsActionHandler = ProviderRuntimeHandler<ApiKeyProviderContext>;

export const zenrowsActionHandlers: ProviderActionHandlers<"zenrows", ZenrowsActionHandler> = {
  async fetch_html(input, context) {
    const response = await requestZenrowsRaw(
      buildScrapeQuery(input, {
        original_status: optionalBoolean(input.original_status),
      }),
      context,
      "execute",
    );
    const html = await response.text();

    return {
      html,
      metadata: buildResponseMetadata(response),
      headers: responseHeadersToObject(response.headers),
    };
  },
  async fetch_plaintext(input, context) {
    const response = await requestZenrowsRaw(
      buildScrapeQuery(input, { response_type: "plaintext" }),
      context,
      "execute",
    );
    const text = await response.text();

    return {
      text,
      metadata: buildResponseMetadata(response),
      headers: responseHeadersToObject(response.headers),
    };
  },
  async extract_css(input, context) {
    const response = await requestZenrowsRaw(
      buildScrapeQuery(input, {
        css_extractor: JSON.stringify(readRequiredRecord(input.css_selectors, "css_selectors")),
        json_response: true,
      }),
      context,
      "execute",
    );
    const payload = await readJsonResponse(response, "ZenRows CSS extraction response");
    const data = requireRecordPayload(payload, "ZenRows CSS extraction response");

    return {
      data,
      metadata: buildResponseMetadata(response),
      headers: responseHeadersToObject(response.headers),
    };
  },
  async get_usage(_input, context) {
    return {
      usage: await requestZenrowsUsage(context, "execute"),
    };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, zenrowsActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    const usage = await requestZenrowsUsage(
      {
        apiKey: input.apiKey,
        fetcher,
        signal,
      },
      "validate",
    );

    return {
      profile: {
        accountId: service,
        displayName: "ZenRows API Key",
      },
      grantedScopes: [],
      metadata: compactObject({
        validationEndpoint: "/v1/subscriptions/self/details/",
        apiBaseUrl: "https://api.zenrows.com/v1",
        status: optionalString(usage.status),
        periodStartsAt: optionalString(usage.period_starts_at),
        periodEndsAt: optionalString(usage.period_ends_at),
        usage: optionalNumber(usage.usage),
        usagePercent: optionalNumber(usage.usage_percent),
      }),
    };
  },
};

async function requestZenrowsUsage(
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  phase: ZenrowsPhase,
): Promise<Record<string, unknown>> {
  const response = await requestZenrowsUrl(zenrowsSubscriptionsApiUrl, {}, context, "header", phase);
  const payload = await readJsonResponse(response, "ZenRows usage response");
  return requireRecordPayload(payload, "ZenRows usage response");
}

async function requestZenrowsRaw(
  query: Record<string, ZenrowsQueryValue>,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  phase: ZenrowsPhase,
): Promise<Response> {
  return requestZenrowsUrl(zenrowsApiBaseUrl, query, context, "query", phase);
}

async function requestZenrowsUrl(
  url: string,
  query: Record<string, ZenrowsQueryValue>,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  authLocation: ZenrowsAuthLocation,
  phase: ZenrowsPhase,
): Promise<Response> {
  const timeout = createProviderTimeout(context.signal, zenrowsDefaultRequestTimeoutMs);

  try {
    const response = await context.fetcher(
      buildZenrowsUrl(url, query, authLocation === "query" ? context.apiKey : undefined),
      {
        method: "GET",
        headers: {
          accept: "*/*",
          ...(authLocation === "header" ? { "x-api-key": context.apiKey } : {}),
          "user-agent": providerUserAgent,
        },
        signal: timeout.signal,
      },
    );

    if (!response.ok) {
      throw createZenrowsError(response.status, await response.text(), phase);
    }

    return response;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "ZenRows request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `ZenRows request failed: ${error.message}` : "ZenRows request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

function buildZenrowsUrl(url: string, query: Record<string, ZenrowsQueryValue>, apiKey: string | undefined): string {
  const requestUrl = new URL(url);
  if (apiKey) {
    requestUrl.searchParams.set("apikey", apiKey);
  }
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      requestUrl.searchParams.set(key, String(value));
    }
  }
  return requestUrl.toString();
}

function buildScrapeQuery(
  input: Record<string, unknown>,
  extra: Record<string, ZenrowsQueryValue>,
): Record<string, ZenrowsQueryValue> {
  const premiumProxy = optionalBoolean(input.premium_proxy);
  const proxyCountry = optionalString(input.proxy_country);
  if (proxyCountry && premiumProxy !== true) {
    throw new ProviderRequestError(400, "proxy_country requires premium_proxy to be true");
  }

  return compactObject({
    url: requiredString(input.url, "url", providerInputError),
    js_render: optionalBoolean(input.js_render),
    wait: optionalNumber(input.wait),
    wait_for: optionalString(input.wait_for),
    premium_proxy: premiumProxy,
    proxy_country: proxyCountry,
    session_id: optionalString(input.session_id),
    custom_headers: stringifyOptionalRecord(input.custom_headers, "custom_headers"),
    ...extra,
  }) as Record<string, ZenrowsQueryValue>;
}

function buildResponseMetadata(response: Response): Record<string, unknown> {
  return {
    status_code: response.status,
    content_type: response.headers.get("content-type"),
    original_status_code: readOptionalHeaderInteger(response.headers, "x-zenrows-original-status"),
    final_url: response.headers.get("x-zenrows-final-url"),
    request_id: response.headers.get("x-zenrows-request-id"),
    concurrency_limit: readOptionalHeaderInteger(response.headers, "x-zenrows-concurrency-limit"),
    concurrency_remaining: readOptionalHeaderInteger(response.headers, "x-zenrows-concurrency-remaining"),
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

function createZenrowsError(status: number, body: string, phase: ZenrowsPhase): ProviderRequestError {
  const message = extractZenrowsErrorMessage(body) ?? `ZenRows request failed with status ${status}`;
  if (phase === "validate" && status >= 400 && status < 500 && status !== 429) {
    return new ProviderRequestError(400, message, body);
  }
  return new ProviderRequestError(status || 500, message, body);
}

function extractZenrowsErrorMessage(body: string): string | undefined {
  const trimmed = body.trim();
  if (!trimmed) {
    return undefined;
  }

  try {
    const payload = JSON.parse(trimmed) as unknown;
    const record = optionalRecord(payload);
    const message = optionalString(record?.message) ?? optionalString(record?.error) ?? optionalString(record?.detail);
    if (message) {
      return message;
    }
  } catch {
    // Fall through to safe text handling.
  }

  if (looksLikeHtml(trimmed)) {
    return "ZenRows returned a non-JSON error response";
  }

  if (trimmed.length <= maxNonJsonErrorMessageLength) {
    return trimmed;
  }

  return `${trimmed.slice(0, maxNonJsonErrorMessageLength)}...`;
}

function stringifyOptionalRecord(value: unknown, fieldName: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  return JSON.stringify(readRequiredRecord(value, fieldName));
}

function readRequiredRecord(value: unknown, fieldName: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(400, `${fieldName} must be an object`);
  }
  return record;
}

function looksLikeHtml(value: string): boolean {
  const prefix = value.slice(0, 32).toLowerCase();
  return prefix.startsWith("<!doctype") || prefix.startsWith("<html");
}

function readOptionalHeaderInteger(headers: Headers, name: string): number | null {
  const raw = headers.get(name);
  if (!raw) {
    return null;
  }

  const value = Number(raw);
  return Number.isInteger(value) ? value : null;
}

function providerInputError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://api.zenrows.com",
  auth: { type: "api_key_header", name: "x-api-key" },
  allowedEndpoint: providerProxyEndpointPrefixes("/v1"),
});
