import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import {
  objectArray,
  optionalInteger,
  optionalNumber,
  optionalRecord,
  optionalString,
  requiredRecord,
  requiredString,
} from "../../core/cast.ts";
import { queryParams } from "../../core/request.ts";
import { defineApiKeyProviderExecutors, ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

const service = "coinranking";
const coinrankingApiBaseUrl = "https://api.coinranking.com/v2";

type CoinrankingRequestPhase = "validate" | "execute";
type CoinrankingActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const coinrankingActionHandlers: ProviderActionHandlers<"coinranking", CoinrankingActionHandler> = {
  search_suggestions(input, context) {
    return searchSuggestions(input, context);
  },
  list_coins(input, context) {
    return listCoins(input, context);
  },
  get_coin_details(input, context) {
    return getCoinDetails(input, context);
  },
  get_coin_price_history(input, context) {
    return getCoinPriceHistory(input, context);
  },
  get_reference_currencies(_input, context) {
    return getReferenceCurrencies(context);
  },
  get_global_stats(_input, context) {
    return getGlobalStats(context);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, coinrankingActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const context: ApiKeyProviderContext = { apiKey: input.apiKey, fetcher, signal };
    const payload = await coinrankingGet("/stats", {}, context, "validate");
    const data = requiredRecord(payload.data, "data", providerResponseError);
    const stats = requiredRecord(data.stats, "stats", providerResponseError);
    return {
      profile: {
        accountId: "coinranking",
        displayName: "Coinranking API Key",
      },
      grantedScopes: [],
      metadata: {
        validationEndpoint: "/stats",
        apiBaseUrl: coinrankingApiBaseUrl,
        coinsCount: optionalNumber(stats.totalCoins),
        marketsCount: optionalNumber(stats.totalMarkets),
        exchangesCount: optionalNumber(stats.totalExchanges),
        totalMarketCap: optionalString(stats.totalMarketCap),
        total24hVolume: optionalString(stats.total24hVolume),
      },
    };
  },
};

async function searchSuggestions(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await coinrankingGet(
    "/search-suggestions",
    queryParams({
      query: requiredString(input.query, "query", providerInputError),
    }),
    context,
    "execute",
  );
  const data = requiredRecord(payload.data, "data", providerResponseError);
  return {
    results: {
      coins: objectArray(data.coins, "coins", providerResponseError),
      exchanges: objectArray(data.exchanges, "exchanges", providerResponseError),
      markets: objectArray(data.markets, "markets", providerResponseError),
      fiat: objectArray(data.fiat, "fiat", providerResponseError),
    },
  };
}

async function listCoins(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await coinrankingGet(
    "/coins",
    queryParams({
      limit: optionalInteger(input.limit),
      offset: optionalInteger(input.offset),
      search: optionalString(input.search),
      orderBy: optionalString(input.orderBy),
      orderDirection: optionalString(input.orderDirection),
      referenceCurrencyUuid: optionalString(input.referenceCurrencyUuid),
      timePeriod: optionalString(input.timePeriod),
    }),
    context,
    "execute",
  );
  const data = requiredRecord(payload.data, "data", providerResponseError);
  return {
    stats: requiredRecord(data.stats, "stats", providerResponseError),
    coins: objectArray(data.coins, "coins", providerResponseError),
  };
}

async function getCoinDetails(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const uuid = requiredString(input.uuid, "uuid", providerInputError);
  const payload = await coinrankingGet(
    `/coin/${encodeURIComponent(uuid)}`,
    queryParams({
      referenceCurrencyUuid: optionalString(input.referenceCurrencyUuid),
      timePeriod: optionalString(input.timePeriod),
    }),
    context,
    "execute",
  );
  const data = requiredRecord(payload.data, "data", providerResponseError);
  return {
    coin: requiredRecord(data.coin, "coin", providerResponseError),
  };
}

async function getCoinPriceHistory(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const uuid = requiredString(input.uuid, "uuid", providerInputError);
  const payload = await coinrankingGet(
    `/coin/${encodeURIComponent(uuid)}/price-history`,
    queryParams({
      referenceCurrencyUuid: optionalString(input.referenceCurrencyUuid),
      timePeriod: optionalString(input.timePeriod),
    }),
    context,
    "execute",
  );
  const data = requiredRecord(payload.data, "data", providerResponseError);
  return {
    change: optionalString(data.change),
    history: objectArray(data.history, "history", providerResponseError),
  };
}

async function getReferenceCurrencies(context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await coinrankingGet("/reference-currencies", {}, context, "execute");
  const data = requiredRecord(payload.data, "data", providerResponseError);
  return {
    currencies: objectArray(data.currencies, "currencies", providerResponseError),
  };
}

async function getGlobalStats(context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await coinrankingGet("/stats", {}, context, "execute");
  const data = requiredRecord(payload.data, "data", providerResponseError);
  return {
    stats: requiredRecord(data.stats, "stats", providerResponseError),
  };
}

async function coinrankingGet(
  path: string,
  query: Record<string, string>,
  context: ApiKeyProviderContext,
  phase: CoinrankingRequestPhase,
): Promise<Record<string, unknown>> {
  const response = await coinrankingFetch(path, query, context);
  const payload = await readCoinrankingPayload(response);
  const status = optionalString(optionalRecord(payload)?.status);
  if (!response.ok || status !== "success") {
    throw buildCoinrankingError(response.status, payload, phase);
  }
  return requiredRecord(payload, "payload", providerResponseError);
}

async function coinrankingFetch(
  path: string,
  query: Record<string, string>,
  context: ApiKeyProviderContext,
): Promise<Response> {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(normalizedPath, `${coinrankingApiBaseUrl}/`);
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, value);
  }
  try {
    return await context.fetcher(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
        "x-access-token": context.apiKey,
      },
      signal: context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Coinranking request failed: ${error.message}` : "Coinranking request failed",
    );
  }
}

async function readCoinrankingPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    throw new ProviderRequestError(502, "Coinranking returned an empty response");
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Coinranking returned invalid JSON");
  }
}

function buildCoinrankingError(
  httpStatus: number,
  payload: unknown,
  phase: CoinrankingRequestPhase,
): ProviderRequestError {
  const message =
    optionalString(optionalRecord(payload)?.message) ?? `Coinranking request failed with ${httpStatus || 500}`;
  if (httpStatus === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (httpStatus === 401) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message, payload);
  }
  if (httpStatus === 400 || httpStatus === 404) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(httpStatus >= 400 ? httpStatus : 502, message, payload);
}

function providerInputError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}

function providerResponseError(message: string): ProviderRequestError {
  return new ProviderRequestError(502, message);
}
