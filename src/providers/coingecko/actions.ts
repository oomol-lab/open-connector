import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { coingeckoMarketActions } from "./market-actions.ts";
import { coingeckoOnchainActions } from "./onchain-actions.ts";

const service = "coingecko";
const coinSummary = s.object(
  "Coin identifier and display metadata.",
  {
    id: s.string("CoinGecko coin ID."),
    symbol: s.string("Coin ticker symbol."),
    name: s.string("Coin name."),
    platforms: s.record(
      "Asset platform IDs mapped to contract addresses.",
      s.nullable(s.string("Token contract address.")),
    ),
  },
  { additionalProperties: true, optional: ["platforms"] },
);
const searchOutput = s.object(
  "CoinGecko search results.",
  {
    coins: s.array("Matching coins.", s.looseObject("Coin search result.", {})),
    exchanges: s.array("Matching exchanges.", s.looseObject("Exchange search result.", {})),
    icos: s.array("Legacy ICO search results.", s.unknown("ICO result.")),
    categories: s.array("Matching categories.", s.looseObject("Category search result.", {})),
    nfts: s.array("Matching NFTs.", s.looseObject("NFT search result.", {})),
  },
  { additionalProperties: true, optional: ["icos"] },
);
const currenciesOutput = s.object("Supported quote currencies.", {
  currencies: s.array("Currency IDs accepted by price endpoints.", s.string("Quote currency ID.")),
});
const coinsOutput = s.object("CoinGecko coin directory.", {
  coins: s.array("Supported coins.", coinSummary),
});
const priceQuote = s.looseObject(
  "Quote currency prices and optional market metrics. Keys are currency IDs, metric suffixes and optional last_updated_at; values may be null when unavailable.",
  {},
);
const pricesOutput = s.object("Prices keyed by the selected coin ID, name or symbol.", {
  prices: s.record(
    "Coin selectors mapped to quotes; include_tokens=all may return an array of token quotes for each symbol.",
    s.union([priceQuote, s.array("Matching token quotes.", priceQuote)], {
      description: "One coin quote or multiple token quotes.",
    }),
  ),
});
const marketsOutput = s.object("A page of coin market data.", {
  coins: s.array(
    "Coin markets in the requested order.",
    s.object(
      "Coin market record with optional upstream metrics.",
      {
        id: s.string("CoinGecko coin ID."),
        symbol: s.string("Coin ticker symbol."),
        name: s.string("Coin name."),
        current_price: s.nullable(s.number("Current price in the requested quote currency.")),
        market_cap: s.nullable(s.number("Market capitalization in the quote currency.")),
        market_cap_rank: s.nullable(s.integer("Market capitalization rank.")),
        total_volume: s.nullable(s.number("Trading volume in the quote currency.")),
      },
      {
        additionalProperties: true,
        optional: ["current_price", "market_cap", "market_cap_rank", "total_volume"],
      },
    ),
  ),
});
const coinOutput = s.object(
  "Coin metadata and the requested optional data sections.",
  {
    id: s.string("CoinGecko coin ID."),
    symbol: s.string("Coin ticker symbol."),
    name: s.string("Coin name."),
    market_data: s.looseObject("Market prices, capitalization, volume and other metrics.", {}),
    tickers: s.array("Coin trading pairs.", s.looseObject("Ticker data.", {})),
    description: s.record(
      "Localized coin descriptions by language.",
      s.string("Localized description, potentially containing HTML."),
    ),
  },
  { additionalProperties: true, optional: ["market_data", "tickers", "description"] },
);
const chartPoint = s.array(
  "Timestamp in UNIX milliseconds followed by the metric value.",
  s.nullable(s.number("Timestamp or metric value.")),
  { minItems: 2, maxItems: 2 },
);
const chartOutput = s.looseObject("Historical series with timestamps in UNIX milliseconds.", {
  prices: s.array("Historical prices in the quote currency.", chartPoint),
  market_caps: s.array("Historical market capitalizations in the quote currency.", chartPoint),
  total_volumes: s.array("Historical 24-hour trading volumes in the quote currency.", chartPoint),
});
const trendingOutput = s.looseObject("Trending search results.", {
  coins: s.array(
    "Trending coins, each wrapped in an item field.",
    s.looseObject("Trending coin entry.", { item: s.looseObject("Trending coin data.", {}) }),
  ),
  nfts: s.array("Trending NFT collections.", s.looseObject("Trending NFT data.", {})),
  categories: s.array("Trending categories.", s.looseObject("Trending category data.", {})),
});
const globalOutput = s.looseObject("Global cryptocurrency market data response.", {
  data: s.looseObject("Global market metrics.", {
    active_cryptocurrencies: s.integer("Number of active cryptocurrencies."),
    markets: s.integer("Number of active markets."),
    total_market_cap: s.record("Market capitalization by quote currency.", s.number("Market capitalization.")),
    total_volume: s.record("Trading volume by quote currency.", s.number("Trading volume.")),
    market_cap_percentage: s.record(
      "Market share percentage by cryptocurrency symbol.",
      s.number("Market share percentage."),
    ),
    updated_at: s.integer("Last update time as a UNIX timestamp in seconds."),
  }),
});

const searchInput = s.object(
  "Input parameters for search.",
  {
    query: s.nonEmptyString("Search query"),
  },
  { required: ["query"] },
);

const listSupportedCurrenciesInput = s.object("Input parameters for list_supported_currencies.", {}, { required: [] });

const listCoinsInput = s.object(
  "Input parameters for list_coins.",
  {
    include_platform: s.boolean("Include platform and token's contract addresses. \nDefault: false"),
    status: s.stringEnum("Filter by status of coins. \nDefault: active", ["active", "inactive"]),
  },
  { required: [] },
);

const getPricesInput = s.object(
  "Input parameters for get_prices.",
  {
    vs_currencies: s.nonEmptyString(
      "Target currency of coins, comma-separated if querying more than 1 currency. \n*refers to [`/simple/supported_vs_currencies`](/reference/simple-supported-currencies)",
    ),
    ids: s.nonEmptyString(
      "Coins' IDs, comma-separated if querying more than 1 coin. \n*refers to [`/coins/list`](/reference/coins-list)",
    ),
    names: s.nonEmptyString("Coins' names, comma-separated if querying more than 1 coin."),
    symbols: s.nonEmptyString("Coins' symbols, comma-separated if querying more than 1 coin."),
    include_tokens: s.stringEnum(
      "For `symbols` lookups, specify `all` to include all matching tokens. \nDefault `top` returns top-ranked tokens by market cap or volume.",
      ["top", "all"],
    ),
    include_market_cap: s.boolean("Include market capitalization. \nDefault: false"),
    include_24hr_vol: s.boolean("Include 24-hour trading volume. \nDefault: false"),
    include_24hr_change: s.boolean("Include 24-hour change percentage. \nDefault: false"),
    include_last_updated_at: s.boolean("Include last updated price time as a UNIX timestamp. \nDefault: false"),
    precision: s.stringEnum("Decimal places for currency price value", [
      "full",
      "0",
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
      "9",
      "10",
      "11",
      "12",
      "13",
      "14",
      "15",
      "16",
      "17",
      "18",
    ]),
  },
  { required: ["vs_currencies"] },
);

const listCoinMarketsInput = s.object(
  "Input parameters for list_coin_markets.",
  {
    vs_currency: s.nonEmptyString(
      "Target currency of coins and market data. \n*refers to [`/simple/supported_vs_currencies`](/reference/simple-supported-currencies)",
    ),
    ids: s.nonEmptyString(
      "Coins' IDs, comma-separated if querying more than 1 coin. \n*refers to [`/coins/list`](/reference/coins-list)",
    ),
    names: s.nonEmptyString("Coins' names, comma-separated if querying more than 1 coin."),
    symbols: s.nonEmptyString("Coins' symbols, comma-separated if querying more than 1 coin."),
    include_tokens: s.stringEnum(
      "For `symbols` lookups, specify `all` to include all matching tokens. \nDefault `top` returns top-ranked tokens by market cap or volume.",
      ["top", "all"],
    ),
    category: s.nonEmptyString(
      "Filter based on coins' category. \n*refers to [`/coins/categories/list`](/reference/coins-categories-list)",
    ),
    order: s.stringEnum("Sort result by field. \nDefault: market_cap_desc", [
      "market_cap_asc",
      "market_cap_desc",
      "volume_asc",
      "volume_desc",
      "id_asc",
      "id_desc",
    ]),
    per_page: s.integer("Total results per page. \nDefault: 100 \nValid values: 1...250", {
      minimum: 1,
      maximum: 250,
    }),
    page: s.integer("Page through results. \nDefault: 1", { minimum: 1 }),
    sparkline: s.boolean("Include sparkline 7-day data. \nDefault: false"),
    price_change_percentage: s.nonEmptyString(
      "Include price change percentage timeframe, comma-separated if querying more than 1 timeframe. \nValid values: `1h`, `24h`, `7d`, `14d`, `30d`, `200d`, `1y`",
    ),
    locale: s.stringEnum("Language background. \nDefault: en", [
      "ar",
      "bg",
      "cs",
      "da",
      "de",
      "el",
      "en",
      "es",
      "fi",
      "fr",
      "he",
      "hi",
      "hr",
      "hu",
      "id",
      "it",
      "ja",
      "ko",
      "lt",
      "nl",
      "no",
      "pl",
      "pt",
      "ro",
      "ru",
      "sk",
      "sl",
      "sv",
      "th",
      "tr",
      "uk",
      "vi",
      "zh",
      "zh-tw",
    ]),
    precision: s.stringEnum("Decimal places for currency price value", [
      "full",
      "0",
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
      "9",
      "10",
      "11",
      "12",
      "13",
      "14",
      "15",
      "16",
      "17",
      "18",
    ]),
    include_rehypothecated: s.boolean(
      "Include rehypothecated tokens in results. When true, returns `market_cap_rank_with_rehypothecated` field. \nDefault: false",
    ),
  },
  { required: ["vs_currency"] },
);

const getCoinInput = s.object(
  "Input parameters for get_coin.",
  {
    id: s.nonEmptyString("Coin ID. \n*refers to [`/coins/list`](/reference/coins-list)"),
    localization: s.boolean("Include all localized languages in the response. \nDefault: true"),
    tickers: s.boolean("Include tickers data. \nDefault: true"),
    market_data: s.boolean("Include market data. \nDefault: true"),
    sparkline: s.boolean("Include sparkline 7-day data. \nDefault: false"),
    include_categories_details: s.boolean("Include categories details. \nDefault: false"),
    dex_pair_format: s.stringEnum(
      "Set to `symbol` to display DEX pair base and target as symbols. \nDefault: `contract_address`",
      ["contract_address", "symbol"],
    ),
  },
  { required: ["id"] },
);

const getMarketChartInput = s.object(
  "Input parameters for get_market_chart.",
  {
    id: s.nonEmptyString("Coin ID. \n*refers to [`/coins/list`](/reference/coins-list)."),
    vs_currency: s.nonEmptyString(
      "Target currency of market data. \n*refers to [`/simple/supported_vs_currencies`](/reference/simple-supported-currencies).",
    ),
    days: s.union(
      [
        s.integer("Number of days of history.", { minimum: 1 }),
        s.stringEnum("Request all history available to your plan.", ["max"]),
      ],
      {
        description: "Data up to number of days ago. \nYou may use any integer or `max` for number of days.",
      },
    ),
    interval: s.stringEnum("Data interval, leave empty for auto granularity.", ["5m", "hourly", "daily"]),
    precision: s.stringEnum("Decimal place for currency price value.", [
      "full",
      "0",
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
      "9",
      "10",
      "11",
      "12",
      "13",
      "14",
      "15",
      "16",
      "17",
      "18",
    ]),
  },
  { required: ["id", "vs_currency", "days"] },
);

const getMarketChartRangeInput = s.object(
  "Input parameters for get_market_chart_range.",
  {
    id: s.nonEmptyString("Coin ID. \n*refers to [`/coins/list`](/reference/coins-list)."),
    vs_currency: s.nonEmptyString(
      "Target currency of market data. \n*refers to [`/simple/supported_vs_currencies`](/reference/simple-supported-currencies).",
    ),
    from: s.nonEmptyString(
      "Starting date in ISO date string (`YYYY-MM-DD` or `YYYY-MM-DDTHH:MM`) or UNIX timestamp. \n**Use ISO date string for best compatibility.**",
    ),
    to: s.nonEmptyString(
      "Ending date in ISO date string (`YYYY-MM-DD` or `YYYY-MM-DDTHH:MM`) or UNIX timestamp. \n**Use ISO date string for best compatibility.**",
    ),
    interval: s.stringEnum("Data interval, leave empty for auto granularity.", ["5m", "hourly", "daily"]),
    precision: s.stringEnum("Decimal place for currency price value.", [
      "full",
      "0",
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
      "9",
      "10",
      "11",
      "12",
      "13",
      "14",
      "15",
      "16",
      "17",
      "18",
    ]),
  },
  { required: ["id", "vs_currency", "from", "to"] },
);

const getTrendingInput = s.object(
  "Input parameters for get_trending.",
  {
    show_max: s.nonEmptyString(
      "Show max number of results available for the given type. \nAvailable values: `coins`, `nfts`, `categories` \ne.g. `coins` or `coins,nfts,categories`",
    ),
  },
  { required: [] },
);

const getGlobalMarketDataInput = s.object("Input parameters for get_global_market_data.", {}, { required: [] });

export const coingeckoActions: ActionDefinition[] = [
  ...coingeckoMarketActions,
  ...coingeckoOnchainActions,
  defineProviderAction(service, {
    name: "search",
    operationType: "read",
    description: "Search coins, categories, exchanges and NFTs listed on CoinGecko.",
    requiredScopes: [],
    inputSchema: searchInput,
    outputSchema: searchOutput,
  }),
  defineProviderAction(service, {
    name: "list_supported_currencies",
    operationType: "read",
    description: "List supported quote currencies for CoinGecko price and market queries.",
    requiredScopes: [],
    inputSchema: listSupportedCurrenciesInput,
    outputSchema: currenciesOutput,
  }),
  defineProviderAction(service, {
    name: "list_coins",
    operationType: "read",
    description: "List CoinGecko coin IDs, symbols and names, optionally including platform contract addresses.",
    requiredScopes: [],
    inputSchema: listCoinsInput,
    outputSchema: coinsOutput,
  }),
  defineProviderAction(service, {
    name: "get_prices",
    operationType: "read",
    description:
      "Get current coin prices by ID, name or symbol, with optional market metrics. At least one selector is required; CoinGecko prioritizes IDs, then names, then symbols.",
    requiredScopes: [],
    inputSchema: {
      ...getPricesInput,
      anyOf: [{ required: ["ids"] }, { required: ["names"] }, { required: ["symbols"] }],
    },
    outputSchema: pricesOutput,
  }),
  defineProviderAction(service, {
    name: "list_coin_markets",
    operationType: "read",
    description:
      "List paginated coin prices, market capitalization, volume and price changes. Plan-specific filters are enforced by CoinGecko.",
    requiredScopes: [],
    inputSchema: listCoinMarketsInput,
    outputSchema: marketsOutput,
  }),
  defineProviderAction(service, {
    name: "get_coin",
    operationType: "read",
    description: "Get coin metadata and optional market data, tickers and seven-day sparkline.",
    requiredScopes: [],
    inputSchema: getCoinInput,
    outputSchema: coinOutput,
  }),
  defineProviderAction(service, {
    name: "get_market_chart",
    operationType: "read",
    description:
      "Get historical price, market capitalization and volume series by number of days. Historical access and interval availability depend on your CoinGecko plan.",
    requiredScopes: [],
    inputSchema: getMarketChartInput,
    outputSchema: chartOutput,
  }),
  defineProviderAction(service, {
    name: "get_market_chart_range",
    operationType: "read",
    description:
      "Get historical price, market capitalization and volume series within a date or UNIX timestamp range. Historical access and interval availability depend on your CoinGecko plan.",
    requiredScopes: [],
    inputSchema: getMarketChartRangeInput,
    outputSchema: chartOutput,
  }),
  defineProviderAction(service, {
    name: "get_trending",
    operationType: "read",
    description:
      "Get trending coins, NFTs and categories by CoinGecko search volume over the last 24 hours. The show_max option requires an eligible plan.",
    requiredScopes: [],
    inputSchema: getTrendingInput,
    outputSchema: trendingOutput,
  }),
  defineProviderAction(service, {
    name: "get_global_market_data",
    operationType: "read",
    description: "Get global cryptocurrency market capitalization, trading volume and market share.",
    requiredScopes: [],
    inputSchema: getGlobalMarketDataInput,
    outputSchema: globalOutput,
  }),
];
