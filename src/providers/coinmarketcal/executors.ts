import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { optionalBoolean, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import { queryParams } from "../../core/request.ts";
import {
  createProviderTimeout,
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  isAbortLikeError,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

const service = "coinmarketcal";
const coinmarketcalApiBaseUrl = "https://developers.coinmarketcal.com/v1";
const requestTimeoutMs = 30_000;

type CoinmarketcalActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

const rankingToSortBy: Record<string, string> = {
  trending: "trending_events",
  popular: "popular_events",
  influential: "influential_events",
  catalyst: "catalyst_events",
};

export const coinmarketcalActionHandlers: Record<string, CoinmarketcalActionHandler> = {
  async list_event_categories(_input, context) {
    const payload = await requestCoinmarketcalJson("/categories", {}, context, "execute");
    const normalized = normalizeCoinmarketcalListPayload(payload);
    return {
      status: normalized.status,
      categories: normalized.items,
    };
  },
  async list_coins(_input, context) {
    const payload = await requestCoinmarketcalJson("/coins", {}, context, "execute");
    const normalized = normalizeCoinmarketcalListPayload(payload);
    return {
      status: normalized.status,
      coins: normalized.items,
    };
  },
  list_events(input, context) {
    return executeEventsRequest(input, context);
  },
  list_ranked_events(input, context) {
    return executeEventsRequest(input, context, {
      sortBy: rankingToSortBy[optionalString(input.ranking) ?? ""],
    });
  },
  list_confirmed_events(input, context) {
    return executeEventsRequest(input, context, {
      showOnly: "confirmed_by_representatives",
    });
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, coinmarketcalActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const context: ApiKeyProviderContext = { apiKey: input.apiKey, fetcher, signal };
    const payload = await requestCoinmarketcalJson("/categories", {}, context, "validate");
    const normalized = normalizeCoinmarketcalListPayload(payload);
    return {
      profile: {
        displayName: "CoinMarketCal API Key",
      },
      grantedScopes: [],
      metadata: {
        validationEndpoint: "/categories",
        apiBaseUrl: coinmarketcalApiBaseUrl,
        categoryCount: normalized.items.length,
      },
    };
  },
};

async function executeEventsRequest(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
  overrides: { sortBy?: string; showOnly?: string } = {},
): Promise<unknown> {
  const payload = await requestCoinmarketcalJson("/events", buildEventsQuery(input, overrides), context, "execute");
  const normalized = normalizeCoinmarketcalListPayload(payload);
  return {
    status: normalized.status,
    events: normalized.items,
  };
}

async function requestCoinmarketcalJson(
  path: string,
  query: Record<string, string>,
  context: ApiKeyProviderContext,
  mode: "validate" | "execute",
): Promise<unknown> {
  const timeout = createProviderTimeout(context.signal, requestTimeoutMs);
  try {
    const response = await context.fetcher(buildCoinmarketcalUrl(path, query), {
      method: "GET",
      headers: coinmarketcalHeaders(context.apiKey),
      signal: timeout.signal,
    });
    const payload = await readCoinmarketcalPayload(response);
    if (!response.ok) {
      throw buildCoinmarketcalError(response.status, payload, mode);
    }
    if (payload === undefined || typeof payload === "string") {
      throw new ProviderRequestError(502, "coinmarketcal returned invalid JSON");
    }
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "coinmarketcal request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `coinmarketcal request failed: ${error.message}` : "coinmarketcal request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

function buildCoinmarketcalUrl(path: string, query: Record<string, string>): string {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(normalizedPath, `${coinmarketcalApiBaseUrl}/`);
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

function buildEventsQuery(
  input: Record<string, unknown>,
  overrides: { sortBy?: string; showOnly?: string },
): Record<string, string> {
  return queryParams({
    page: optionalInteger(input.page),
    max: optionalInteger(input.max),
    coins: optionalString(input.coins),
    categories: optionalString(input.categories),
    dateRangeStart: optionalString(input.dateRangeStart),
    dateRangeEnd: optionalString(input.dateRangeEnd),
    sortBy: overrides.sortBy ?? optionalString(input.sortBy),
    showOnly: overrides.showOnly ?? optionalString(input.showOnly),
    showViews: optionalBoolean(input.showViews),
    showVotes: optionalBoolean(input.showVotes),
    translations: optionalString(input.translations),
  });
}

function coinmarketcalHeaders(apiKey: string): Record<string, string> {
  return {
    accept: "application/json",
    "user-agent": providerUserAgent,
    "x-api-key": apiKey,
  };
}

function normalizeCoinmarketcalListPayload(payload: unknown): {
  status: Record<string, unknown>;
  items: unknown[];
} {
  const root = optionalRecord(payload) ?? {};
  const envelope = asEnvelope(root);
  return {
    status: optionalRecord(envelope.status) ?? {},
    items: Array.isArray(envelope.body) ? envelope.body : Array.isArray(envelope.data) ? envelope.data : [],
  };
}

function asEnvelope(root: Record<string, unknown>): Record<string, unknown> {
  const nestedData = optionalRecord(root.data);
  if (nestedData && ("status" in nestedData || "body" in nestedData || "data" in nestedData)) {
    return nestedData;
  }
  return root;
}

async function readCoinmarketcalPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.trim() === "") {
    return undefined;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function buildCoinmarketcalError(status: number, payload: unknown, mode: "validate" | "execute"): ProviderRequestError {
  const message = readCoinmarketcalErrorMessage(payload) ?? `coinmarketcal request failed with ${status}`;
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if ((status === 401 || status === 403) && mode === "validate") {
    return new ProviderRequestError(400, message, payload);
  }
  if (status === 401 || status === 403) {
    return new ProviderRequestError(status, message, payload);
  }
  if (status === 400) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(status || 500, message, payload);
}

function readCoinmarketcalErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }
  const record = optionalRecord(payload);
  return optionalString(record?.error) ?? optionalString(record?.message) ?? optionalString(record?.error_message);
}

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://developers.coinmarketcal.com/v1",
  auth: { type: "api_key_header", name: "x-api-key" },
});
