import type { AisaActionRoute } from "./routes.ts";

export const cryptoResearchRoutes: Record<string, AisaActionRoute> = {
  list_crypto_coins: {
    path: "/apis/v1/coingecko/coins/list",
    query: { includePlatform: "include_platform", status: "status" },
  },
  get_crypto_coin_tickers: {
    path: "/apis/v1/coingecko/coins/{coinId}/tickers",
    pathParams: { coinId: "coinId" },
    query: {
      exchangeIds: "exchange_ids",
      depth: "depth",
      dexPairFormat: "dex_pair_format",
      includeExchangeLogo: "include_exchange_logo",
      page: "page",
      order: "order",
    },
    commaSeparated: ["exchangeIds"],
  },
  get_crypto_coin_history: {
    path: "/apis/v1/coingecko/coins/{coinId}/history",
    pathParams: { coinId: "coinId" },
    query: { date: "date", localization: "localization" },
  },
  get_crypto_market_chart_days: {
    path: "/apis/v1/coingecko/coins/{coinId}/market_chart",
    pathParams: { coinId: "coinId" },
    query: { currency: "vs_currency", days: "days", interval: "interval", precision: "precision" },
  },
  get_token_market_chart: {
    path: "/apis/v1/coingecko/coins/{platformId}/contract/{contractAddress}/market_chart/range",
    pathParams: { platformId: "platformId", contractAddress: "contractAddress" },
    query: {
      currency: "vs_currency",
      from: "from",
      to: "to",
      interval: "interval",
      precision: "precision",
    },
  },
  get_token_market_chart_days: {
    path: "/apis/v1/coingecko/coins/{platformId}/contract/{contractAddress}/market_chart",
    pathParams: { platformId: "platformId", contractAddress: "contractAddress" },
    query: { currency: "vs_currency", days: "days", interval: "interval", precision: "precision" },
  },
  get_crypto_exchange: {
    path: "/apis/v1/coingecko/exchanges/{exchangeId}",
    pathParams: { exchangeId: "exchangeId" },
    query: { dexPairFormat: "dex_pair_format" },
  },
  get_crypto_exchange_tickers: {
    path: "/apis/v1/coingecko/exchanges/{exchangeId}/tickers",
    pathParams: { exchangeId: "exchangeId" },
    query: {
      coinIds: "coin_ids",
      depth: "depth",
      dexPairFormat: "dex_pair_format",
      includeExchangeLogo: "include_exchange_logo",
      page: "page",
      order: "order",
    },
    commaSeparated: ["coinIds"],
  },
  get_crypto_exchange_volume_chart: {
    path: "/apis/v1/coingecko/api/{exchangeId}/volume_chart",
    pathParams: { exchangeId: "exchangeId" },
    query: { days: "days" },
  },
  list_crypto_exchange_ids: {
    path: "/apis/v1/coingecko/exchanges/list",
    query: { status: "status" },
  },
  list_crypto_category_ids: {
    path: "/apis/v1/coingecko/coins/categories/list",
    query: {},
  },
  list_crypto_quote_currencies: {
    path: "/apis/v1/coingecko/simple/supported_vs_currencies",
    query: {},
  },
};
