import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "coingecko";
const assetPlatformsOutput = s.object("CoinGecko asset platform directory.", {
  platforms: s.array(
    "Asset platforms for contract-address queries.",
    s.looseObject("Asset platform metadata.", {
      id: s.string("CoinGecko asset platform ID."),
      name: s.string("Platform name."),
      chain_identifier: s.nullable(s.integer("Chainlist numeric chain ID, when available.")),
      native_coin_id: s.nullable(s.string("CoinGecko ID of the platform native coin.")),
    }),
  ),
});
const tokenPricesOutput = s.object("Global market prices for CoinGecko-listed tokens.", {
  prices: s.record(
    "Contract addresses mapped to currency prices and optional metrics.",
    s.looseObject("Currency price and metric map; unavailable metrics may be null.", {}),
  ),
});
const contractCoinOutput = s.looseObject("Coin details resolved from an asset platform and contract address.", {
  id: s.string("CoinGecko coin ID."),
  name: s.string("Coin name."),
  symbol: s.string("Coin ticker symbol."),
  detail_platforms: s.looseObject("Platform contract addresses and decimal precision.", {}),
  market_data: s.looseObject("Coin market metrics across currencies.", {}),
});
const categoryMarketsOutput = s.object("CoinGecko category market data.", {
  categories: s.array(
    "Categories ordered as requested.",
    s.object(
      "Category market record.",
      {
        id: s.string("Category ID accepted by list_coin_markets."),
        name: s.string("Category name."),
        market_cap: s.nullable(s.number("Category market capitalization in USD.")),
        market_cap_change_24h: s.nullable(s.number("Category market capitalization percentage change in 24 hours.")),
        volume_24h: s.nullable(s.number("Category trading volume in USD over 24 hours.")),
        top_3_coins_id: s.array("Coin IDs of the top three coins.", s.string("CoinGecko coin ID.")),
        updated_at: s.nullable(s.string("Time the category metrics were updated.")),
      },
      { additionalProperties: true, optional: ["top_3_coins_id"] },
    ),
  ),
});
const coinTickersOutput = s.looseObject("A page of coin tickers from CEX and DEX markets.", {
  name: s.string("Coin name."),
  tickers: s.array(
    "Up to 100 tickers in the requested page.",
    s.object(
      "Trading pair quote and market metadata.",
      {
        base: s.string("Base token symbol or contract address."),
        target: s.string("Quote token symbol or contract address."),
        market: s.looseObject("Exchange name, identifier and market metadata.", {}),
        last: s.number("Last traded price in the target currency."),
        volume: s.number("Trading volume reported for this ticker."),
        bid_ask_spread_percentage: s.nullable(s.number("Bid-ask spread percentage.")),
        trust_score: s.nullable(s.string("CoinGecko ticker trust score.")),
        is_anomaly: s.boolean("Whether the ticker is anomalous."),
        is_stale: s.boolean("Whether the ticker is stale."),
        last_traded_at: s.nullable(s.string("Time of the last trade.")),
        cost_to_move_up_usd: s.nullable(
          s.number("USD cost to move the orderbook up by 2 percent when depth is requested."),
        ),
        cost_to_move_down_usd: s.nullable(
          s.number("USD cost to move the orderbook down by 2 percent when depth is requested."),
        ),
      },
      {
        additionalProperties: true,
        optional: [
          "bid_ask_spread_percentage",
          "trust_score",
          "is_anomaly",
          "is_stale",
          "last_traded_at",
          "cost_to_move_up_usd",
          "cost_to_move_down_usd",
        ],
      },
    ),
  ),
});
const coinOhlcOutput = s.object("Coin OHLC candles; timestamps represent candle close times.", {
  candles: s.array(
    "OHLC candles without per-candle volume.",
    s.tuple(
      [
        s.integer("Candle close timestamp in UNIX milliseconds."),
        s.number("Opening price."),
        s.number("Highest price."),
        s.number("Lowest price."),
        s.number("Closing price."),
      ],
      { description: "Candle close timestamp in UNIX milliseconds, open, high, low and close." },
    ),
  ),
});
const coinHistoryOutput = s.object(
  "Historical coin snapshot at 00:00 UTC on the requested date.",
  {
    id: s.string("CoinGecko coin ID."),
    name: s.string("Coin name."),
    symbol: s.string("Coin ticker symbol."),
    market_data: s.looseObject("Historical market metrics by currency when available.", {
      current_price: s.record("Historical price by currency.", s.nullable(s.number("Price in the quote currency."))),
      market_cap: s.record(
        "Historical market capitalization by currency.",
        s.nullable(s.number("Market capitalization in the quote currency.")),
      ),
      total_volume: s.record(
        "Historical 24-hour volume by currency.",
        s.nullable(s.number("Volume in the quote currency.")),
      ),
    }),
  },
  { additionalProperties: true, optional: ["market_data"] },
);

const listAssetPlatformsInput = s.object(
  "Input parameters for list_asset_platforms.",
  {
    filter: s.stringEnum("Apply relevant filters to results.", ["nft"]),
  },
  { required: [] },
);

const getTokenPricesInput = s.object(
  "Input parameters for get_token_prices.",
  {
    asset_platform_id: s.nonEmptyString(
      "CoinGecko asset platform ID, such as ethereum. Use list_asset_platforms; this is not an onchain network ID.",
    ),
    contract_addresses: s.nonEmptyString("Token contract addresses, comma-separated if querying more than 1 token"),
    vs_currencies: s.nonEmptyString(
      "Target currency of coins, comma-separated if querying more than 1 currency. \n*refers to [`/simple/supported_vs_currencies`](/reference/simple-supported-currencies)",
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
  { required: ["asset_platform_id", "contract_addresses", "vs_currencies"] },
);

const getCoinByContractInput = s.object(
  "Input parameters for get_coin_by_contract.",
  {
    asset_platform_id: s.nonEmptyString(
      "CoinGecko asset platform ID, such as ethereum. Use list_asset_platforms; this is not an onchain network ID.",
    ),
    contract_address: s.nonEmptyString("The contract address of token."),
  },
  { required: ["asset_platform_id", "contract_address"] },
);

const listCategoryMarketsInput = s.object(
  "Input parameters for list_category_markets.",
  {
    order: s.stringEnum("Sort results by field. \nDefault: `market_cap_desc`", [
      "market_cap_desc",
      "market_cap_asc",
      "name_desc",
      "name_asc",
      "market_cap_change_24h_desc",
      "market_cap_change_24h_asc",
    ]),
  },
  { required: [] },
);

const listCoinTickersInput = s.object(
  "Input parameters for list_coin_tickers.",
  {
    id: s.nonEmptyString("Coin ID. \n*refers to [`/coins/list`](/reference/coins-list)"),
    exchange_ids: s.nonEmptyString("Exchange ID. \n*refers to [`/exchanges/list`](/reference/exchanges-list)"),
    include_exchange_logo: s.boolean("Include exchange logo. \nDefault: false"),
    page: s.integer("Page through results", { minimum: 1 }),
    order: s.stringEnum("Sort the order of responses. \nDefault: trust_score_desc", [
      "trust_score_desc",
      "trust_score_asc",
      "volume_desc",
      "volume_asc",
    ]),
    depth: s.boolean(
      "Include 2% orderbook depth, i.e. `cost_to_move_up_usd` and `cost_to_move_down_usd`. \nDefault: false",
    ),
    dex_pair_format: s.stringEnum(
      "Set to `symbol` to display DEX pair base and target as symbols. \nDefault: `contract_address`",
      ["contract_address", "symbol"],
    ),
  },
  { required: ["id"] },
);

const getCoinOhlcInput = s.object(
  "Input parameters for get_coin_ohlc.",
  {
    id: s.nonEmptyString("Coin ID. \n*refers to [`/coins/list`](/reference/coins-list)."),
    vs_currency: s.nonEmptyString(
      "Target currency of price data. \n*refers to [`/simple/supported_vs_currencies`](/reference/simple-supported-currencies).",
    ),
    days: s.union(
      [
        {
          type: "integer",
          enum: [1, 7, 14, 30, 90, 180, 365],
          description: "Number of days of OHLC history.",
        },
        s.stringEnum("Request all available OHLC history.", ["max"]),
      ],
      { description: "Data up to number of days ago." },
    ),
    interval: s.stringEnum("Data interval, leave empty for auto granularity.", ["daily", "hourly"]),
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

const getCoinHistoryInput = s.object(
  "Input parameters for get_coin_history.",
  {
    id: s.nonEmptyString("Coin ID. \n*refers to [`/coins/list`](/reference/coins-list)."),
    date: s.string("The date of data snapshot. \nFormat: `YYYY-MM-DD`", { format: "date" }),
    localization: s.boolean("Include all the localized languages in response. \nDefault: true"),
  },
  { required: ["id", "date"] },
);

export const coingeckoMarketActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_asset_platforms",
    operationType: "read",
    description:
      "List CoinGecko asset platform IDs for contract-address lookups. These differ from onchain network IDs.",
    requiredScopes: [],
    inputSchema: listAssetPlatformsInput,
    outputSchema: assetPlatformsOutput,
  }),
  defineProviderAction(service, {
    name: "get_token_prices",
    operationType: "read",
    description:
      "Get global average prices and optional metrics for CoinGecko-listed tokens by asset platform and contract addresses. Supports up to 515 addresses per request.",
    requiredScopes: [],
    inputSchema: getTokenPricesInput,
    outputSchema: tokenPricesOutput,
  }),
  defineProviderAction(service, {
    name: "get_coin_by_contract",
    operationType: "read",
    description: "Resolve CoinGecko coin details and coin ID from an asset platform ID and token contract address.",
    requiredScopes: [],
    inputSchema: getCoinByContractInput,
    outputSchema: contractCoinOutput,
  }),
  defineProviderAction(service, {
    name: "list_category_markets",
    operationType: "read",
    description:
      "List CoinGecko category market capitalization, 24-hour changes and volume. Use returned category IDs with list_coin_markets.",
    requiredScopes: [],
    inputSchema: listCategoryMarketsInput,
    outputSchema: categoryMarketsOutput,
  }),
  defineProviderAction(service, {
    name: "list_coin_tickers",
    operationType: "read",
    description:
      "List a page of up to 100 CEX and DEX tickers for a coin, with exchange filters and optional 2-percent orderbook depth. Quotes are market observations, not execution guarantees.",
    requiredScopes: [],
    inputSchema: listCoinTickersInput,
    outputSchema: coinTickersOutput,
  }),
  defineProviderAction(service, {
    name: "get_coin_ohlc",
    operationType: "read",
    description:
      "Get coin OHLC candles without volume. Timestamps are candle close times in UNIX milliseconds. Demo supports up to 365 days with automatic granularity; max and explicit hourly/daily intervals require paid access.",
    requiredScopes: [],
    inputSchema: {
      ...getCoinOhlcInput,
      allOf: [
        {
          if: { required: ["interval"], properties: { interval: { const: "daily" } } },
          then: { properties: { days: { enum: [1, 7, 14, 30, 90, 180] } } },
        },
        {
          if: { required: ["interval"], properties: { interval: { const: "hourly" } } },
          then: { properties: { days: { enum: [1, 7, 14, 30, 90] } } },
        },
      ],
    },
    outputSchema: coinOhlcOutput,
  }),
  defineProviderAction(service, {
    name: "get_coin_history",
    operationType: "read",
    description:
      "Get a coin market snapshot at 00:00 UTC on a specified date, not that day's closing price. Demo history is limited to 365 days; paid historical access depends on plan.",
    requiredScopes: [],
    inputSchema: getCoinHistoryInput,
    outputSchema: coinHistoryOutput,
  }),
];
