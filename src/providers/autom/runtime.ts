import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-executors.ts";
import type { ApiKeyProviderContext } from "../provider-executors.ts";
import type { ProviderFetch } from "../provider-runtime.ts";

import { createHash } from "node:crypto";
import { optionalInteger, optionalNumber, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { queryParams } from "../../core/request.ts";
import { providerUserAgent, ProviderRequestError, requiredInputString } from "../provider-runtime.ts";

export const automApiBaseUrl = "https://api.autom.dev";
export const automUsagePath = "/v1/usage";

type AutomRequestPhase = "validate" | "execute";
type AutomActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

interface AutomRequestOptions {
  path: string;
  apiKey: string;
  fetcher: ProviderFetch;
  phase: AutomRequestPhase;
  query?: Record<string, string | number | boolean | null | undefined>;
  signal?: AbortSignal;
}

export const automActionHandlers: ProviderActionHandlers<"autom", AutomActionHandler> = {
  async get_usage(_input, context): Promise<unknown> {
    const payload = await requestAutomJson({
      path: automUsagePath,
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      phase: "execute",
      signal: context.signal,
    });
    return requireAutomObject(payload, "get_usage");
  },

  async find_google_countries(input, context): Promise<unknown> {
    const payload = await requestAutomJson({
      path: "/v1/finder/google-countries",
      apiKey: context.apiKey,
      query: { query: readQuery(input) },
      fetcher: context.fetcher,
      phase: "execute",
      signal: context.signal,
    });
    return { countries: requireAutomArray(payload, "find_google_countries") };
  },

  async find_google_languages(input, context): Promise<unknown> {
    const payload = await requestAutomJson({
      path: "/v1/finder/google-languages",
      apiKey: context.apiKey,
      query: { query: readQuery(input) },
      fetcher: context.fetcher,
      phase: "execute",
      signal: context.signal,
    });
    return { languages: requireAutomArray(payload, "find_google_languages") };
  },

  async find_google_locations(input, context): Promise<unknown> {
    const payload = await requestAutomJson({
      path: "/v1/finder/google-locations",
      apiKey: context.apiKey,
      query: { query: readQuery(input) },
      fetcher: context.fetcher,
      phase: "execute",
      signal: context.signal,
    });
    return { locations: requireAutomArray(payload, "find_google_locations") };
  },
  async google_search(input, context): Promise<unknown> {
    const payload = await requestAutomJson({
      path: "/v1/google/search",
      apiKey: context.apiKey,
      query: {
        query: requiredInputString(input.query, "query"),
        gl: optionalString(input.country),
        hl: optionalString(input.language),
        location: optionalString(input.location),
        page: optionalInteger(input.page),
        num: optionalInteger(input.numResults),
      },
      fetcher: context.fetcher,
      phase: "execute",
      signal: context.signal,
    });
    return requireAutomObject(payload, "google_search");
  },
  async google_search_light(input, context): Promise<unknown> {
    const payload = await requestAutomJson({
      path: "/v1/google/search/light",
      apiKey: context.apiKey,
      query: {
        query: requiredInputString(input.query, "query"),
        gl: optionalString(input.country),
        hl: optionalString(input.language),
      },
      fetcher: context.fetcher,
      phase: "execute",
      signal: context.signal,
    });
    return requireAutomObject(payload, "google_search_light");
  },
  async google_news(input, context): Promise<unknown> {
    const payload = await requestAutomJson({
      path: "/v1/google/news",
      apiKey: context.apiKey,
      query: {
        query: requiredInputString(input.query, "query"),
        gl: optionalString(input.country),
        hl: optionalString(input.language),
        page: optionalInteger(input.page),
        num: optionalInteger(input.numResults),
      },
      fetcher: context.fetcher,
      phase: "execute",
      signal: context.signal,
    });
    return requireAutomObject(payload, "google_news");
  },
  async google_maps(input, context): Promise<unknown> {
    const payload = await requestAutomJson({
      path: "/v1/google/maps",
      apiKey: context.apiKey,
      query: {
        query: requiredInputString(input.query, "query"),
        gl: optionalString(input.country),
        hl: optionalString(input.language),
        page: optionalInteger(input.page),
      },
      fetcher: context.fetcher,
      phase: "execute",
      signal: context.signal,
    });
    return { places: requireAutomArray(payload, "google_maps") };
  },
  async google_autocomplete(input, context): Promise<unknown> {
    const payload = await requestAutomJson({
      path: "/v1/google/search/autocomplete",
      apiKey: context.apiKey,
      query: {
        query: requiredInputString(input.query, "query"),
        gl: optionalString(input.country),
        hl: optionalString(input.language),
      },
      fetcher: context.fetcher,
      phase: "execute",
      signal: context.signal,
    });
    return requireAutomObject(payload, "google_autocomplete");
  },
  async bing_search(input, context): Promise<unknown> {
    const payload = await requestAutomJson({
      path: "/v1/bing/search",
      apiKey: context.apiKey,
      query: {
        query: requiredInputString(input.query, "query"),
        mkt: optionalString(input.market),
        page: optionalInteger(input.page),
        num: optionalInteger(input.numResults),
      },
      fetcher: context.fetcher,
      phase: "execute",
      signal: context.signal,
    });
    return requireAutomObject(payload, "bing_search");
  },
  async duckduckgo_search(input, context): Promise<unknown> {
    const payload = await requestAutomJson({
      path: "/v1/duckduckgo/search",
      apiKey: context.apiKey,
      query: {
        query: requiredInputString(input.query, "query"),
        gl: optionalString(input.country),
        hl: optionalString(input.language),
        page: optionalInteger(input.page),
      },
      fetcher: context.fetcher,
      phase: "execute",
      signal: context.signal,
    });
    return requireAutomObject(payload, "duckduckgo_search");
  },
  async yahoo_search(input, context): Promise<unknown> {
    const payload = await requestAutomJson({
      path: "/v1/yahoo/search",
      apiKey: context.apiKey,
      query: {
        query: requiredInputString(input.query, "query"),
        gl: optionalString(input.country),
        hl: optionalString(input.language),
        page: optionalInteger(input.page),
      },
      fetcher: context.fetcher,
      phase: "execute",
      signal: context.signal,
    });
    return requireAutomObject(payload, "yahoo_search");
  },
  async brave_search(input, context): Promise<unknown> {
    const payload = await requestAutomJson({
      path: "/v1/brave/search",
      apiKey: context.apiKey,
      query: {
        query: requiredInputString(input.query, "query"),
        gl: optionalString(input.country),
        hl: optionalString(input.language),
        page: optionalInteger(input.page),
      },
      fetcher: context.fetcher,
      phase: "execute",
      signal: context.signal,
    });
    return requireAutomObject(payload, "brave_search");
  },
};

export async function validateAutomCredential(
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await requestAutomJson({
    path: automUsagePath,
    apiKey,
    fetcher,
    phase: "validate",
    signal,
  });

  const usage = optionalRecord(payload);
  const account = optionalRecord(usage?.account);
  const apiKeyMetadata = optionalRecord(usage?.api_key);
  const accountSlug = optionalString(account?.slug);
  const accountName = optionalString(account?.name);
  const apiKeyAlias = optionalString(apiKeyMetadata?.alias);
  const apiKeyCategory = optionalString(apiKeyMetadata?.category);

  return {
    profile: {
      accountId: accountSlug ? `autom:account:${accountSlug}` : `autom:key:${hashAutomApiKey(apiKey)}`,
      displayName: accountName ?? apiKeyAlias ?? "Autom API Key",
    },
    metadata: {
      apiBaseUrl: automApiBaseUrl,
      validationEndpoint: automUsagePath,
      accountSlug,
      accountName,
      apiKeyAlias,
      apiKeyCategory,
      remaining: optionalNumber(usage?.remaining),
      totalUsed: optionalNumber(usage?.total_used),
      renewalDate: optionalString(usage?.renewal_date),
    },
  };
}

export async function requestAutomJson(input: AutomRequestOptions): Promise<unknown> {
  const url = buildAutomUrl(input.path, input.query ?? {});
  let response: Response;
  let payload: unknown;
  try {
    response = await input.fetcher(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
        "x-api-key": input.apiKey,
      },
      signal: input.signal,
    });
    payload = await readAutomPayload(response);
  } catch (error) {
    throw new ProviderRequestError(502, error instanceof Error ? error.message : "Autom request failed");
  }

  if (!response.ok) {
    throw mapAutomError(response.status, extractAutomErrorMessage(payload), input.phase);
  }

  return payload;
}

function buildAutomUrl(path: string, query: Record<string, string | number | boolean | null | undefined>): string {
  const url = new URL(path, automApiBaseUrl);
  for (const [key, value] of Object.entries(queryParams(query))) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

async function readAutomPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function readQuery(input: Record<string, unknown>): string {
  return requiredString(input.query, "query", (message) => new ProviderRequestError(400, message));
}

function requireAutomArray(payload: unknown, actionName: string): unknown[] {
  if (!Array.isArray(payload)) {
    throw new ProviderRequestError(502, `invalid Autom ${actionName} response: expected array`);
  }
  return payload;
}

function requireAutomObject(payload: unknown, actionName: string): Record<string, unknown> {
  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, `invalid Autom ${actionName} response`);
  }
  return record;
}

function extractAutomErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim() !== "") {
    return payload;
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  return optionalString(record.error) ?? optionalString(record.message);
}

function mapAutomError(status: number, message: string | undefined, phase: AutomRequestPhase): ProviderRequestError {
  const fallback =
    status === 401 || status === 403
      ? phase === "validate"
        ? "Autom API key is invalid."
        : "Autom API key was rejected."
      : status === 429
        ? "Autom rate limit exceeded."
        : `Autom request failed with HTTP ${status}`;
  // Autom answers an exceeded rate limit with 401, which would otherwise read as a rejected key.
  if (status === 401 && message && /rate limit/i.test(message)) {
    return new ProviderRequestError(429, message);
  }
  return new ProviderRequestError(status, message ?? fallback);
}

function hashAutomApiKey(apiKey: string): string {
  return createHash("sha256").update(apiKey).digest("hex").slice(0, 16);
}
