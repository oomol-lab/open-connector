import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "aisa";
const coinId = s.string("The CoinGecko coin ID, such as bitcoin.");
const currency = s.string("A CoinGecko quote-currency code, such as usd.");
const cryptoOutput = s.looseObject("The CoinGecko market data returned by AIsa.");

export const getCryptoPricesAction: ActionDefinition = defineProviderAction(service, {
  name: "get_crypto_prices",
  operationType: "read",
  description: "Get current prices and optional market metrics for multiple coins.",
  requiredScopes: [],
  inputSchema: s.object(
    "Coin IDs, quote currencies, and optional metrics for a CoinGecko price query.",
    {
      coinIds: s.array("The CoinGecko coin IDs to price.", coinId, {
        minItems: 1,
        uniqueItems: true,
      }),
      currencies: s.array("The quote currencies to return.", currency, {
        minItems: 1,
        uniqueItems: true,
      }),
      includeMarketCap: s.boolean("Whether to include market capitalization."),
      include24HourVolume: s.boolean("Whether to include 24-hour volume."),
      include24HourChange: s.boolean("Whether to include 24-hour price change."),
      includeLastUpdatedAt: s.boolean("Whether to include the last update timestamp."),
      precision: s.string("The decimal precision accepted by CoinGecko."),
    },
    {
      optional: ["includeMarketCap", "include24HourVolume", "include24HourChange", "includeLastUpdatedAt", "precision"],
    },
  ),
  outputSchema: cryptoOutput,
});

export const listCryptoMarketsAction: ActionDefinition = defineProviderAction(service, {
  name: "list_crypto_markets",
  operationType: "read",
  description: "List coin markets with price, capitalization, volume, and change metrics.",
  requiredScopes: [],
  inputSchema: s.object(
    "Quote currency, filters, sorting, and pagination for CoinGecko markets.",
    {
      currency,
      coinIds: s.array("The CoinGecko coin IDs to include.", coinId, { uniqueItems: true }),
      category: s.string("The CoinGecko category ID used to filter markets."),
      order: s.string("The CoinGecko market ordering expression."),
      perPage: s.integer("The maximum number of markets per page.", { minimum: 1, maximum: 250 }),
      page: s.integer("The one-based result page.", { minimum: 1 }),
      sparkline: s.boolean("Whether to include seven-day sparkline values."),
      priceChangePercentages: s.array(
        "The price-change windows to include.",
        s.string("A CoinGecko price-change window."),
        { uniqueItems: true },
      ),
    },
    {
      optional: ["coinIds", "category", "order", "perPage", "page", "sparkline", "priceChangePercentages"],
    },
  ),
  outputSchema: s.array("The CoinGecko market rows.", s.looseObject("One coin market row.")),
});

export const getCryptoCoinAction: ActionDefinition = defineProviderAction(service, {
  name: "get_crypto_coin",
  operationType: "read",
  description: "Get metadata, market data, and community signals for one coin.",
  requiredScopes: [],
  inputSchema: s.object(
    "A CoinGecko coin ID and optional response sections.",
    {
      coinId,
      localization: s.boolean("Whether to include localized descriptions."),
      tickers: s.boolean("Whether to include exchange tickers."),
      marketData: s.boolean("Whether to include market data."),
      communityData: s.boolean("Whether to include community data."),
      developerData: s.boolean("Whether to include developer data."),
      sparkline: s.boolean("Whether to include seven-day sparkline values."),
    },
    {
      optional: ["localization", "tickers", "marketData", "communityData", "developerData", "sparkline"],
    },
  ),
  outputSchema: cryptoOutput,
});

export const getCryptoMarketChartAction: ActionDefinition = defineProviderAction(service, {
  name: "get_crypto_market_chart",
  operationType: "read",
  description: "Get price, market-cap, and volume history for a coin over a Unix-time range.",
  requiredScopes: [],
  inputSchema: s.object(
    "A coin, quote currency, and Unix-time range for a market chart.",
    {
      coinId,
      currency,
      fromTimestamp: s.integer("The inclusive range start as a Unix timestamp."),
      toTimestamp: s.integer("The inclusive range end as a Unix timestamp."),
      precision: s.string("The decimal precision accepted by CoinGecko."),
    },
    { optional: ["precision"] },
  ),
  outputSchema: cryptoOutput,
});

export const getCryptoOhlcAction: ActionDefinition = defineProviderAction(service, {
  name: "get_crypto_ohlc",
  operationType: "read",
  description: "Get open, high, low, and close price candles for one coin.",
  requiredScopes: [],
  inputSchema: s.object(
    "A coin, quote currency, and CoinGecko day window for OHLC candles.",
    {
      coinId,
      currency,
      days: s.string("The CoinGecko lookback window in days."),
      precision: s.string("The decimal precision accepted by CoinGecko."),
    },
    { optional: ["precision"] },
  ),
  outputSchema: s.array(
    "The OHLC candles ordered by time.",
    s.array("One OHLC candle.", s.number("A candle timestamp or price value.")),
  ),
});

export const getTokenPricesAction: ActionDefinition = defineProviderAction(service, {
  name: "get_token_prices",
  operationType: "read",
  description: "Get current prices for token contracts on one asset platform.",
  requiredScopes: [],
  inputSchema: s.requiredObject("A platform, token contracts, and quote currencies for token prices.", {
    platformId: s.string("The CoinGecko asset-platform ID, such as ethereum."),
    contractAddresses: s.array("The token contract addresses to price.", s.string("A token contract address."), {
      minItems: 1,
      uniqueItems: true,
    }),
    currencies: s.array("The quote currencies to return.", currency, {
      minItems: 1,
      uniqueItems: true,
    }),
  }),
  outputSchema: cryptoOutput,
});

export const getTokenDataAction: ActionDefinition = defineProviderAction(service, {
  name: "get_token_data",
  operationType: "read",
  description: "Get CoinGecko metadata and market data for a token contract.",
  requiredScopes: [],
  inputSchema: s.requiredObject("An asset platform and token contract address.", {
    platformId: s.string("The CoinGecko asset-platform ID, such as ethereum."),
    contractAddress: s.string("The token contract address."),
  }),
  outputSchema: cryptoOutput,
});

export const listCryptoExchangesAction: ActionDefinition = defineProviderAction(service, {
  name: "list_crypto_exchanges",
  operationType: "read",
  description: "List exchanges ranked by trust score and trading volume.",
  requiredScopes: [],
  inputSchema: s.object(
    "Pagination for listing CoinGecko exchanges.",
    {
      perPage: s.integer("The maximum exchanges per page.", { minimum: 1, maximum: 250 }),
      page: s.integer("The one-based result page.", { minimum: 1 }),
    },
    { optional: ["perPage", "page"] },
  ),
  outputSchema: s.array("The CoinGecko exchanges.", s.looseObject("One exchange summary.")),
});

export const listCryptoCategoriesAction: ActionDefinition = defineProviderAction(service, {
  name: "list_crypto_categories",
  operationType: "read",
  description: "List cryptocurrency categories and their aggregate market performance.",
  requiredScopes: [],
  inputSchema: s.object(
    "Optional sorting for CoinGecko market categories.",
    { order: s.string("The CoinGecko category ordering expression.") },
    { optional: ["order"] },
  ),
  outputSchema: s.array("The CoinGecko market categories.", s.looseObject("One category summary.")),
});

export const getCryptoNewsAction: ActionDefinition = defineProviderAction(service, {
  name: "get_crypto_news",
  operationType: "read",
  description: "Get recent cryptocurrency news with optional coin and language filters.",
  requiredScopes: [],
  inputSchema: s.object(
    "Coin, language, article type, and pagination filters for crypto news.",
    {
      coinId,
      language: s.string("The news language code."),
      articleType: s.string("The CoinGecko news content type."),
      page: s.integer("The one-based result page.", { minimum: 1 }),
      perPage: s.integer("The maximum articles per page.", { minimum: 1 }),
    },
    { optional: ["coinId", "language", "articleType", "page", "perPage"] },
  ),
  outputSchema: cryptoOutput,
});

export const getTrendingCryptoAction: ActionDefinition = defineProviderAction(service, {
  name: "get_trending_crypto",
  operationType: "read",
  description: "Get coins, NFTs, and categories currently trending on CoinGecko.",
  requiredScopes: [],
  inputSchema: s.requiredObject("The empty input for a CoinGecko trending query.", {}),
  outputSchema: cryptoOutput,
});

export const cryptoActions: ActionDefinition[] = [
  getCryptoPricesAction,
  listCryptoMarketsAction,
  getCryptoCoinAction,
  getCryptoMarketChartAction,
  getCryptoOhlcAction,
  getTokenPricesAction,
  getTokenDataAction,
  listCryptoExchangesAction,
  listCryptoCategoriesAction,
  getCryptoNewsAction,
  getTrendingCryptoAction,
];
