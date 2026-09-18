import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "token_metrics";

function optionalNumberOrString(description: string) {
  return s.anyOf(description, [s.number(description, { minimum: 0 }), s.nonEmptyString(description)]);
}

const tokenFilterFields = {
  token_id: s.anyOf("One Token Metrics token identifier or a comma-separated identifier list.", [
    s.integer("One positive Token Metrics token identifier.", { minimum: 1 }),
    s.nonEmptyString("Comma-separated Token Metrics token identifiers, such as 3375,3306."),
  ]),
  token_name: s.nonEmptyString("Comma-separated cryptocurrency names, such as Bitcoin,Ethereum."),
  symbol: s.nonEmptyString("Comma-separated token symbols, such as BTC,ETH."),
  slug: s.nonEmptyString("Comma-separated Token Metrics slugs, such as bitcoin,ethereum."),
};

const priceFilterFields = {
  token_id: tokenFilterFields.token_id,
};

const signalTokenFilterFields = {
  token_id: tokenFilterFields.token_id,
  symbol: tokenFilterFields.symbol,
};

const ohlcvTokenFilterFields = {
  token_id: tokenFilterFields.token_id,
  token_name: tokenFilterFields.token_name,
  symbol: tokenFilterFields.symbol,
};

const paginationFields = {
  page: s.integer("The one-based result page to return.", { minimum: 1 }),
  limit: s.integer("The maximum number of records to return on this page.", {
    minimum: 1,
    maximum: 100,
  }),
};

const extendedTokenFilterFields = {
  ...tokenFilterFields,
  category: s.nonEmptyString("Comma-separated Token Metrics category slugs, such as yield-farming,defi."),
  exchange: s.nonEmptyString("Comma-separated exchange slugs, such as binance,gate."),
  marketcap: optionalNumberOrString("The minimum market capitalization in US dollars."),
  volume: optionalNumberOrString("The minimum 24-hour trading volume in US dollars."),
  fdv: optionalNumberOrString("The minimum fully diluted valuation in US dollars."),
};

const extendedSignalFilterFields = {
  ...signalTokenFilterFields,
  category: extendedTokenFilterFields.category,
  exchange: extendedTokenFilterFields.exchange,
  marketcap: extendedTokenFilterFields.marketcap,
  volume: extendedTokenFilterFields.volume,
  fdv: extendedTokenFilterFields.fdv,
};

const dateRangeFields = {
  startDate: s.string("The first date to include, formatted as YYYY-MM-DD.", { format: "date" }),
  endDate: s.string("The last date to include, formatted as YYYY-MM-DD.", { format: "date" }),
};

const paginationSchema = s.looseObject("Pagination metadata returned by Token Metrics.", {
  total: s.integer("The total number of matching records."),
  total_pages: s.integer("The total number of result pages."),
  current_page: s.integer("The current one-based result page."),
  limit: s.integer("The page size used by Token Metrics."),
});

const tokenSchema = s.looseObject(
  "One native Token Metrics v2 token record. Uppercase identity and market fields are preserved exactly as returned by the endpoint.",
);

const priceSchema = s.looseObject(
  "One native Token Metrics v2 price record. Uppercase token and price fields are preserved exactly as returned by the endpoint.",
);

const tradingSignalSchema = s.looseObject(
  "One native Token Metrics v2 trading signal record. Uppercase token, date, and signal fields are preserved exactly as returned by the endpoint.",
);

const ohlcvSchema = s.looseObject(
  "One native Token Metrics v2 OHLCV record. Uppercase token, interval, price, and volume fields are preserved exactly as returned by the endpoint.",
);

function paginatedOutputSchema(description: string, itemDescription: string, item: JsonSchema) {
  return s.looseRequiredObject(
    description,
    {
      success: s.boolean("Whether Token Metrics completed the request successfully."),
      message: s.string("The status message returned by Token Metrics."),
      data: s.array(itemDescription, item),
      pagination: paginationSchema,
      length: s.integer("The number of records in the response when reported by Token Metrics."),
    },
    { optional: ["success", "message", "pagination", "length"] },
  );
}

const listTokensAction = defineProviderAction(service, {
  name: "list_tokens",
  operationType: "read",
  description: "List Token Metrics tokens and retrieve identifiers used by other market-data actions.",
  inputSchema: s.object("The filters and pagination for listing Token Metrics tokens.", {
    ...extendedTokenFilterFields,
    blockchain_address: s.nonEmptyString("A blockchain and contract address in blockchain:address form."),
    expand: s.nonEmptyString("Comma-separated related fields to expand, such as exchange_list,category_list."),
    ...paginationFields,
  }),
  outputSchema: paginatedOutputSchema(
    "The native Token Metrics token-list response.",
    "The token records returned by Token Metrics.",
    tokenSchema,
  ),
});

const getPricesAction = defineProviderAction(service, {
  name: "get_prices",
  operationType: "read",
  description: "Retrieve current Token Metrics price records for selected cryptocurrencies.",
  inputSchema: s.object("The token identifiers for retrieving current prices.", priceFilterFields),
  outputSchema: paginatedOutputSchema(
    "The native Token Metrics price response.",
    "The price records returned by Token Metrics.",
    priceSchema,
  ),
});

const listTopMarketCapTokensAction = defineProviderAction(service, {
  name: "list_top_market_cap_tokens",
  operationType: "read",
  description: "List cryptocurrencies ranked by market capitalization in Token Metrics.",
  inputSchema: s.object("The options for listing top market-cap tokens.", {
    top_k: s.integer("The number of top cryptocurrencies to return.", {
      minimum: 1,
      maximum: 1000,
    }),
    page: paginationFields.page,
    expand: s.nonEmptyString("Comma-separated related fields to expand, such as exchange_list,category_list."),
  }),
  outputSchema: paginatedOutputSchema(
    "The native Token Metrics top-market-cap response.",
    "The top market-cap token records returned by Token Metrics.",
    tokenSchema,
  ),
});

const listTradingSignalsAction = defineProviderAction(service, {
  name: "list_trading_signals",
  operationType: "read",
  description: "List Token Metrics long, short, or neutral trading signals with optional filters.",
  inputSchema: s.object("The filters and pagination for listing Token Metrics trading signals.", {
    ...extendedSignalFilterFields,
    ...dateRangeFields,
    signal: s.anyOf("The signal filter: 1 for bullish, -1 for bearish, or 0 for no signal.", [
      s.integer("The numeric signal filter.", { minimum: -1, maximum: 1 }),
      s.stringEnum("The string-form signal filter.", ["-1", "0", "1"]),
    ]),
    ...paginationFields,
  }),
  outputSchema: paginatedOutputSchema(
    "The native Token Metrics trading-signals response.",
    "The trading signal records returned by Token Metrics.",
    tradingSignalSchema,
  ),
});

const listHourlyOhlcvAction = defineProviderAction(service, {
  name: "list_hourly_ohlcv",
  operationType: "read",
  description: "List hourly open, high, low, close, and volume records from Token Metrics.",
  inputSchema: s.object("The filters and pagination for listing hourly OHLCV records.", {
    ...ohlcvTokenFilterFields,
    ...dateRangeFields,
    ...paginationFields,
  }),
  outputSchema: paginatedOutputSchema(
    "The native Token Metrics hourly OHLCV response.",
    "The hourly OHLCV records returned by Token Metrics.",
    ohlcvSchema,
  ),
});

const listDailyOhlcvAction = defineProviderAction(service, {
  name: "list_daily_ohlcv",
  operationType: "read",
  description: "List daily open, high, low, close, and volume records from Token Metrics.",
  inputSchema: s.object("The filters and pagination for listing daily OHLCV records.", {
    ...ohlcvTokenFilterFields,
    ...dateRangeFields,
    ...paginationFields,
  }),
  outputSchema: paginatedOutputSchema(
    "The native Token Metrics daily OHLCV response.",
    "The daily OHLCV records returned by Token Metrics.",
    ohlcvSchema,
  ),
});

export const tokenMetricsActions: ActionDefinition[] = [
  listTokensAction,
  getPricesAction,
  listTopMarketCapTokensAction,
  listTradingSignalsAction,
  listHourlyOhlcvAction,
  listDailyOhlcvAction,
];
