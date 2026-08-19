import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "twelve_data";

const nonEmpty = (description: string): JsonSchema => s.nonEmptyString(description);
const optionalSelector = {
  symbol: nonEmpty("The symbol ticker of the instrument."),
  figi: nonEmpty("The Financial Instrument Global Identifier (FIGI) of the instrument."),
  isin: nonEmpty("The International Securities Identification Number (ISIN) of the instrument."),
  cusip: nonEmpty("The CUSIP identifier of the instrument to request."),
};
const optionalFilters = {
  exchange: nonEmpty("The exchange where the instrument is traded."),
  micCode: nonEmpty("The Market Identifier Code (MIC) under ISO 10383."),
  country: nonEmpty("The country where the instrument is traded, using a country name or alpha code."),
  type: nonEmpty("The asset class of the instrument."),
};
const accessSchema = s.object(
  "The plan availability metadata returned by Twelve Data.",
  {
    global: s.string("The overall access tier for the symbol or exchange."),
    plan: s.string("The individual plan required for the symbol or exchange."),
    planBusiness: s.string("The business plan required for the symbol or exchange."),
  },
  { optional: ["global", "plan", "planBusiness"] },
);
const symbolSearchResultSchema = s.object(
  "A single symbol search match.",
  {
    symbol: s.string("The matched instrument symbol."),
    instrumentName: s.string("The matched instrument name."),
    exchange: s.string("The exchange where the instrument is traded."),
    micCode: s.string("The Market Identifier Code (MIC) of the exchange."),
    exchangeTimezone: s.string("The timezone where the exchange is located."),
    instrumentType: s.string("The matched instrument type."),
    country: s.string("The country of the matched exchange."),
    currency: s.string("The trading currency of the matched instrument."),
    access: accessSchema,
  },
  { optional: ["access"] },
);
const timeSeriesMetaSchema = s.object(
  "The metadata describing the requested time series.",
  {
    symbol: s.string("The instrument symbol."),
    interval: s.string("The interval between two consecutive data points."),
    currency: s.string("The trading currency of the instrument."),
    exchangeTimezone: s.string("The timezone of the exchange."),
    exchange: s.string("The exchange where the instrument is traded."),
    micCode: s.string("The Market Identifier Code (MIC) of the exchange."),
    type: s.string("The asset class of the instrument."),
  },
  { optional: ["currency", "exchangeTimezone", "exchange", "micCode", "type"] },
);
const timeSeriesValueSchema = s.object(
  "A single historical bar in the returned time series.",
  {
    datetime: s.string("The datetime when the bar was opened."),
    open: s.string("The opening price of the bar."),
    high: s.string("The highest price of the bar."),
    low: s.string("The lowest price of the bar."),
    close: s.string("The closing price of the bar."),
    volume: s.string("The trading volume of the bar."),
    previousClose: s.string("The previous bar close when previousClose is requested."),
  },
  { optional: ["volume", "previousClose"] },
);
const marketStateItemSchema = s.object("A single market state row.", {
  name: s.string("The exchange name."),
  code: s.string("The Market Identifier Code (MIC) of the exchange."),
  country: s.string("The country where the exchange is located."),
  isMarketOpen: s.boolean("Whether the exchange is currently open."),
  timeAfterOpen: s.string("The elapsed time since the market opened."),
  timeToOpen: s.string("The remaining time until the market opens."),
  timeToClose: s.string("The remaining time until the market closes."),
});
const latestPriceInput = s.actionInput(
  {
    ...optionalSelector,
    ...optionalFilters,
    prepost: s.boolean("Whether to include pre-market and post-market data when supported."),
    dp: s.integer("The number of decimal places for floating values.", { minimum: 0, maximum: 11 }),
  },
  [],
  "Input parameters for fetching the latest price of an instrument. Provide at least one of symbol, figi, isin, or cusip.",
);
const quoteInput = s.actionInput(
  {
    ...optionalSelector,
    ...optionalFilters,
    interval: nonEmpty("The interval of the quote."),
    volumeTimePeriod: s.integer("The number of periods used to calculate the average volume.", { minimum: 1 }),
    prepost: s.boolean("Whether to include pre-market and post-market data when supported."),
    eod: s.boolean("Whether to return the quote for the closed day."),
    rollingPeriod: s.integer("The number of hours used to calculate rolling change.", { minimum: 1, maximum: 168 }),
    dp: s.integer("The number of decimal places for floating values.", { minimum: 0, maximum: 11 }),
    timezone: nonEmpty("The output timezone, such as Exchange, UTC, or an IANA timezone name."),
  },
  [],
  "Input parameters for fetching a real-time quote snapshot. Provide at least one of symbol, figi, isin, or cusip.",
);
const timeSeriesInput = s.actionInput(
  {
    ...optionalSelector,
    ...optionalFilters,
    interval: nonEmpty("The interval between two consecutive time-series points."),
    outputSize: s.integer("The maximum number of time-series points to return.", { minimum: 1, maximum: 5000 }),
    prepost: s.boolean("Whether to include pre-market and post-market data when supported."),
    dp: s.integer("The number of decimal places for floating values.", { minimum: 0, maximum: 11 }),
    order: nonEmpty("The sorting order of the output."),
    timezone: nonEmpty("The output timezone, such as Exchange, UTC, or an IANA timezone name."),
    date: nonEmpty("An exact date or a human-readable value such as today or yesterday."),
    startDate: nonEmpty("The starting date or datetime for the historical selection window."),
    endDate: nonEmpty("The ending date or datetime for the historical selection window."),
    previousClose: s.boolean("Whether to include the previous bar close price in each returned value."),
    adjust: nonEmpty("The adjusting mode for prices."),
  },
  ["interval"],
  "Input parameters for fetching historical time series data. Provide at least one of symbol, figi, isin, or cusip.",
);
const profileOutput = s.object(
  "The company profile returned by Twelve Data.",
  {
    symbol: s.string("The ticker symbol of the company."),
    name: s.string("The company name."),
    exchange: s.string("The exchange where the company is listed."),
    micCode: s.string("The Market Identifier Code (MIC) of the exchange."),
    sector: s.string("The sector where the company operates."),
    industry: s.string("The industry where the company operates."),
    employees: s.integer("The number of company employees."),
    website: s.string("The company website."),
    description: s.string("The business description of the company."),
    type: s.string("The issue type of the stock."),
    ceo: s.string("The chief executive officer of the company."),
    address: s.string("The primary street address of the company."),
    address2: s.string("The secondary address line of the company."),
    city: s.string("The city of the company headquarters."),
    zip: s.string("The postal code of the company headquarters."),
    state: s.string("The state of the company headquarters."),
    country: s.string("The country of the company headquarters."),
    phone: s.string("The public phone number of the company."),
  },
  {
    optional: [
      "micCode",
      "sector",
      "industry",
      "employees",
      "website",
      "description",
      "type",
      "ceo",
      "address",
      "address2",
      "city",
      "zip",
      "state",
      "country",
      "phone",
    ],
  },
);

export const twelveDataActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "symbol_search",
    description: "Search financial instruments by symbol or name and return the most relevant matches.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        symbol: nonEmpty("The text to search, such as a symbol, ISIN, FIGI, or a partial instrument name."),
        outputSize: s.integer("The maximum number of matches to return.", { minimum: 1, maximum: 120 }),
        showPlan: s.boolean("Whether to include plan availability metadata for each matching instrument."),
      },
      ["symbol"],
      "Input parameters for searching symbols.",
    ),
    outputSchema: s.actionOutput(
      { data: s.array("The ordered list of symbol search matches.", symbolSearchResultSchema) },
      "The symbol search results returned by Twelve Data.",
    ),
  }),
  defineProviderAction(service, {
    name: "price",
    description: "Fetch the latest available market price for a specific instrument.",
    requiredScopes: [],
    inputSchema: latestPriceInput,
    outputSchema: s.actionOutput(
      { price: s.string("The latest available price for the instrument.") },
      "The latest price response.",
    ),
  }),
  defineProviderAction(service, {
    name: "quote",
    description: "Fetch a real-time quote snapshot with price, change, volume, and 52-week range fields.",
    requiredScopes: [],
    inputSchema: quoteInput,
    outputSchema: s.looseRequiredObject("The latest quote snapshot for the requested instrument.", {
      symbol: s.string("The instrument symbol."),
      name: s.string("The instrument name."),
      exchange: s.string("The exchange where the instrument is traded."),
      datetime: s.string("The datetime of the quote in the requested timezone."),
      timestamp: s.integer("The Unix timestamp of the returned bar."),
      open: s.string("The opening price of the returned bar."),
      high: s.string("The highest price of the returned bar."),
      low: s.string("The lowest price of the returned bar."),
      close: s.string("The closing price of the returned bar."),
    }),
  }),
  defineProviderAction(service, {
    name: "eod",
    description: "Fetch the end-of-day close price for a specific instrument.",
    requiredScopes: [],
    inputSchema: latestPriceInput,
    outputSchema: s.actionOutput(
      {
        symbol: s.string("The instrument symbol."),
        exchange: s.string("The exchange where the instrument is traded."),
        micCode: s.string("The Market Identifier Code (MIC) of the exchange."),
        currency: s.string("The trading currency of the instrument."),
        datetime: s.string("The end-of-day datetime returned by Twelve Data."),
        close: s.string("The end-of-day close price."),
      },
      "The end-of-day close snapshot.",
      ["symbol", "exchange", "datetime", "close"],
    ),
  }),
  defineProviderAction(service, {
    name: "time_series",
    description: "Fetch historical OHLCV time-series data with metadata for a specific instrument and interval.",
    requiredScopes: [],
    inputSchema: timeSeriesInput,
    outputSchema: s.actionOutput(
      {
        meta: timeSeriesMetaSchema,
        values: s.array("The chronological time series values.", timeSeriesValueSchema),
      },
      "The historical time series response.",
    ),
  }),
  defineProviderAction(service, {
    name: "stocks",
    description: "List stock symbols and metadata from the Twelve Data stock catalog with optional filters.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        ...optionalSelector,
        ...optionalFilters,
        cik: nonEmpty("The CIK identifier of the instrument."),
        showPlan: s.boolean("Whether to include plan availability metadata for each stock."),
        includeDelisted: s.boolean("Whether to include delisted identifiers."),
      },
      [],
      "Input parameters for querying the stock symbol catalog.",
    ),
    outputSchema: s.actionOutput(
      { data: s.array("The matching stock catalog entries.", s.looseObject("A single stock catalog entry.")) },
      "The stock catalog response.",
    ),
  }),
  defineProviderAction(service, {
    name: "forex_pairs",
    description: "List available forex pairs with base and quote currency metadata.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        symbol: nonEmpty("The forex pair symbol to filter by."),
        currencyBase: nonEmpty("The base currency code to filter by."),
        currencyQuote: nonEmpty("The quote currency code to filter by."),
      },
      [],
      "Input parameters for querying the forex pairs catalog.",
    ),
    outputSchema: s.actionOutput(
      { data: s.array("The matching forex pairs.", s.looseObject("A single forex pair catalog entry.")) },
      "The forex pairs catalog response.",
    ),
  }),
  defineProviderAction(service, {
    name: "exchanges",
    description: "List equity exchanges and their timezone and access metadata.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        type: nonEmpty("The asset class to filter exchanges by."),
        name: nonEmpty("The exchange name to filter by."),
        code: nonEmpty("The Market Identifier Code (MIC) to filter by."),
        country: nonEmpty("The country name or alpha code to filter exchanges by."),
        showPlan: s.boolean("Whether to include plan availability metadata for each exchange."),
      },
      [],
      "Input parameters for querying the exchanges catalog.",
    ),
    outputSchema: s.actionOutput(
      { data: s.array("The matching exchanges.", s.looseObject("A single exchange catalog entry.")) },
      "The exchanges catalog response.",
    ),
  }),
  defineProviderAction(service, {
    name: "market_state",
    description: "List the current open or closed state of exchanges together with timing data.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        exchange: nonEmpty("The exchange name to filter by."),
        code: nonEmpty("The Market Identifier Code (MIC) to filter by."),
        country: nonEmpty("The country name or alpha code to filter exchanges by."),
      },
      [],
      "Input parameters for querying current market state.",
    ),
    outputSchema: s.array("The current market state response.", marketStateItemSchema),
  }),
  defineProviderAction(service, {
    name: "earliest_timestamp",
    description: "Fetch the earliest available historical timestamp for an instrument at a given interval.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        ...optionalSelector,
        interval: nonEmpty("The interval between two consecutive time-series points."),
        exchange: nonEmpty("The exchange where the instrument is traded."),
        micCode: nonEmpty("The Market Identifier Code (MIC) of the exchange."),
        timezone: nonEmpty("The output timezone, such as Exchange, UTC, or an IANA timezone name."),
      },
      ["interval"],
      "Input parameters for querying the earliest available timestamp. Provide at least one of symbol, figi, isin, or cusip.",
    ),
    outputSchema: s.actionOutput(
      {
        datetime: s.string("The earliest available datetime for the instrument."),
        unixTime: s.integer("The earliest datetime converted to Unix time."),
      },
      "The earliest available timestamp for the requested instrument.",
    ),
  }),
  defineProviderAction(service, {
    name: "profile",
    description: "Fetch the company profile for an instrument, including sector and contact fields.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        ...optionalSelector,
        exchange: nonEmpty("The exchange where the instrument is traded."),
        micCode: nonEmpty("The Market Identifier Code (MIC) of the exchange."),
        country: nonEmpty("The country where the instrument is traded, using a country name or alpha code."),
      },
      [],
      "Input parameters for fetching a company profile. Provide at least one of symbol, figi, isin, or cusip.",
    ),
    outputSchema: profileOutput,
  }),
  defineProviderAction(service, {
    name: "market_movers",
    description: "Fetch the top gaining or losing instruments for a market family such as stocks, forex, or crypto.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        market: nonEmpty("The market family, such as stocks, forex, or crypto."),
        direction: nonEmpty("The direction of the snapshot, such as gainers or losers."),
        outputSize: s.integer("The number of market mover rows to return.", { minimum: 1, maximum: 50 }),
        country: nonEmpty("The country name or alpha code, applicable to non-currency markets."),
        priceGreaterThan: s.number("A minimum last price threshold for returned instruments."),
        dp: s.integer("The number of decimal places for floating values.", { minimum: 0, maximum: 11 }),
      },
      ["market"],
      "Input parameters for fetching current market movers.",
    ),
    outputSchema: s.actionOutput(
      { values: s.array("The ranked market mover rows.", s.looseObject("A single market mover entry.")) },
      "The market movers response.",
    ),
  }),
];
