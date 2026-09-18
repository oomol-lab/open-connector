import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "polygon_io";

const tickerSchema = s.string("The case-sensitive ticker symbol, for example AAPL.", {
  minLength: 1,
});
const optionalTextSchema = (description: string) =>
  s.string(description, {
    minLength: 1,
  });
const dateOrTimestampSchema = s.string("A date in YYYY-MM-DD format or a millisecond timestamp.", {
  minLength: 1,
});
const orderSchema = s.stringEnum("The order used when sorting returned results.", ["asc", "desc"]);
const limitSchema = s.integer("The maximum number of results to return.", {
  minimum: 1,
  maximum: 50000,
});
const tickerListLimitSchema = s.integer("The maximum number of ticker results to return.", {
  minimum: 1,
  maximum: 1000,
});
const timespanSchema = s.stringEnum("The aggregate bar time window.", [
  "second",
  "minute",
  "hour",
  "day",
  "week",
  "month",
  "quarter",
  "year",
]);

const responseMetaSchema = s.object("Common response metadata returned by the Polygon.io REST API.", {
  status: s.nullable(s.string("The response status returned by Polygon.io.")),
  requestId: s.nullable(s.string("The request identifier assigned by Polygon.io.")),
  count: s.nullable(s.integer("The count value returned by Polygon.io when present.")),
});

const cursorPageSchema = s.object("Cursor pagination information returned by Polygon.io.", {
  nextUrl: s.nullable(s.string("The next page URL returned by Polygon.io when present.")),
  nextCursor: s.nullable(s.string("The cursor extracted from nextUrl when present.")),
});

const tickerSummarySchema = s.object("A normalized ticker summary returned by Polygon.io.", {
  ticker: s.nullable(s.string("The exchange symbol that this asset is traded under.")),
  name: s.nullable(s.string("The asset name returned by Polygon.io.")),
  market: s.nullable(s.string("The market type for the asset.")),
  locale: s.nullable(s.string("The locale for the asset.")),
  active: s.nullable(s.boolean("Whether the asset is actively traded.")),
  type: s.nullable(s.string("The ticker type code.")),
  currencyName: s.nullable(s.string("The currency name returned by Polygon.io.")),
  currencySymbol: s.nullable(s.string("The currency symbol returned by Polygon.io.")),
  baseCurrencyName: s.nullable(s.string("The base currency name for crypto or FX assets.")),
  baseCurrencySymbol: s.nullable(s.string("The base currency symbol for crypto or FX assets.")),
  cik: s.nullable(s.string("The Central Index Key for this ticker when present.")),
  compositeFigi: s.nullable(s.string("The composite OpenFIGI identifier.")),
  shareClassFigi: s.nullable(s.string("The share class OpenFIGI identifier.")),
  primaryExchange: s.nullable(s.string("The primary exchange MIC for this asset.")),
  lastUpdatedUtc: s.nullable(s.string("The timestamp through which this ticker information is accurate.")),
  delistedUtc: s.nullable(s.string("The last date that the asset was traded when present.")),
  raw: s.looseObject("The raw ticker object returned by Polygon.io."),
});

const addressSchema = s.object("Company headquarters address details returned by Polygon.io.", {
  address1: s.nullable(s.string("The first address line.")),
  city: s.nullable(s.string("The city name.")),
  state: s.nullable(s.string("The state value.")),
  postalCode: s.nullable(s.string("The postal code.")),
});

const brandingSchema = s.object("Company branding asset URLs returned by Polygon.io.", {
  iconUrl: s.nullable(s.string("The company icon URL.")),
  logoUrl: s.nullable(s.string("The company logo URL.")),
});

const tickerDetailsSchema = s.object("Detailed ticker information returned by Polygon.io.", {
  ticker: s.nullable(s.string("The exchange symbol that this asset is traded under.")),
  name: s.nullable(s.string("The asset name returned by Polygon.io.")),
  market: s.nullable(s.string("The market type for the asset.")),
  locale: s.nullable(s.string("The locale for the asset.")),
  active: s.nullable(s.boolean("Whether the asset is actively traded.")),
  type: s.nullable(s.string("The ticker type code.")),
  currencyName: s.nullable(s.string("The currency name returned by Polygon.io.")),
  cik: s.nullable(s.string("The Central Index Key for this ticker when present.")),
  compositeFigi: s.nullable(s.string("The composite OpenFIGI identifier.")),
  shareClassFigi: s.nullable(s.string("The share class OpenFIGI identifier.")),
  primaryExchange: s.nullable(s.string("The primary exchange MIC for this asset.")),
  description: s.nullable(s.string("The company or asset description.")),
  homepageUrl: s.nullable(s.string("The company's homepage URL.")),
  listDate: s.nullable(s.string("The date that the symbol was first publicly listed.")),
  marketCap: s.nullable(s.number("The market capitalization value when present.")),
  phoneNumber: s.nullable(s.string("The company phone number.")),
  roundLot: s.nullable(s.number("The round lot size for this security.")),
  shareClassSharesOutstanding: s.nullable(s.number("The outstanding share count for this share class.")),
  sicCode: s.nullable(s.string("The Standard Industrial Classification code.")),
  sicDescription: s.nullable(s.string("The Standard Industrial Classification description.")),
  tickerRoot: s.nullable(s.string("The root symbol for tickers with suffixes.")),
  tickerSuffix: s.nullable(s.string("The ticker suffix when present.")),
  totalEmployees: s.nullable(s.number("The approximate employee count.")),
  weightedSharesOutstanding: s.nullable(s.number("The weighted shares outstanding value.")),
  address: s.nullable(addressSchema),
  branding: s.nullable(brandingSchema),
  raw: s.looseObject("The raw ticker details object returned by Polygon.io."),
});

const aggregateBarSchema = s.object("A normalized OHLC aggregate bar returned by Polygon.io.", {
  ticker: s.nullable(s.string("The ticker symbol for this aggregate bar when present.")),
  open: s.nullable(s.number("The open price for the aggregate window.")),
  high: s.nullable(s.number("The high price for the aggregate window.")),
  low: s.nullable(s.number("The low price for the aggregate window.")),
  close: s.nullable(s.number("The close price for the aggregate window.")),
  volume: s.nullable(s.number("The trading volume for the aggregate window.")),
  vwap: s.nullable(s.number("The volume weighted average price.")),
  timestamp: s.nullable(s.integer("The Unix millisecond timestamp for the aggregate window.")),
  transactions: s.nullable(s.integer("The transaction count for the aggregate window.")),
  otc: s.nullable(s.boolean("Whether the aggregate is for an OTC ticker when reported.")),
  raw: s.looseObject("The raw aggregate bar object returned by Polygon.io."),
});

const aggregateResponseSchema = s.object("The response returned for Polygon.io aggregate bars.", {
  meta: responseMetaSchema,
  ticker: s.nullable(s.string("The ticker symbol returned by Polygon.io.")),
  adjusted: s.nullable(s.boolean("Whether the response was adjusted for splits.")),
  queryCount: s.nullable(s.integer("The number of base aggregates queried.")),
  resultsCount: s.nullable(s.integer("The total number of results for the request.")),
  bars: s.array("The aggregate bars returned by Polygon.io.", aggregateBarSchema),
  page: cursorPageSchema,
});

const exchangeSchema = s.object("A normalized exchange returned by Polygon.io.", {
  id: s.nullable(s.integer("The Polygon.io exchange identifier.")),
  type: s.nullable(s.string("The exchange type returned by Polygon.io.")),
  assetClass: s.nullable(s.string("The asset class for this exchange.")),
  locale: s.nullable(s.string("The locale for this exchange.")),
  name: s.nullable(s.string("The exchange name.")),
  acronym: s.nullable(s.string("The exchange acronym.")),
  mic: s.nullable(s.string("The Market Identifier Code for this exchange.")),
  operatingMic: s.nullable(s.string("The MIC for the entity that operates this exchange.")),
  participantId: s.nullable(s.string("The participant identifier used by SIPs.")),
  url: s.nullable(s.string("The exchange website URL when present.")),
  raw: s.looseObject("The raw exchange object returned by Polygon.io."),
});

const tickerTypeSchema = s.object("A normalized ticker type returned by Polygon.io.", {
  code: s.nullable(s.string("The ticker type code used by Polygon.io.")),
  description: s.nullable(s.string("The ticker type description.")),
  assetClass: s.nullable(s.string("The asset class for this ticker type.")),
  locale: s.nullable(s.string("The locale for this ticker type.")),
  raw: s.looseObject("The raw ticker type object returned by Polygon.io."),
});

export const polygonIoActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_tickers",
    operationType: "read",
    description: "List ticker symbols supported by Polygon.io with optional filters.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for listing Polygon.io tickers.",
      {
        ticker: optionalTextSchema("Filter by an exact ticker symbol."),
        type: optionalTextSchema("Filter by ticker type such as CS or ETF."),
        market: optionalTextSchema("Filter by market type such as stocks, crypto, fx, otc, or indices."),
        exchange: optionalTextSchema("Filter by primary exchange Market Identifier Code."),
        cusip: optionalTextSchema("Filter by CUSIP code. Polygon.io does not return CUSIP in responses."),
        cik: optionalTextSchema("Filter by Central Index Key."),
        date: s.date("Retrieve tickers available on this date."),
        search: optionalTextSchema("Search terms within the ticker and company name."),
        active: s.boolean("Whether returned tickers should be actively traded on the queried date."),
        tickerGte: optionalTextSchema("Return tickers greater than or equal to this ticker."),
        tickerGt: optionalTextSchema("Return tickers greater than this ticker."),
        tickerLte: optionalTextSchema("Return tickers less than or equal to this ticker."),
        tickerLt: optionalTextSchema("Return tickers less than this ticker."),
        order: orderSchema,
        limit: tickerListLimitSchema,
        sort: optionalTextSchema("Sort field used for ordering."),
        cursor: optionalTextSchema("Pagination cursor extracted from a previous response nextCursor value."),
      },
      {
        optional: [
          "ticker",
          "type",
          "market",
          "exchange",
          "cusip",
          "cik",
          "date",
          "search",
          "active",
          "tickerGte",
          "tickerGt",
          "tickerLte",
          "tickerLt",
          "order",
          "limit",
          "sort",
          "cursor",
        ],
      },
    ),
    outputSchema: s.object("The response returned when listing Polygon.io tickers.", {
      meta: responseMetaSchema,
      tickers: s.array("The tickers returned by Polygon.io.", tickerSummarySchema),
      page: cursorPageSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_ticker_details",
    operationType: "read",
    description: "Get comprehensive details for a single Polygon.io ticker.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for retrieving Polygon.io ticker details.",
      {
        ticker: tickerSchema,
        date: s.date("Retrieve ticker details available on this date."),
      },
      { optional: ["date"] },
    ),
    outputSchema: s.object("The response returned for Polygon.io ticker details.", {
      meta: responseMetaSchema,
      ticker: tickerDetailsSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_previous_day_bar",
    operationType: "read",
    description: "Get the previous trading day's OHLC aggregate bar for a stock ticker.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for retrieving a previous day stock bar.",
      {
        ticker: tickerSchema,
        adjusted: s.boolean("Whether the results should be adjusted for splits."),
      },
      { optional: ["adjusted"] },
    ),
    outputSchema: aggregateResponseSchema,
  }),
  defineProviderAction(service, {
    name: "get_aggregate_bars",
    operationType: "read",
    description: "Get historical OHLC aggregate bars for a stock ticker over a custom range.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for retrieving custom aggregate stock bars.",
      {
        ticker: tickerSchema,
        multiplier: s.positiveInteger("The size multiplier for the timespan."),
        timespan: timespanSchema,
        from: dateOrTimestampSchema,
        to: dateOrTimestampSchema,
        adjusted: s.boolean("Whether the results should be adjusted for splits."),
        sort: orderSchema,
        limit: limitSchema,
      },
      { optional: ["adjusted", "sort", "limit"] },
    ),
    outputSchema: aggregateResponseSchema,
  }),
  defineProviderAction(service, {
    name: "list_exchanges",
    operationType: "read",
    description: "List known exchanges available through Polygon.io.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for listing Polygon.io exchanges.",
      {
        assetClass: optionalTextSchema("Filter by asset class such as stocks, options, crypto, fx, or futures."),
        locale: optionalTextSchema("Filter by exchange locale such as us or global."),
      },
      { optional: ["assetClass", "locale"] },
    ),
    outputSchema: s.object("The response returned when listing Polygon.io exchanges.", {
      meta: responseMetaSchema,
      exchanges: s.array("The exchanges returned by Polygon.io.", exchangeSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_ticker_types",
    operationType: "read",
    description: "List ticker type codes supported by Polygon.io.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for listing Polygon.io ticker types.",
      {
        assetClass: optionalTextSchema("Filter by asset class such as stocks, options, crypto, fx, or indices."),
        locale: optionalTextSchema("Filter by ticker type locale such as us or global."),
      },
      { optional: ["assetClass", "locale"] },
    ),
    outputSchema: s.object("The response returned when listing Polygon.io ticker types.", {
      meta: responseMetaSchema,
      tickerTypes: s.array("The ticker types returned by Polygon.io.", tickerTypeSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_market_status",
    operationType: "read",
    description: "Get the current Polygon.io market status for stocks, currencies, and indices.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for retrieving Polygon.io market status.", {}),
    outputSchema: s.object("The current market status returned by Polygon.io.", {
      meta: responseMetaSchema,
      market: s.nullable(s.string("The overall market status.")),
      serverTime: s.nullable(s.string("The server time returned by Polygon.io.")),
      afterHours: s.nullable(s.boolean("Whether the market is in post-market hours.")),
      earlyHours: s.nullable(s.boolean("Whether the market is in pre-market hours.")),
      exchanges: s.record("Status values keyed by exchange name.", s.string("A market status value.")),
      currencies: s.record("Status values keyed by currency market name.", s.string("A market status value.")),
      indicesGroups: s.record("Status values keyed by index group name.", s.string("A market status value.")),
      raw: s.looseObject("The raw market status object returned by Polygon.io."),
    }),
  }),
];
