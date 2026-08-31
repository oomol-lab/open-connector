import type { CredentialValidationResult, CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { booleanString, compactObject, optionalRecord, requiredString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, ProviderRequestError } from "../provider-runtime.ts";

const service = "scrapingbee";
const scrapingbeeApiOrigin = "https://app.scrapingbee.com";
const scrapingbeeApiBasePath = "/api/v1/";
const scrapingbeeApiBaseUrl = "https://app.scrapingbee.com/api/v1";
const scrapingbeeUsagePath = "usage";

type ScrapingbeeRequestPhase = "validate" | "execute";
type ScrapingbeeActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

interface ScrapingbeeUsage {
  max_api_credit: number;
  used_api_credit: number;
  max_concurrency: number;
  current_concurrency: number;
  renewal_subscription_date: string;
}

export const scrapingbeeActionHandlers: ProviderActionHandlers<"scrapingbee", ScrapingbeeActionHandler> = {
  async fetch_html(input, context) {
    const response = await context.fetcher(scrapingbeeRequestUrl("", context.apiKey, buildFetchParams(input)), {
      method: "GET",
      signal: context.signal,
    });
    const body = await response.text();
    if (!response.ok) {
      throw createScrapingbeeError(response.status, body, "execute");
    }
    return compactObject({
      html: body,
      statusCode: response.status,
      contentType: response.headers.get("content-type") ?? undefined,
      initialStatusCode: readOptionalHeaderInteger(response.headers, "spb-initial-status-code"),
      resolvedUrl: response.headers.get("spb-resolved-url") ?? undefined,
      creditCost: readOptionalHeaderNumber(response.headers, "spb-cost"),
    });
  },
  async extract_data(input, context) {
    const response = await context.fetcher(scrapingbeeRequestUrl("", context.apiKey, buildExtractParams(input)), {
      method: "GET",
      signal: context.signal,
    });
    const body = await response.text();
    if (!response.ok) {
      throw createScrapingbeeError(response.status, body, "execute");
    }
    const payload = parseScrapingbeeJson(body, "scrapingbee extract_data response is not valid JSON");
    const record = optionalRecord(payload);
    if (!record) {
      throw new ProviderRequestError(502, "scrapingbee extract_data response must be a JSON object");
    }
    return compactObject({
      data: { ...record },
      statusCode: response.status,
      resolvedUrl: response.headers.get("spb-resolved-url") ?? undefined,
      creditCost: readOptionalHeaderNumber(response.headers, "spb-cost"),
    });
  },
  async get_usage_stats(_input, context) {
    return {
      usage: await requestScrapingbeeUsage(context.apiKey, context.fetcher, context.signal, "execute"),
    };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, scrapingbeeActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    const apiKey = requiredString(input.apiKey, "apiKey", (message) => new ProviderRequestError(401, message));
    const usage = await requestScrapingbeeUsage(apiKey, fetcher, signal, "validate");
    return {
      profile: {
        accountId: "scrapingbee",
        displayName: "ScrapingBee API Key",
      },
      grantedScopes: [],
      metadata: {
        validationEndpoint: "/usage",
        apiBaseUrl: scrapingbeeApiBaseUrl,
        maxApiCredit: usage.max_api_credit,
        usedApiCredit: usage.used_api_credit,
        maxConcurrency: usage.max_concurrency,
        currentConcurrency: usage.current_concurrency,
        renewalSubscriptionDate: usage.renewal_subscription_date,
      },
    };
  },
};

function scrapingbeeRequestUrl(path: string, apiKey: string, params: Record<string, string | undefined>): URL {
  const url = new URL(path, new URL(scrapingbeeApiBasePath, scrapingbeeApiOrigin));
  url.searchParams.set("api_key", apiKey);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }
  return url;
}

async function requestScrapingbeeUsage(
  apiKey: string,
  fetcher: typeof fetch,
  signal: AbortSignal | undefined,
  phase: ScrapingbeeRequestPhase,
): Promise<ScrapingbeeUsage> {
  const response = await fetcher(scrapingbeeRequestUrl(scrapingbeeUsagePath, apiKey, {}), {
    method: "GET",
    signal,
  });
  const body = await response.text();
  if (!response.ok) {
    throw createScrapingbeeError(response.status, body, phase);
  }
  const payload = parseScrapingbeeJson(body, "scrapingbee usage response is not valid JSON");
  return parseScrapingbeeUsage(payload);
}

function buildFetchParams(input: Record<string, unknown>): Record<string, string | undefined> {
  return compactObject({
    url: readRequiredUrl(input.url),
    render_js: booleanString(input.renderJs),
    wait: readOptionalInteger(input.waitMs),
    wait_for: readOptionalString(input.waitFor),
    device: readOptionalString(input.device),
    block_ads: booleanString(input.blockAds),
    block_resources: booleanString(input.blockResources),
    country_code: readOptionalString(input.countryCode),
    premium_proxy: booleanString(input.premiumProxy),
    stealth_proxy: booleanString(input.stealthProxy),
    transparent_status_code: booleanString(input.transparentStatusCode),
    retry: readOptionalInteger(input.retry),
  });
}

function buildExtractParams(input: Record<string, unknown>): Record<string, string | undefined> {
  return compactObject({
    ...buildFetchParams(input),
    extract_rules: JSON.stringify(readRequiredObject(input.extractRules, "extractRules")),
  });
}

function parseScrapingbeeUsage(payload: unknown): ScrapingbeeUsage {
  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, "scrapingbee usage response must be an object");
  }
  return {
    max_api_credit: readRequiredInteger(record.max_api_credit, "max_api_credit"),
    used_api_credit: readRequiredInteger(record.used_api_credit, "used_api_credit"),
    max_concurrency: readRequiredInteger(record.max_concurrency, "max_concurrency"),
    current_concurrency: readRequiredInteger(record.current_concurrency, "current_concurrency"),
    renewal_subscription_date: readRequiredString(record.renewal_subscription_date, "renewal_subscription_date"),
  };
}

function createScrapingbeeError(status: number, body: string, phase: ScrapingbeeRequestPhase): ProviderRequestError {
  const message = extractErrorMessage(body) ?? `ScrapingBee request failed with status ${status}`;
  if (phase === "validate" && [400, 401, 403].includes(status)) {
    return new ProviderRequestError(400, message);
  }
  return new ProviderRequestError(status || 500, message);
}

function extractErrorMessage(body: string): string | undefined {
  const trimmed = body.trim();
  if (!trimmed) {
    return undefined;
  }
  try {
    const parsed = optionalRecord(JSON.parse(trimmed) as unknown);
    const message = typeof parsed?.message === "string" ? parsed.message.trim() : "";
    if (message) {
      return message;
    }
    const error = typeof parsed?.error === "string" ? parsed.error.trim() : "";
    if (error) {
      return error;
    }
  } catch {}
  return trimmed;
}

function parseScrapingbeeJson(body: string, invalidMessage: string): unknown {
  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new ProviderRequestError(502, invalidMessage);
  }
}

function readRequiredUrl(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new ProviderRequestError(400, "url is required");
  }
  return value;
}

function readRequiredObject(value: unknown, fieldName: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(400, `${fieldName} must be an object`);
  }
  return { ...record };
}

function readRequiredString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new ProviderRequestError(502, `scrapingbee response missing ${fieldName}`);
  }
  return value;
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readOptionalInteger(value: unknown): string | undefined {
  return typeof value === "number" && Number.isInteger(value) ? String(value) : undefined;
}

function readRequiredInteger(value: unknown, fieldName: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new ProviderRequestError(502, `scrapingbee response missing ${fieldName}`);
  }
  return value;
}

function readOptionalHeaderNumber(headers: Headers, name: string): number | undefined {
  const value = headers.get(name);
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function readOptionalHeaderInteger(headers: Headers, name: string): number | undefined {
  const value = headers.get(name);
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim();
  if (!isStrictIntegerString(trimmed)) {
    return undefined;
  }
  const parsed = Number(trimmed);
  return Number.isInteger(parsed) ? parsed : undefined;
}

function isStrictIntegerString(value: string): boolean {
  if (value.length === 0) {
    return false;
  }
  const start = value[0] === "-" ? 1 : 0;
  if (start === value.length) {
    return false;
  }
  for (let index = start; index < value.length; index += 1) {
    const char = value[index];
    if (!char || char < "0" || char > "9") {
      return false;
    }
  }
  return true;
}
