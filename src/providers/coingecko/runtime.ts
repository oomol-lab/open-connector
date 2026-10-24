import type { CredentialValidationResult } from "../../core/types.ts";
import type { ApiKeyActionRequest, ProviderActionName, ProviderActionSources } from "../provider-executors.ts";
import type { ProviderFetch } from "../provider-runtime.ts";

import { optionalRecord, optionalString } from "../../core/cast.ts";
import {
  isAbortLikeError,
  providerInputError,
  providerResponseError,
  ProviderRequestError,
  providerUserAgent,
  requiredInputString,
  requiredResponseRecord,
  runProviderRequest,
} from "../provider-runtime.ts";

export function resolveCoingeckoPlan(value: unknown): "demo" | "pro" {
  if (value === "demo" || value === "pro") return value;
  throw providerInputError("CoinGecko plan must be demo or pro");
}

export function coingeckoBaseUrl(plan: "demo" | "pro"): string {
  return plan === "pro" ? "https://pro-api.coingecko.com/api/v3" : "https://api.coingecko.com/api/v3";
}

export function coingeckoAuthHeader(plan: "demo" | "pro"): string {
  return plan === "pro" ? "x-cg-pro-api-key" : "x-cg-demo-api-key";
}

interface CoingeckoRoute {
  path: string;
  wrapper?: string;
}

export const coingeckoRoutes: ProviderActionSources<"coingecko", CoingeckoRoute> = {
  list_asset_platforms: { path: "/asset_platforms", wrapper: "platforms" },
  get_token_prices: { path: "/simple/token_price/{asset_platform_id}", wrapper: "prices" },
  get_coin_by_contract: { path: "/coins/{asset_platform_id}/contract/{contract_address}" },
  list_category_markets: { path: "/coins/categories", wrapper: "categories" },
  list_coin_tickers: { path: "/coins/{id}/tickers" },
  get_coin_ohlc: { path: "/coins/{id}/ohlc", wrapper: "candles" },
  get_coin_history: { path: "/coins/{id}/history" },
  list_onchain_networks: { path: "/onchain/networks" },
  search_onchain_pools: { path: "/onchain/search/pools" },
  get_onchain_token: { path: "/onchain/networks/{network}/tokens/{token_address}" },
  get_onchain_token_info: { path: "/onchain/networks/{network}/tokens/{token_address}/info" },
  list_token_pools: { path: "/onchain/networks/{network}/tokens/{token_address}/pools" },
  get_onchain_pool: { path: "/onchain/networks/{network}/pools/{pool_address}" },
  get_pool_ohlcv: { path: "/onchain/networks/{network}/pools/{pool_address}/ohlcv/{timeframe}" },
  list_pool_trades: { path: "/onchain/networks/{network}/pools/{pool_address}/trades" },
  search: { path: "/search" },
  list_supported_currencies: { path: "/simple/supported_vs_currencies", wrapper: "currencies" },
  list_coins: { path: "/coins/list", wrapper: "coins" },
  get_prices: { path: "/simple/price", wrapper: "prices" },
  list_coin_markets: { path: "/coins/markets", wrapper: "coins" },
  get_coin: { path: "/coins/{id}" },
  get_market_chart: { path: "/coins/{id}/market_chart" },
  get_market_chart_range: { path: "/coins/{id}/market_chart/range" },
  get_trending: { path: "/search/trending" },
  get_global_market_data: { path: "/global" },
};

export async function coingeckoRequest(
  path: string,
  query: Record<string, unknown>,
  apiKey: string,
  plan: "demo" | "pro",
  fetcher: ProviderFetch,
  parentSignal?: AbortSignal,
): Promise<unknown> {
  return runProviderRequest({ label: "CoinGecko", signal: parentSignal }, async (signal) => {
    const url = new URL(`${coingeckoBaseUrl(plan)}${path}`);
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
    const response = await fetcher(url, {
      method: "GET",
      signal,
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
        [coingeckoAuthHeader(plan)]: apiKey,
      },
    });
    const payload: unknown = await response.json().catch((error: unknown) => {
      if (isAbortLikeError(error)) throw error;
      return null;
    });
    const body = optionalRecord(payload);
    const status = optionalRecord(body?.status);
    const error = optionalString(status?.error_message) ?? optionalString(body?.error);
    if (!response.ok || error) {
      const message = error?.split(apiKey).join("[REDACTED]");
      throw new ProviderRequestError(
        response.ok ? 502 : response.status,
        `CoinGecko API error${message ? `: ${message}` : ` (HTTP ${response.status})`}`,
      );
    }
    if (payload === null) throw providerResponseError("CoinGecko returned an invalid JSON response");
    return payload;
  });
}

export async function validateCoingeckoCredential(
  input: Record<string, string>,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const apiKey = requiredInputString(input.apiKey, "apiKey");
  const plan = resolveCoingeckoPlan(input.plan);
  const payload = requiredResponseRecord(
    await coingeckoRequest("/ping", {}, apiKey, plan, fetcher, signal),
    "CoinGecko ping response",
  );
  if (!optionalString(payload.gecko_says)) throw providerResponseError("CoinGecko ping response is missing gecko_says");
  return {
    profile: {
      accountId: `coingecko:${plan}`,
      displayName: `CoinGecko ${plan === "pro" ? "Pro" : "Demo"} API Key`,
    },
    grantedScopes: [],
    metadata: { plan, apiBaseUrl: coingeckoBaseUrl(plan), validationEndpoint: "/ping" },
  };
}

export async function executeCoingeckoAction(
  input: ApiKeyActionRequest,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<unknown> {
  if (!Object.hasOwn(coingeckoRoutes, input.actionName))
    throw providerInputError(`unknown coingecko action: ${input.actionName}`);
  const actionName = input.actionName as ProviderActionName<"coingecko">;
  const route = coingeckoRoutes[actionName];
  const query = { ...input.input };
  const path = route.path
    .split("/")
    .map((segment) => {
      if (!segment.startsWith("{") || !segment.endsWith("}")) return segment;
      const field = segment.slice(1, -1);
      const value = requiredInputString(input.input[field], field);
      if (value === "." || value === "..") {
        throw providerInputError(`CoinGecko ${field} cannot be a dot path segment`);
      }
      delete query[field];
      return encodeURIComponent(value);
    })
    .join("/");
  const payload = await coingeckoRequest(
    path,
    query,
    input.apiKey,
    resolveCoingeckoPlan(input.providerMetadata?.plan),
    fetcher,
    signal,
  );
  if (route.wrapper && route.wrapper !== "prices") {
    if (!Array.isArray(payload)) throw providerResponseError("CoinGecko returned a non-array list response");
    return { [route.wrapper]: payload };
  }
  const object = requiredResponseRecord(payload, "CoinGecko response");
  return route.wrapper ? { [route.wrapper]: object } : object;
}
