import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "aisa";
const coinId = s.string("The CoinGecko coin ID, such as bitcoin.");
const currency = s.string("A CoinGecko quote-currency code, such as usd.");
const precision = s.stringEnum("The decimal precision for currency prices.", [
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
]);

const interval = s.stringEnum("The chart interval; omit for automatic granularity.", ["1m", "5m", "hourly", "daily"]);

const dexPairFormat = s.stringEnum("Whether DEX pair assets use contract addresses or symbols.", [
  "contract_address",
  "symbol",
]);

const names = s.array("Coin names to look up, such as Bitcoin.", s.string("A coin name.", { minLength: 1 }), {
  minItems: 1,
  uniqueItems: true,
});

const symbols = s.array(
  "Coin symbols to look up; symbols can match multiple coins.",
  s.string("A coin symbol, such as btc.", { minLength: 1 }),
  { minItems: 1, uniqueItems: true },
);

const includeTokens = s.stringEnum("For symbol lookups, return top-ranked matches or all matching tokens.", [
  "top",
  "all",
]);

const cryptoOutput = s.looseObject("The CoinGecko market data returned by AIsa.");

const getCryptoPricesAction = defineProviderAction(service, {
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
      names,
      symbols,
      includeTokens,
      includeMarketCap: s.boolean("Whether to include market capitalization."),
      include24HourVolume: s.boolean("Whether to include 24-hour volume."),
      include24HourChange: s.boolean("Whether to include 24-hour price change."),
      includeLastUpdatedAt: s.boolean("Whether to include the last update timestamp."),
      precision,
    },
    {
      optional: [
        "coinIds",
        "names",
        "symbols",
        "includeTokens",
        "includeMarketCap",
        "include24HourVolume",
        "include24HourChange",
        "includeLastUpdatedAt",
        "precision",
      ],
      anyOf: [{ required: ["coinIds"] }, { required: ["names"] }, { required: ["symbols"] }],
    },
  ),
  outputSchema: cryptoOutput,
});
const listCryptoMarketsAction = defineProviderAction(service, {
  name: "list_crypto_markets",
  operationType: "read",
  description: "List coin markets with price, capitalization, volume, and change metrics.",
  requiredScopes: [],
  inputSchema: s.object(
    "Quote currency, filters, sorting, and pagination for CoinGecko markets.",
    {
      currency,
      coinIds: s.array("The CoinGecko coin IDs to include.", coinId, { uniqueItems: true }),
      names,
      symbols,
      includeTokens,
      includeRehypothecated: s.boolean("Whether to include rehypothecated tokens and their rank."),
      precision,
      locale: s.string("The response language code, such as en or zh."),
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
      optional: [
        "coinIds",
        "names",
        "symbols",
        "includeTokens",
        "includeRehypothecated",
        "precision",
        "locale",
        "category",
        "order",
        "perPage",
        "page",
        "sparkline",
        "priceChangePercentages",
      ],
    },
  ),
  outputSchema: s.array("The CoinGecko market rows.", s.looseObject("One coin market row.")),
});
const getCryptoCoinAction = defineProviderAction(service, {
  name: "get_crypto_coin",
  operationType: "read",
  description: "Get metadata, market data, categories, and trading pairs for one coin.",
  requiredScopes: [],
  inputSchema: s.object(
    "A CoinGecko coin ID and optional response sections.",
    {
      coinId,
      localization: s.boolean("Whether to include localized descriptions."),
      tickers: s.boolean("Whether to include exchange tickers."),
      marketData: s.boolean("Whether to include market data."),
      dexPairFormat,
      includeCategoriesDetails: s.boolean("Whether to include detailed category information."),
      sparkline: s.boolean("Whether to include seven-day sparkline values."),
    },
    {
      optional: ["localization", "tickers", "marketData", "dexPairFormat", "includeCategoriesDetails", "sparkline"],
    },
  ),
  outputSchema: cryptoOutput,
});
const getCryptoMarketChartAction = defineProviderAction(service, {
  name: "get_crypto_market_chart",
  operationType: "read",
  description: "Get price, market-cap, and volume history for a coin over a date or Unix-time range.",
  requiredScopes: [],
  inputSchema: s.object(
    "A coin, quote currency, and date or Unix-time range for a market chart.",
    {
      coinId,
      currency,
      fromTimestamp: s.anyOf("The range start as an ISO date or Unix timestamp.", [
        s.string("An ISO date or Unix timestamp string.", { minLength: 1 }),
        s.integer("A Unix timestamp in seconds."),
      ]),
      toTimestamp: s.anyOf("The range end as an ISO date or Unix timestamp.", [
        s.string("An ISO date or Unix timestamp string.", { minLength: 1 }),
        s.integer("A Unix timestamp in seconds."),
      ]),
      interval,
      precision,
    },
    { optional: ["precision", "interval"] },
  ),
  outputSchema: cryptoOutput,
});
const getCryptoOhlcAction = defineProviderAction(service, {
  name: "get_crypto_ohlc",
  operationType: "read",
  description: "Get open, high, low, and close price candles for one coin.",
  requiredScopes: [],
  inputSchema: s.object(
    "A coin, quote currency, and CoinGecko day window for OHLC candles.",
    {
      coinId,
      currency,
      days: s.stringEnum("The CoinGecko lookback window in days.", ["1", "7", "14", "30", "90", "180", "365", "max"]),
      interval: s.stringEnum("The OHLC candle interval; omit for automatic granularity.", ["daily", "hourly"]),
      precision,
    },
    { optional: ["precision", "interval"] },
  ),
  outputSchema: s.array(
    "The OHLC candles ordered by time.",
    s.array("One OHLC candle.", s.number("A candle timestamp or price value.")),
  ),
});
const getTokenPricesAction = defineProviderAction(service, {
  name: "get_token_prices",
  operationType: "read",
  description: "Get current prices for token contracts on one asset platform.",
  requiredScopes: [],
  inputSchema: s.object(
    "A platform, token contracts, and quote currencies for token prices.",
    {
      includeMarketCap: s.boolean("Whether to include market capitalization."),
      include24HourVolume: s.boolean("Whether to include 24-hour volume."),
      include24HourChange: s.boolean("Whether to include 24-hour price change."),
      includeLastUpdatedAt: s.boolean("Whether to include the last update timestamp."),
      precision,
      platformId: s.string("The CoinGecko asset-platform ID, such as ethereum."),
      contractAddresses: s.array("The token contract addresses to price.", s.string("A token contract address."), {
        minItems: 1,
        uniqueItems: true,
      }),
      currencies: s.array("The quote currencies to return.", currency, {
        minItems: 1,
        uniqueItems: true,
      }),
    },
    {
      optional: ["includeMarketCap", "include24HourVolume", "include24HourChange", "includeLastUpdatedAt", "precision"],
    },
  ),
  outputSchema: cryptoOutput,
});
const getTokenDataAction = defineProviderAction(service, {
  name: "get_token_data",
  operationType: "read",
  description: "Get CoinGecko metadata and market data for a token contract.",
  requiredScopes: [],
  inputSchema: s.object(
    "An asset platform and token contract address.",
    {
      platformId: s.string("The CoinGecko asset-platform ID, such as ethereum."),
      contractAddress: s.string("The token contract address."),
    },
    { optional: [] },
  ),
  outputSchema: cryptoOutput,
});
const listCryptoExchangesAction = defineProviderAction(service, {
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
const listCryptoCategoriesAction = defineProviderAction(service, {
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
const getTrendingCryptoAction = defineProviderAction(service, {
  name: "get_trending_crypto",
  operationType: "read",
  description: "Get coins, NFTs, and categories currently trending on CoinGecko.",
  requiredScopes: [],
  inputSchema: s.object(
    "Optional result groups to expand in CoinGecko trending data.",
    {
      showMax: s.array(
        "Return the maximum available results for these groups.",
        s.stringEnum("A trending result group.", ["coins", "nfts", "categories"]),
        { minItems: 1, uniqueItems: true },
      ),
    },
    { optional: ["showMax"] },
  ),
  outputSchema: cryptoOutput,
});

export const cryptoActions: readonly ActionDefinition[] = [
  getCryptoPricesAction,
  listCryptoMarketsAction,
  getCryptoCoinAction,
  getCryptoMarketChartAction,
  getCryptoOhlcAction,
  getTokenPricesAction,
  getTokenDataAction,
  listCryptoExchangesAction,
  listCryptoCategoriesAction,
  getTrendingCryptoAction,
];
const exchangeId = s.string("The CoinGecko exchange ID, such as binance.", { minLength: 1 });
const platformId = s.string("The CoinGecko asset-platform ID, such as ethereum.", { minLength: 1 });

const contractAddress = s.string("The token contract address on the selected platform.", {
  minLength: 1,
});

const days = s.string("The lookback window in days, as an integer string or max.", {
  minLength: 1,
});

const tickerOptions = {
  depth: s.boolean("Whether to include the cost of moving the order book by two percent."),
  dexPairFormat,
  includeExchangeLogo: s.boolean("Whether to include exchange logo URLs."),
  page: s.integer("The one-based result page.", { minimum: 1 }),
};

const chartOutput = s.looseObject(
  "Historical prices, market capitalizations, and trading volumes.",
  {
    prices: s.array(
      "Timestamp and price pairs.",
      s.array("One timestamp and price pair.", s.number("A timestamp in milliseconds or price.")),
    ),
    market_caps: s.array(
      "Timestamp and market capitalization pairs.",
      s.array(
        "One timestamp and capitalization pair.",
        s.number("A timestamp in milliseconds or market capitalization."),
      ),
    ),
    total_volumes: s.array(
      "Timestamp and trading volume pairs.",
      s.array("One timestamp and volume pair.", s.number("A timestamp in milliseconds or trading volume.")),
    ),
  },
  { required: [] },
);

export const cryptoResearchActions: readonly ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_crypto_coins",
    operationType: "read",
    description: "Discover CoinGecko coin IDs, names, symbols, and optional token contract addresses.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters for the CoinGecko coin directory.",
      {
        includePlatform: s.boolean("Whether to include platform IDs and contract addresses."),
        status: s.stringEnum("Whether to list active or inactive coins.", ["active", "inactive"]),
      },
      { optional: ["includePlatform", "status"] },
    ),
    outputSchema: s.array(
      "Coin directory entries.",
      s.looseObject(
        "A coin with its ID, symbol, and name.",
        {
          id: coinId,
          symbol: s.string("The coin symbol."),
          name: s.string("The coin name."),
          platforms: s.record(
            "Platform IDs mapped to token contract addresses.",
            s.string("A token contract address."),
          ),
        },
        { required: [] },
      ),
    ),
  }),
  defineProviderAction(service, {
    name: "get_crypto_coin_tickers",
    operationType: "read",
    description: "Compare a coin's trading pairs across exchanges, with liquidity depth and pagination.",
    requiredScopes: [],
    inputSchema: s.object(
      "A coin and filters for its exchange trading pairs.",
      {
        coinId,
        exchangeIds: s.array("Exchange IDs to include.", exchangeId, {
          minItems: 1,
          uniqueItems: true,
        }),
        ...tickerOptions,
        order: s.stringEnum("The ordering for coin trading pairs.", [
          "trust_score_desc",
          "trust_score_asc",
          "volume_desc",
          "volume_asc",
        ]),
      },
      {
        optional: ["exchangeIds", "depth", "dexPairFormat", "includeExchangeLogo", "page", "order"],
      },
    ),
    outputSchema: s.looseObject(
      "A coin and its exchange trading pairs.",
      {
        name: s.string("The coin name."),
        tickers: s.array("The trading pairs on this page.", s.looseObject("One trading pair and its market metrics.")),
      },
      { required: [] },
    ),
  }),
  defineProviderAction(service, {
    name: "get_crypto_coin_history",
    operationType: "read",
    description: "Get a historical coin price, market-cap, and volume snapshot for a calendar date.",
    requiredScopes: [],
    inputSchema: s.object(
      "A coin and snapshot date.",
      {
        coinId,
        date: s.string("The snapshot date in YYYY-MM-DD format.", { format: "date" }),
        localization: s.boolean("Whether to include all localized names."),
      },
      { optional: ["localization"] },
    ),
    outputSchema: s.looseObject(
      "The historical coin snapshot.",
      {
        id: coinId,
        market_data: s.looseObject("Historical prices, market caps, and volumes by quote currency."),
      },
      { required: [] },
    ),
  }),
  defineProviderAction(service, {
    name: "get_crypto_market_chart_days",
    operationType: "read",
    description: "Get a coin's price, market-cap, and volume history over a lookback window.",
    requiredScopes: [],
    inputSchema: s.object(
      "A coin, quote currency, and lookback window.",
      {
        coinId,
        currency,
        days,
        interval,
        precision,
      },
      { optional: ["interval", "precision"] },
    ),
    outputSchema: chartOutput,
  }),
  defineProviderAction(service, {
    name: "get_token_market_chart",
    operationType: "read",
    description: "Get a token contract's price, market-cap, and volume history over a date range.",
    requiredScopes: [],
    inputSchema: s.object(
      "A platform, token contract, quote currency, and date range.",
      {
        platformId,
        contractAddress,
        currency,
        from: s.string("The range start as YYYY-MM-DD, YYYY-MM-DDTHH:MM, or a Unix timestamp string.", {
          minLength: 1,
        }),
        to: s.string("The range end as YYYY-MM-DD, YYYY-MM-DDTHH:MM, or a Unix timestamp string.", {
          minLength: 1,
        }),
        interval,
        precision,
      },
      { optional: ["interval", "precision"] },
    ),
    outputSchema: chartOutput,
  }),
  defineProviderAction(service, {
    name: "get_token_market_chart_days",
    operationType: "read",
    description: "Get a token contract's price, market-cap, and volume history over a lookback window.",
    requiredScopes: [],
    inputSchema: s.object(
      "A platform, token contract, quote currency, and lookback window.",
      {
        platformId,
        contractAddress,
        currency,
        days,
        interval,
        precision,
      },
      { optional: ["interval", "precision"] },
    ),
    outputSchema: chartOutput,
  }),
  defineProviderAction(service, {
    name: "get_crypto_exchange",
    operationType: "read",
    description: "Research an exchange's trust score, volume, metadata, and trading pairs.",
    requiredScopes: [],
    inputSchema: s.object(
      "An exchange and optional DEX pair format.",
      {
        exchangeId,
        dexPairFormat,
      },
      { optional: ["dexPairFormat"] },
    ),
    outputSchema: s.looseObject(
      "Exchange metadata and market data.",
      {
        name: s.string("The exchange name."),
        tickers: s.array("The exchange's trading pairs.", s.looseObject("One trading pair and its market metrics.")),
      },
      { required: [] },
    ),
  }),
  defineProviderAction(service, {
    name: "get_crypto_exchange_tickers",
    operationType: "read",
    description: "List and filter an exchange's trading pairs, including liquidity depth and pagination.",
    requiredScopes: [],
    inputSchema: s.object(
      "An exchange and filters for its trading pairs.",
      {
        exchangeId,
        coinIds: s.array("Coin IDs to include.", coinId, { minItems: 1, uniqueItems: true }),
        ...tickerOptions,
        order: s.stringEnum("The ordering for exchange trading pairs.", [
          "market_cap_asc",
          "market_cap_desc",
          "trust_score_desc",
          "trust_score_asc",
          "volume_desc",
          "volume_asc",
          "base_target",
        ]),
      },
      { optional: ["coinIds", "depth", "dexPairFormat", "includeExchangeLogo", "page", "order"] },
    ),
    outputSchema: s.looseObject(
      "An exchange and its trading pairs.",
      {
        name: s.string("The exchange name."),
        tickers: s.array("The trading pairs on this page.", s.looseObject("One trading pair and its market metrics.")),
      },
      { required: [] },
    ),
  }),
  defineProviderAction(service, {
    name: "get_crypto_exchange_volume_chart",
    operationType: "read",
    description: "Get historical trading volume for an exchange over a lookback window.",
    requiredScopes: [],
    inputSchema: s.object(
      "An exchange and trading-volume lookback window.",
      {
        exchangeId,
        days: s.stringEnum("The lookback window in days.", ["1", "7", "14", "30", "90", "180", "365"]),
      },
      { optional: [] },
    ),
    outputSchema: s.array(
      "Exchange volume observations.",
      s.array(
        "One timestamp and volume pair.",
        s.anyOf("A timestamp or volume value.", [
          s.number("A numeric timestamp or volume."),
          s.string("A decimal volume string."),
        ]),
      ),
    ),
  }),
  defineProviderAction(service, {
    name: "list_crypto_exchange_ids",
    operationType: "read",
    description: "Discover exchange IDs and names for trading-pair and volume research.",
    requiredScopes: [],
    inputSchema: s.object(
      "An optional exchange status filter.",
      {
        status: s.stringEnum("Whether to list active or inactive exchanges.", ["active", "inactive"]),
      },
      { optional: ["status"] },
    ),
    outputSchema: s.array(
      "Exchange directory entries.",
      s.looseObject(
        "An exchange ID and name.",
        {
          id: exchangeId,
          name: s.string("The exchange name."),
        },
        { required: [] },
      ),
    ),
  }),
  defineProviderAction(service, {
    name: "list_crypto_category_ids",
    operationType: "read",
    description: "Discover category IDs for filtering cryptocurrency markets.",
    requiredScopes: [],
    inputSchema: s.object("The empty input for the cryptocurrency category directory.", {}, { optional: [] }),
    outputSchema: s.array(
      "Cryptocurrency category directory entries.",
      s.looseObject(
        "A category ID and name.",
        {
          category_id: s.string("The category ID used to filter market queries."),
          name: s.string("The category name."),
        },
        { required: [] },
      ),
    ),
  }),
  defineProviderAction(service, {
    name: "list_crypto_quote_currencies",
    operationType: "read",
    description: "List supported quote currencies for coin prices and historical market data.",
    requiredScopes: [],
    inputSchema: s.object("The empty input for supported quote currencies.", {}, { optional: [] }),
    outputSchema: s.array("Supported quote-currency codes.", currency),
  }),
];
