import type { CredentialValidationResult } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderFetch } from "../provider-runtime.ts";
import type { SearchApiActionName } from "./actions.ts";

import { compactObject, optionalBoolean, optionalNumber, optionalRecord, optionalString } from "../../core/cast.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

type SearchApiPhase = "validate" | "execute";
type SearchApiQueryValue = string | number | boolean | undefined;
type SearchApiActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

interface SearchApiAccountInfo {
  account: {
    monthly_allowance: number;
    remaining_credits: number;
    current_month_usage: number;
  };
  api_usage: {
    hourly_rate_limit: number;
    searches_this_hour: number;
  };
  subscription?: {
    period_start: string;
    period_end: string;
  };
}

const searchApiOrigin = "https://www.searchapi.io";
const searchApiBasePath = "/api/v1/";
export const searchApiBaseUrl: string = "https://www.searchapi.io/api/v1";

export const searchApiActionHandlers: Record<SearchApiActionName, SearchApiActionHandler> = {
  get_account_info(_input, context) {
    return requestSearchApiAccountInfo(context.apiKey, context.fetcher, context.signal, "execute");
  },
  async search(input, context): Promise<unknown> {
    const payload = await requestSearchApiJson(
      "search",
      buildSearchParams(input),
      context.apiKey,
      context.fetcher,
      context.signal,
      "execute",
    );
    return normalizeSearchResultPayload(payload);
  },
  async get_locations(input, context): Promise<unknown> {
    const payload = readObject(
      await requestSearchApiJson(
        "locations",
        compactObject({
          q: readRequiredString(input.q, "q"),
          limit: optionalNumber(input.limit),
          zero_retention: optionalBoolean(input.zeroRetention),
        }),
        context.apiKey,
        context.fetcher,
        context.signal,
        "execute",
      ),
      "SearchApi locations response",
    );

    return {
      locations: readObjectArray(payload.locations, "locations"),
    };
  },
  async get_cached_search_json(input, context): Promise<unknown> {
    const searchId = readRequiredSearchId(input.searchId);
    const payload = await requestCachedSearchJson(searchId, context.apiKey, context.fetcher, context.signal);
    return normalizeSearchResultPayload(payload);
  },
  async get_cached_search_html(input, context): Promise<unknown> {
    const searchId = readRequiredSearchId(input.searchId);
    const htmlContent = await requestCachedSearchHtml(searchId, context.apiKey, context.fetcher, context.signal);
    return {
      search_id: searchId,
      html_content: htmlContent,
    };
  },
};

export async function validateSearchApiCredential(
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const accountInfo = await requestSearchApiAccountInfo(apiKey, fetcher, signal, "validate");

  return {
    profile: {
      accountId: "search_api",
      displayName: "SearchApi API Key",
    },
    grantedScopes: [],
    metadata: compactObject({
      validationEndpoint: "/me",
      apiBaseUrl: searchApiBaseUrl,
      currentMonthUsage: accountInfo.account.current_month_usage,
      monthlyAllowance: accountInfo.account.monthly_allowance,
      remainingCredits: accountInfo.account.remaining_credits,
      searchesThisHour: accountInfo.api_usage.searches_this_hour,
      hourlyRateLimit: accountInfo.api_usage.hourly_rate_limit,
      subscriptionPeriodStart: accountInfo.subscription?.period_start,
      subscriptionPeriodEnd: accountInfo.subscription?.period_end,
    }),
  };
}

async function requestSearchApiAccountInfo(
  apiKey: string,
  fetcher: ProviderFetch,
  signal: AbortSignal | undefined,
  phase: SearchApiPhase,
): Promise<SearchApiAccountInfo> {
  const payload = await requestSearchApiJson("me", {}, apiKey, fetcher, signal, phase);
  return parseSearchApiAccountInfo(payload);
}

async function requestCachedSearchJson(
  searchId: string,
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<unknown> {
  try {
    return await requestSearchApiJson(`searches/${searchId}`, {}, apiKey, fetcher, signal, "execute");
  } catch (error) {
    if (!shouldFallbackCachedRequest(error)) {
      throw error;
    }

    return requestSearchApiJson(`public_search/${searchId}.json`, {}, undefined, fetcher, signal, "execute");
  }
}

async function requestCachedSearchHtml(
  searchId: string,
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<string> {
  try {
    return await requestSearchApiText(`searches/${searchId}.html`, {}, apiKey, fetcher, signal, "execute");
  } catch (error) {
    if (!shouldFallbackCachedRequest(error)) {
      throw error;
    }

    return requestSearchApiText(`public_search/${searchId}.html`, {}, undefined, fetcher, signal, "execute");
  }
}

async function requestSearchApiJson(
  path: string,
  query: Record<string, SearchApiQueryValue>,
  apiKey: string | undefined,
  fetcher: ProviderFetch,
  signal: AbortSignal | undefined,
  phase: SearchApiPhase,
): Promise<unknown> {
  const response = await fetchSearchApi(path, query, apiKey, fetcher, signal);
  const payload = await readJsonPayload(response);
  if (!response.ok) {
    throw createSearchApiError(response.status, payload, phase);
  }
  return payload;
}

async function requestSearchApiText(
  path: string,
  query: Record<string, SearchApiQueryValue>,
  apiKey: string | undefined,
  fetcher: ProviderFetch,
  signal: AbortSignal | undefined,
  phase: SearchApiPhase,
): Promise<string> {
  const response = await fetchSearchApi(path, query, apiKey, fetcher, signal);
  const body = await response.text();
  if (!response.ok) {
    throw createSearchApiError(response.status, body, phase);
  }
  return body;
}

async function fetchSearchApi(
  path: string,
  query: Record<string, SearchApiQueryValue>,
  apiKey: string | undefined,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<Response> {
  try {
    return await fetcher(buildSearchApiUrl(path, query, apiKey), {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
      },
      signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `SearchApi request failed: ${error.message}` : "SearchApi request failed",
    );
  }
}

function buildSearchApiUrl(
  path: string,
  query: Record<string, SearchApiQueryValue>,
  apiKey: string | undefined,
): string {
  const url = new URL(path, new URL(searchApiBasePath, searchApiOrigin));
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  if (apiKey) {
    url.searchParams.set("api_key", apiKey);
  }
  return url.toString();
}

function buildSearchParams(input: Record<string, unknown>): Record<string, SearchApiQueryValue> {
  if (optionalString(input.location) && optionalString(input.uule)) {
    throw new ProviderRequestError(400, "location and uule cannot be used together");
  }

  return compactObject({
    engine: readRequiredString(input.engine, "engine"),
    q: readRequiredString(input.q, "q"),
    location: optionalString(input.location),
    gl: optionalString(input.gl),
    hl: optionalString(input.hl),
    lr: optionalString(input.lr),
    cr: optionalString(input.cr),
    num: optionalNumber(input.num),
    page: optionalNumber(input.page),
    safe: optionalString(input.safe),
    uule: optionalString(input.uule),
    kgmid: optionalString(input.kgmid),
    device: optionalString(input.device),
    filter: optionalNumber(input.filter),
    nfpr: optionalNumber(input.nfpr),
    google_domain: optionalString(input.googleDomain),
    time_period: optionalString(input.timePeriod),
    time_period_min: optionalString(input.timePeriodMin),
    time_period_max: optionalString(input.timePeriodMax),
    optimization_strategy: optionalString(input.optimizationStrategy),
    zero_retention: optionalBoolean(input.zeroRetention),
  });
}

function normalizeSearchResultPayload(payload: unknown): Record<string, unknown> {
  const record = readObject(payload, "SearchApi search response");
  const { search_metadata, search_parameters, search_information, ...rest } = record;

  return compactObject({
    search_metadata: optionalRecord(search_metadata) ?? {},
    search_parameters: optionalRecord(search_parameters) ?? {},
    search_information: optionalRecord(search_information),
    data: Object.fromEntries(Object.entries(rest)),
  });
}

function parseSearchApiAccountInfo(payload: unknown): SearchApiAccountInfo {
  const record = readObject(payload, "SearchApi account response");
  const account = readObject(record.account ?? {}, "SearchApi account response account");
  const apiUsage = readObject(record.api_usage ?? {}, "SearchApi account response api_usage");
  const subscription = optionalRecord(record.subscription);

  return {
    account: {
      monthly_allowance: readRequiredInteger(account.monthly_allowance, "monthly_allowance"),
      remaining_credits: readRequiredInteger(account.remaining_credits, "remaining_credits"),
      current_month_usage: readRequiredInteger(account.current_month_usage, "current_month_usage"),
    },
    api_usage: {
      hourly_rate_limit: readRequiredInteger(apiUsage.hourly_rate_limit, "hourly_rate_limit"),
      searches_this_hour: readRequiredInteger(apiUsage.searches_this_hour, "searches_this_hour"),
    },
    subscription: subscription
      ? {
          period_start: readRequiredString(subscription.period_start, "period_start"),
          period_end: readRequiredString(subscription.period_end, "period_end"),
        }
      : undefined,
  };
}

async function readJsonPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "SearchApi returned invalid JSON");
  }
}

function createSearchApiError(status: number, payload: unknown, phase: SearchApiPhase): ProviderRequestError {
  const message = extractSearchApiMessage(payload) ?? `SearchApi request failed with ${status || 500}`;
  if (phase === "validate" && (status === 401 || status === 403)) {
    return new ProviderRequestError(400, message);
  }
  return new ProviderRequestError(status || 500, message);
}

function extractSearchApiMessage(payload: unknown): string | undefined {
  if (typeof payload === "string") {
    return payload.trim() || undefined;
  }

  const record = optionalRecord(payload);
  return optionalString(record?.error) ?? optionalString(record?.message);
}

function shouldFallbackCachedRequest(error: unknown): boolean {
  return error instanceof ProviderRequestError && [403, 404].includes(error.status);
}

function readObject(value: unknown, fieldName: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `${fieldName} is invalid`);
  }
  return record;
}

function readObjectArray(value: unknown, fieldName: string): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `SearchApi response missing ${fieldName}`);
  }
  return value.map((item) => readObject(item, `SearchApi ${fieldName} item`));
}

function readRequiredSearchId(value: unknown): string {
  const parsed = readRequiredString(value, "searchId");
  if (!parsed.startsWith("search_")) {
    throw new ProviderRequestError(400, "searchId must start with search_");
  }
  return parsed;
}

function readRequiredString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return value;
}

function readRequiredInteger(value: unknown, fieldName: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new ProviderRequestError(502, `SearchApi response missing ${fieldName}`);
  }
  return value;
}
