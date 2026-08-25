import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderFetch, ProviderRuntimeHandler } from "../provider-runtime.ts";

import {
  compactObject,
  optionalBoolean,
  optionalNumber,
  optionalRecord,
  optionalRawString,
  optionalString,
} from "../../core/cast.ts";
import { assertPublicHttpUrl, readBoundedResponseBytes } from "../../core/request.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

type ScraperapiPhase = "validate" | "execute";
type ScraperapiQueryValue = string | number | boolean | undefined;
type ScraperapiActionContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
type ScraperapiActionHandler = ProviderRuntimeHandler<ScraperapiActionContext>;

export const scraperapiApiBaseUrl = "https://api.scraperapi.com/";

const scraperapiAccountUrl = "https://api.scraperapi.com/account";
const scraperapiRequestTimeoutMs = 80_000;
const scraperapiMaxResponseBytes = 10 * 1024 * 1024;
const scraperapiMaxErrorBytes = 64 * 1024;
const maxNonJsonErrorMessageLength = 300;

export const scraperapiActionHandlers: ProviderActionHandlers<"scraperapi", ScraperapiActionHandler> = {
  async scrape_url(input, context) {
    const customHeaders = readOptionalStringRecord(input.customHeaders, "customHeaders");
    const response = await requestScraperapiRaw(
      buildScrapeQuery(input),
      {
        method: "GET",
        headers: customHeaders,
      },
      context,
      "execute",
    );

    return buildTextResponse(response, await readScraperapiText(response));
  },
  async submit_url(input, context) {
    const method = readSubmitMethod(input.method);
    const body = readRequiredInputString(input.body, "body");
    const contentType = optionalRawString(input.contentType) ?? "application/json";
    const customHeaders = readOptionalStringRecord(input.customHeaders, "customHeaders");
    const response = await requestScraperapiRaw(
      buildScrapeQuery(input),
      {
        method,
        body,
        headers: {
          ...customHeaders,
          "content-type": contentType,
        },
      },
      context,
      "execute",
    );

    return buildTextResponse(response, await readScraperapiText(response));
  },
  async get_account_usage(_input, context) {
    return {
      usage: await requestScraperapiAccount(context.apiKey, context.fetcher, context.signal, "execute"),
    };
  },
};

export async function validateScraperapiCredential(
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const usage = await requestScraperapiAccount(apiKey, fetcher, signal, "validate");

  return {
    profile: {
      accountId: "scraperapi",
      displayName: "ScraperAPI API Key",
    },
    grantedScopes: [],
    metadata: compactObject({
      validationEndpoint: "/account",
      apiBaseUrl: "https://api.scraperapi.com",
      requestCount: optionalNumber(usage.requestCount),
      failedRequestCount: optionalNumber(usage.failedRequestCount),
      concurrentRequests: optionalNumber(usage.concurrentRequests),
      requestLimit: optionalNumber(usage.requestLimit),
    }),
  };
}

async function requestScraperapiAccount(
  apiKey: string,
  fetcher: ProviderFetch,
  signal: AbortSignal | undefined,
  phase: ScraperapiPhase,
): Promise<Record<string, unknown>> {
  const response = await requestScraperapiUrl(
    scraperapiAccountUrl,
    {},
    {
      method: "GET",
    },
    { apiKey, fetcher, signal },
    phase,
  );
  const payload = await readJsonResponse(response, "ScraperAPI account usage response");
  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, "ScraperAPI account usage response must be a JSON object", payload);
  }
  return record;
}

async function requestScraperapiRaw(
  query: Record<string, ScraperapiQueryValue>,
  init: RequestInit,
  context: ScraperapiActionContext,
  phase: ScraperapiPhase,
): Promise<Response> {
  return requestScraperapiUrl(scraperapiApiBaseUrl, query, init, context, phase);
}

async function requestScraperapiUrl(
  url: string,
  query: Record<string, ScraperapiQueryValue>,
  init: RequestInit,
  context: ScraperapiActionContext,
  phase: ScraperapiPhase,
): Promise<Response> {
  const timeout = createProviderTimeout(context.signal, scraperapiRequestTimeoutMs);

  try {
    const response = await context.fetcher(buildScraperapiUrl(url, query, context.apiKey), {
      ...init,
      headers: {
        accept: "*/*",
        "user-agent": providerUserAgent,
        ...init.headers,
      },
      signal: timeout.signal,
    });

    if (!response.ok) {
      throw createScraperapiError(response.status, await readScraperapiErrorText(response), phase);
    }

    return response;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "ScraperAPI request timed out", error);
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `ScraperAPI request failed: ${error.message}` : "ScraperAPI request failed",
      error,
    );
  } finally {
    timeout.cleanup();
  }
}

function buildScraperapiUrl(url: string, query: Record<string, ScraperapiQueryValue>, apiKey: string): URL {
  const requestUrl = assertPublicHttpUrl(url, {
    fieldName: "url",
    createError: (message) => new ProviderRequestError(400, message),
  });
  requestUrl.searchParams.set("api_key", apiKey);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      requestUrl.searchParams.set(key, String(value));
    }
  }
  return requestUrl;
}

function buildScrapeQuery(input: Record<string, unknown>): Record<string, ScraperapiQueryValue> {
  const render = optionalBoolean(input.render);
  const premium = optionalBoolean(input.premium);
  const ultraPremium = optionalBoolean(input.ultraPremium);
  const sessionNumber = optionalNumber(input.sessionNumber);
  const waitForSelector = optionalRawString(input.waitForSelector);
  const keepHeaders = optionalBoolean(input.keepHeaders);
  const customHeaders = optionalRecord(input.customHeaders);

  if (premium === true && ultraPremium === true) {
    throw new ProviderRequestError(400, "premium and ultraPremium cannot both be true");
  }
  if (sessionNumber !== undefined && (premium === true || ultraPremium === true)) {
    throw new ProviderRequestError(400, "sessionNumber cannot be combined with premium or ultraPremium");
  }
  if (waitForSelector && render !== true) {
    throw new ProviderRequestError(400, "waitForSelector requires render to be true");
  }
  if (customHeaders && keepHeaders === false) {
    throw new ProviderRequestError(400, "customHeaders requires keepHeaders to be true or omitted");
  }

  return compactObject({
    url: readRequiredInputString(input.url, "url"),
    render,
    wait_for_selector: waitForSelector,
    country_code: optionalRawString(input.countryCode),
    premium,
    ultra_premium: ultraPremium,
    session_number: sessionNumber,
    keep_headers: keepHeaders ?? (customHeaders ? true : undefined),
    device_type: optionalRawString(input.deviceType),
    output_format: optionalRawString(input.outputFormat),
    follow_redirect: optionalBoolean(input.followRedirect),
  });
}

function buildTextResponse(response: Response, body: string): Record<string, unknown> {
  return {
    body,
    metadata: {
      statusCode: response.status,
      contentType: response.headers.get("content-type"),
    },
    headers: Object.fromEntries(response.headers.entries()),
  };
}

async function readJsonResponse(response: Response, label: string): Promise<unknown> {
  const body = await readScraperapiText(response);
  if (!body.trim()) {
    throw new ProviderRequestError(502, `${label} returned an empty body`);
  }

  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new ProviderRequestError(502, `${label} returned invalid JSON`);
  }
}

async function readScraperapiText(response: Response): Promise<string> {
  const bytes = await readBoundedResponseBytes(response, {
    maxBytes: scraperapiMaxResponseBytes,
    fieldName: "ScraperAPI response",
    createError: (message) => new ProviderRequestError(413, message),
  });
  return new TextDecoder().decode(bytes);
}

async function readScraperapiErrorText(response: Response): Promise<string> {
  const bytes = await readBoundedResponseBytes(response, {
    maxBytes: scraperapiMaxErrorBytes,
    fieldName: "ScraperAPI error response",
    createError: (message) => new ProviderRequestError(413, message),
  });
  return new TextDecoder().decode(bytes);
}

function createScraperapiError(status: number, body: string, phase: ScraperapiPhase): ProviderRequestError {
  const message = extractScraperapiErrorMessage(body) ?? `ScraperAPI request failed with status ${status}`;

  if (status === 429) {
    return new ProviderRequestError(429, message);
  }
  if (phase === "validate" && status >= 400 && status < 500) {
    return new ProviderRequestError(400, message);
  }
  if (phase === "execute" && status === 401) {
    return new ProviderRequestError(401, message);
  }
  if (phase === "execute" && status === 400) {
    return new ProviderRequestError(400, message);
  }
  return new ProviderRequestError(status || 500, message);
}

function extractScraperapiErrorMessage(body: string): string | undefined {
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
  } catch {}

  if (looksLikeHtml(trimmed)) {
    return "ScraperAPI returned a non-JSON error response";
  }
  if (trimmed.length <= maxNonJsonErrorMessageLength) {
    return trimmed;
  }
  return `${trimmed.slice(0, maxNonJsonErrorMessageLength)}...`;
}

function readSubmitMethod(value: unknown): "POST" | "PUT" {
  if (value === "POST" || value === "PUT") {
    return value;
  }
  throw new ProviderRequestError(400, "method must be POST or PUT");
}

function readRequiredInputString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return value;
}

function readOptionalStringRecord(value: unknown, fieldName: string): Record<string, string> | undefined {
  if (value === undefined) {
    return undefined;
  }
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(400, `${fieldName} must be an object`);
  }
  return Object.fromEntries(Object.entries(record).map(([key, child]) => [key, String(child)]));
}

function looksLikeHtml(value: string): boolean {
  const prefix = value.slice(0, 32).toLowerCase();
  return prefix.startsWith("<!doctype") || prefix.startsWith("<html");
}
