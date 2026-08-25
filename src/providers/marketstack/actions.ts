import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "marketstack";

const sortSchema = s.stringEnum("Sort order for EOD results.", ["ASC", "DESC"]);
const paginationSchema = s.object("Pagination information returned by Marketstack.", {
  count: s.integer("Number of results returned on the current page."),
  limit: s.integer("Requested page size."),
  total: s.integer("Total number of results available."),
  offset: s.integer("Number of leading results skipped before this page."),
});

const stockExchangeSchema = s.object("Normalized stock exchange summary.", {
  mic: s.nullableString("Market identifier code of the exchange."),
  name: s.nullableString("Display name of the exchange."),
  acronym: s.nullableString("Exchange acronym."),
});

const tickerSummarySchema = s.object("Normalized Marketstack ticker summary.", {
  name: s.nullableString("Company or instrument name."),
  ticker: s.nullableString("Ticker symbol."),
  hasEod: s.nullableBoolean("Whether end-of-day data is available for the ticker."),
  hasIntraday: s.nullableBoolean("Whether intraday data is available for the ticker."),
  stockExchange: s.nullable(stockExchangeSchema),
});

const listTickersOutputSchema = s.object("Ticker list response returned by Marketstack.", {
  tickers: s.array("Ticker results returned by Marketstack.", tickerSummarySchema),
  pagination: paginationSchema,
});

const addressSchema = s.object("Normalized postal address returned by Marketstack.", {
  city: s.nullableString("City name."),
  street1: s.nullableString("Primary street address line."),
  street2: s.nullableString("Secondary street address line."),
  postalCode: s.nullableString("Postal code."),
  stateOrCountry: s.nullableString("State or country code."),
  stateOrCountryDescription: s.nullableString("Full state or country name."),
});

const tickerInfoSchema = s.object("Normalized Marketstack ticker information.", {
  name: s.nullableString("Company or instrument name."),
  ticker: s.nullableString("Ticker symbol."),
  exchangeCode: s.nullableString("Exchange code returned by Marketstack."),
  website: s.nullableString("Company website URL."),
  sector: s.nullableString("Sector returned by Marketstack."),
  industry: s.nullableString("Industry returned by Marketstack."),
  address: s.nullable(addressSchema),
});

const eodSchema = s.object("Normalized Marketstack end-of-day price row.", {
  open: s.nullableNumber("Opening price for the trading session."),
  high: s.nullableNumber("Highest price for the trading session."),
  low: s.nullableNumber("Lowest price for the trading session."),
  close: s.nullableNumber("Closing price for the trading session."),
  volume: s.nullableNumber("Traded volume for the trading session."),
  date: s.nullableString("Timestamp returned by Marketstack for the data point."),
  symbol: s.nullableString("Ticker symbol."),
  exchange: s.nullableString("Exchange name or code returned by Marketstack."),
  exchangeCode: s.nullableString("Exchange MIC or exchange code returned by Marketstack."),
  name: s.nullableString("Company or instrument name."),
  adjOpen: s.nullableNumber("Adjusted opening price."),
  adjHigh: s.nullableNumber("Adjusted high price."),
  adjLow: s.nullableNumber("Adjusted low price."),
  adjClose: s.nullableNumber("Adjusted closing price."),
  adjVolume: s.nullableNumber("Adjusted traded volume."),
  dividend: s.nullableNumber("Dividend amount included in the EOD payload."),
  splitFactor: s.nullableNumber("Split factor included in the EOD payload."),
  assetType: s.nullableString("Asset type returned by Marketstack."),
  priceCurrency: s.nullableString("Price currency returned by Marketstack."),
});

const exchangeSchema = s.object("Normalized stock exchange returned by Marketstack.", {
  mic: s.nullableString("Market identifier code of the exchange."),
  acronym: s.nullableString("Exchange acronym."),
  name: s.nullableString("Exchange display name."),
  city: s.nullableString("City where the exchange is located."),
  country: s.nullableString("Country where the exchange is located."),
  countryCode: s.nullableString("ISO country code of the exchange."),
  currency: s.nullableString("Settlement currency of the exchange."),
  website: s.nullableString("Exchange website URL."),
  exchangeStatus: s.nullableString("Current exchange status."),
  operatingMic: s.nullableString("Operating market identifier code."),
});

const currencySchema = s.object("Normalized currency returned by Marketstack.", {
  code: s.nullableString("Currency code."),
  name: s.nullableString("Currency display name."),
  symbol: s.nullableString("Currency symbol."),
  symbolNative: s.nullableString("Native currency symbol."),
});

export const marketstackActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_tickers",
    description: "List Marketstack tickers with optional search, exchange, and pagination filters.",
    inputSchema: s.object(
      "Input parameters for listing Marketstack tickers.",
      {
        limit: s.integer("Maximum number of tickers to return.", { minimum: 1, maximum: 1000 }),
        offset: s.nonNegativeInteger("Number of leading ticker results to skip."),
        search: s.nonEmptyString("Search term used to filter tickers by name or symbol."),
        exchange: s.nonEmptyString("Exchange MIC used to filter the returned tickers."),
      },
      { optional: ["limit", "offset", "search", "exchange"] },
    ),
    outputSchema: listTickersOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_ticker_info",
    description: "Get profile information for a single Marketstack ticker.",
    inputSchema: s.object("Input parameters for retrieving Marketstack ticker information.", {
      ticker: s.nonEmptyString("Ticker symbol used to retrieve company information."),
    }),
    outputSchema: s.object("Ticker information response returned by Marketstack.", {
      ticker: tickerInfoSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_latest_eod",
    description: "Get the latest available end-of-day data for a single Marketstack symbol.",
    inputSchema: s.object(
      "Input parameters for retrieving the latest Marketstack EOD row.",
      {
        symbol: s.nonEmptyString("Ticker symbol used to retrieve the latest end-of-day row."),
        exchange: s.nonEmptyString("Exchange MIC used to narrow the symbol lookup."),
      },
      { optional: ["exchange"] },
    ),
    outputSchema: s.object("Latest end-of-day response returned by Marketstack.", {
      eod: eodSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_historical_eod",
    description: "Get historical end-of-day data from Marketstack for one or more comma-separated symbols.",
    inputSchema: s.object(
      "Input parameters for retrieving historical Marketstack EOD rows.",
      {
        symbols: s.nonEmptyString("One or more comma-separated ticker symbols."),
        exchange: s.nonEmptyString("Exchange MIC used to filter the returned rows."),
        dateFrom: s.date("Start date in YYYY-MM-DD format."),
        dateTo: s.date("End date in YYYY-MM-DD format."),
        sort: sortSchema,
        limit: s.integer("Maximum number of EOD rows to return.", { minimum: 1, maximum: 1000 }),
        offset: s.nonNegativeInteger("Number of leading EOD rows to skip."),
      },
      { optional: ["exchange", "dateFrom", "dateTo", "sort", "limit", "offset"] },
    ),
    outputSchema: s.object("Historical end-of-day response returned by Marketstack.", {
      eod: s.array("Historical end-of-day rows returned by Marketstack.", eodSchema),
      pagination: paginationSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_exchanges",
    description: "List stock exchanges available through Marketstack.",
    inputSchema: s.object(
      "Input parameters for listing Marketstack exchanges.",
      {
        search: s.nonEmptyString("Search term used to filter exchanges by name or acronym."),
        limit: s.integer("Maximum number of exchanges to return.", { minimum: 1, maximum: 1000 }),
        offset: s.nonNegativeInteger("Number of leading exchange results to skip."),
      },
      { optional: ["search", "limit", "offset"] },
    ),
    outputSchema: s.object("Exchange list response returned by Marketstack.", {
      exchanges: s.array("Stock exchanges returned by Marketstack.", exchangeSchema),
      pagination: paginationSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_currencies",
    description: "List currencies available through Marketstack.",
    inputSchema: s.object(
      "Input parameters for listing Marketstack currencies.",
      {
        limit: s.integer("Maximum number of currencies to return.", { minimum: 1, maximum: 1000 }),
        offset: s.nonNegativeInteger("Number of leading currency results to skip."),
      },
      { optional: ["limit", "offset"] },
    ),
    outputSchema: s.object("Currency list response returned by Marketstack.", {
      currencies: s.array("Currencies returned by Marketstack.", currencySchema),
      pagination: paginationSchema,
    }),
  }),
];
