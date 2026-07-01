import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "alpha_vantage";

function nonEmptyString(description: string): JsonSchema {
  return s.string(description, { minLength: 1 });
}

const outputSizeSchema = s.stringEnum(
  "The amount of historical data to return. Use compact for the latest 100 data points or full for the complete history.",
  ["compact", "full"],
);

const datatypeSchema = s.stringEnum("The response format requested from Alpha Vantage.", [
  "json",
  "csv",
]);

const intradayIntervalSchema = s.stringEnum("The intraday interval between data points.", [
  "1min",
  "5min",
  "15min",
  "30min",
  "60min",
]);

const intervalSchema = s.stringEnum("The time interval between data points.", [
  "1min",
  "5min",
  "15min",
  "30min",
  "60min",
  "daily",
  "weekly",
  "monthly",
]);

const seriesTypeSchema = s.stringEnum("The price series to use for the calculation.", [
  "close",
  "open",
  "high",
  "low",
]);

const rawJsonOutputSchema = s.object("The raw response returned by Alpha Vantage.", {
  data: s.unknown("The parsed JSON payload or raw text/CSV payload returned by Alpha Vantage."),
});

const rawTextOutputSchema = s.object("The raw text response returned by Alpha Vantage.", {
  data: s.string("The raw Alpha Vantage text or CSV payload."),
});

const symbolSearchMatchSchema = s.object("A single symbol search match.", {
  symbol: s.string("The matched ticker symbol."),
  name: s.string("The full company or fund name."),
  type: s.string("The instrument type returned by Alpha Vantage."),
  region: s.string("The region where the instrument trades."),
  marketOpen: s.string("The local market open time."),
  marketClose: s.string("The local market close time."),
  timezone: s.string("The market timezone label returned by Alpha Vantage."),
  currency: s.string("The trading currency."),
  matchScore: s.string("The string match score returned by Alpha Vantage."),
});

const symbolSearchOutputSchema = s.object("The symbol search response.", {
  matches: s.array("The ordered list of matching symbols.", symbolSearchMatchSchema),
});

const globalQuoteOutputSchema = s.object("The normalized global quote response.", {
  symbol: s.string("The ticker symbol returned by Alpha Vantage."),
  open: s.string("The opening price for the latest trading session."),
  high: s.string("The highest price for the latest trading session."),
  low: s.string("The lowest price for the latest trading session."),
  price: s.string("The latest available price."),
  volume: s.string("The latest trading volume."),
  latestTradingDay: s.string(
    "The latest trading day in YYYY-MM-DD format returned by Alpha Vantage.",
  ),
  previousClose: s.string("The previous closing price."),
  change: s.string("The absolute price change versus the previous close."),
  changePercent: s.string("The percentage price change versus the previous close."),
});

const timeSeriesMetaSchema = s.object(
  "The metadata returned for an Alpha Vantage time series response.",
  {
    seriesType: s.stringEnum("The Alpha Vantage time series family represented by this response.", [
      "daily",
      "weekly",
      "monthly",
    ]),
    information: s.string("The summary text returned in the Meta Data block."),
    symbol: s.string("The ticker symbol that was queried."),
    lastRefreshed: s.string("The last refresh timestamp returned by Alpha Vantage."),
    outputSize: s.string("The output size returned by Alpha Vantage when the endpoint exposes it."),
    timeZone: s.string("The time zone returned in the Meta Data block."),
  },
  { optional: ["outputSize"] },
);

const timeSeriesValueSchema = s.object("A single OHLCV record from Alpha Vantage.", {
  timestamp: s.string("The trading day associated with this OHLCV record."),
  open: s.string("The open price for the period."),
  high: s.string("The high price for the period."),
  low: s.string("The low price for the period."),
  close: s.string("The close price for the period."),
  volume: s.string("The traded volume for the period."),
});

const timeSeriesOutputSchema = s.object("The normalized Alpha Vantage time series response.", {
  meta: timeSeriesMetaSchema,
  values: s.array("The ordered list of OHLCV records.", timeSeriesValueSchema),
});

const marketStatusSchema = s.object("A single market status row.", {
  marketType: s.string("The market type such as Equity, Forex, or Cryptocurrency."),
  region: s.string("The region for the market."),
  primaryExchanges: s.string("The primary exchanges covered by this market row."),
  localOpen: s.string("The local market open time."),
  localClose: s.string("The local market close time."),
  currentStatus: s.string("The current status such as open or closed."),
  notes: s.string("Additional notes returned by Alpha Vantage for this market."),
});

const marketStatusOutputSchema = s.object("The global market status response.", {
  endpoint: s.string("The endpoint label returned by Alpha Vantage."),
  markets: s.array("The list of market status rows.", marketStatusSchema),
});

const fromToCurrencyInputSchema = s.object(
  "The input for an Alpha Vantage currency pair request.",
  {
    fromSymbol: nonEmptyString("The base currency code, such as USD or BTC."),
    toSymbol: nonEmptyString("The quote currency code, such as EUR or USD."),
  },
);

const stockSymbolInputSchema = s.object("The input for an Alpha Vantage stock symbol request.", {
  symbol: nonEmptyString("The stock symbol to query, such as IBM or TSCO.LON."),
});

const csvCalendarInputSchema = s.object(
  "The input for an Alpha Vantage CSV calendar request.",
  {
    symbol: nonEmptyString("The optional stock symbol used to filter the calendar."),
    horizon: s.stringEnum("The calendar horizon to request.", ["3month", "6month", "12month"]),
  },
  { optional: ["symbol", "horizon"] },
);

export const alphaVantageActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "search_symbols",
    description:
      "Search supported stocks, ETFs, and mutual funds by keyword and return the best matching symbols.",
    requiredScopes: [],
    inputSchema: s.object("The input for searching supported symbols.", {
      keywords: nonEmptyString("The company name, ticker fragment, or keyword to search for."),
    }),
    outputSchema: symbolSearchOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_global_quote",
    description:
      "Retrieve the latest end-of-day quote snapshot for a single stock symbol from Alpha Vantage.",
    requiredScopes: [],
    inputSchema: stockSymbolInputSchema,
    outputSchema: globalQuoteOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_intraday_time_series",
    description:
      "Retrieve raw intraday OHLCV time series data for a stock symbol from Alpha Vantage.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input for retrieving an intraday stock time series.",
      {
        symbol: nonEmptyString("The stock symbol to query, such as IBM or TSCO.LON."),
        interval: intradayIntervalSchema,
        adjusted: s.boolean("Whether to request adjusted intraday values."),
        extendedHours: s.boolean("Whether to include extended-hours trading data."),
        month: s.string("The optional month in YYYY-MM format for historical intraday data."),
        outputSize: outputSizeSchema,
        datatype: datatypeSchema,
      },
      { optional: ["adjusted", "extendedHours", "month", "outputSize", "datatype"] },
    ),
    outputSchema: rawJsonOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_daily_time_series",
    description:
      "Retrieve the raw daily OHLCV time series for a single stock symbol from Alpha Vantage.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input for retrieving the daily time series.",
      {
        symbol: nonEmptyString("The stock symbol to query, such as IBM or TSCO.LON."),
        outputSize: outputSizeSchema,
      },
      { optional: ["outputSize"] },
    ),
    outputSchema: timeSeriesOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_daily_adjusted_time_series",
    description:
      "Retrieve raw daily adjusted OHLCV, dividend, and split data for a stock symbol from Alpha Vantage.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input for retrieving the daily adjusted time series.",
      {
        symbol: nonEmptyString("The stock symbol to query, such as IBM or TSCO.LON."),
        outputSize: outputSizeSchema,
        datatype: datatypeSchema,
      },
      { optional: ["outputSize", "datatype"] },
    ),
    outputSchema: rawJsonOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_weekly_time_series",
    description:
      "Retrieve the raw weekly OHLCV time series for a single stock symbol from Alpha Vantage.",
    requiredScopes: [],
    inputSchema: stockSymbolInputSchema,
    outputSchema: timeSeriesOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_weekly_adjusted_time_series",
    description:
      "Retrieve raw weekly adjusted OHLCV and dividend data for a stock symbol from Alpha Vantage.",
    requiredScopes: [],
    inputSchema: stockSymbolInputSchema,
    outputSchema: rawJsonOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_monthly_time_series",
    description:
      "Retrieve the raw monthly OHLCV time series for a single stock symbol from Alpha Vantage.",
    requiredScopes: [],
    inputSchema: stockSymbolInputSchema,
    outputSchema: timeSeriesOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_monthly_adjusted_time_series",
    description:
      "Retrieve raw monthly adjusted OHLCV and dividend data for a stock symbol from Alpha Vantage.",
    requiredScopes: [],
    inputSchema: stockSymbolInputSchema,
    outputSchema: rawJsonOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_realtime_bulk_quotes",
    description: "Retrieve raw realtime bulk quotes for up to 100 stock symbols.",
    requiredScopes: [],
    inputSchema: s.object("The input for retrieving realtime bulk quotes.", {
      symbols: nonEmptyString("A comma-separated list of stock symbols, such as MSFT,AAPL,IBM."),
    }),
    outputSchema: rawJsonOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_top_gainers_losers",
    description: "Retrieve the raw Alpha Vantage top gainers, losers, and most active stocks.",
    requiredScopes: [],
    inputSchema: s.object("The input for retrieving top gainers and losers.", {}),
    outputSchema: rawJsonOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_market_status",
    description:
      "Retrieve the current open or closed status for major equity, forex, and cryptocurrency markets.",
    requiredScopes: [],
    inputSchema: s.object("The input for retrieving the global market status.", {}),
    outputSchema: marketStatusOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_currency_exchange_rate",
    description: "Retrieve the raw realtime exchange rate for a currency pair.",
    requiredScopes: [],
    inputSchema: fromToCurrencyInputSchema,
    outputSchema: rawJsonOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_fx_intraday",
    description: "Retrieve raw intraday forex OHLC data for a currency pair.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input for retrieving intraday forex data.",
      {
        fromSymbol: nonEmptyString("The base currency code, such as EUR."),
        toSymbol: nonEmptyString("The quote currency code, such as USD."),
        interval: intradayIntervalSchema,
        outputSize: outputSizeSchema,
        datatype: datatypeSchema,
      },
      { optional: ["outputSize", "datatype"] },
    ),
    outputSchema: rawJsonOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_fx_daily",
    description: "Retrieve raw daily forex OHLC data for a currency pair.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input for retrieving daily forex data.",
      {
        fromSymbol: nonEmptyString("The base currency code, such as EUR."),
        toSymbol: nonEmptyString("The quote currency code, such as USD."),
        outputSize: outputSizeSchema,
        datatype: datatypeSchema,
      },
      { optional: ["outputSize", "datatype"] },
    ),
    outputSchema: rawJsonOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_fx_weekly",
    description: "Retrieve raw weekly forex OHLC data for a currency pair.",
    requiredScopes: [],
    inputSchema: fromToCurrencyInputSchema,
    outputSchema: rawJsonOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_fx_monthly",
    description: "Retrieve raw monthly forex OHLC data for a currency pair.",
    requiredScopes: [],
    inputSchema: fromToCurrencyInputSchema,
    outputSchema: rawJsonOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_crypto_intraday",
    description: "Retrieve raw intraday OHLCV data for a cryptocurrency market pair.",
    requiredScopes: [],
    inputSchema: s.object("The input for retrieving intraday cryptocurrency data.", {
      symbol: nonEmptyString("The digital currency symbol, such as BTC."),
      market: nonEmptyString("The market currency, such as USD."),
      interval: intradayIntervalSchema,
    }),
    outputSchema: rawJsonOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_digital_currency_daily",
    description: "Retrieve raw daily historical time series data for a digital currency.",
    requiredScopes: [],
    inputSchema: s.object("The input for retrieving daily digital currency data.", {
      symbol: nonEmptyString("The digital currency symbol, such as BTC."),
      market: nonEmptyString("The market currency, such as USD."),
    }),
    outputSchema: rawJsonOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_digital_currency_weekly",
    description: "Retrieve raw weekly historical time series data for a digital currency.",
    requiredScopes: [],
    inputSchema: s.object("The input for retrieving weekly digital currency data.", {
      symbol: nonEmptyString("The digital currency symbol, such as BTC."),
      market: nonEmptyString("The market currency, such as USD."),
    }),
    outputSchema: rawJsonOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_digital_currency_monthly",
    description: "Retrieve raw monthly historical time series data for a digital currency.",
    requiredScopes: [],
    inputSchema: s.object("The input for retrieving monthly digital currency data.", {
      symbol: nonEmptyString("The digital currency symbol, such as BTC."),
      market: nonEmptyString("The market currency, such as USD."),
    }),
    outputSchema: rawJsonOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_company_overview",
    description: "Retrieve raw company overview and fundamental data for a stock symbol.",
    requiredScopes: [],
    inputSchema: stockSymbolInputSchema,
    outputSchema: rawJsonOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_etf_profile",
    description: "Retrieve raw ETF profile and holdings data for an ETF symbol.",
    requiredScopes: [],
    inputSchema: stockSymbolInputSchema,
    outputSchema: rawJsonOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_income_statement",
    description: "Retrieve raw annual and quarterly income statement data for a company.",
    requiredScopes: [],
    inputSchema: stockSymbolInputSchema,
    outputSchema: rawJsonOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_balance_sheet",
    description: "Retrieve raw annual and quarterly balance sheet data for a company.",
    requiredScopes: [],
    inputSchema: stockSymbolInputSchema,
    outputSchema: rawJsonOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_cash_flow",
    description: "Retrieve raw annual and quarterly cash flow data for a company.",
    requiredScopes: [],
    inputSchema: stockSymbolInputSchema,
    outputSchema: rawJsonOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_earnings",
    description: "Retrieve raw annual and quarterly earnings data for a company.",
    requiredScopes: [],
    inputSchema: stockSymbolInputSchema,
    outputSchema: rawJsonOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_earnings_estimates",
    description: "Retrieve raw analyst earnings estimates for a company.",
    requiredScopes: [],
    inputSchema: stockSymbolInputSchema,
    outputSchema: rawJsonOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_listing_status",
    description: "Retrieve raw active or delisted listing status data as CSV.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input for retrieving listing status data.",
      {
        date: s.date("The optional listing status date in YYYY-MM-DD format."),
        state: s.stringEnum("The listing state to request.", ["active", "delisted"]),
      },
      { optional: ["date", "state"] },
    ),
    outputSchema: rawTextOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_earnings_calendar",
    description: "Retrieve raw upcoming earnings calendar data as CSV.",
    requiredScopes: [],
    inputSchema: csvCalendarInputSchema,
    outputSchema: rawTextOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_ipo_calendar",
    description: "Retrieve raw upcoming IPO calendar data as CSV.",
    requiredScopes: [],
    inputSchema: s.object("The input for retrieving IPO calendar data.", {}),
    outputSchema: rawTextOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_dividends",
    description: "Retrieve raw historical and future dividend data for a stock symbol.",
    requiredScopes: [],
    inputSchema: stockSymbolInputSchema,
    outputSchema: rawJsonOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_splits",
    description: "Retrieve raw historical split data for a stock symbol.",
    requiredScopes: [],
    inputSchema: stockSymbolInputSchema,
    outputSchema: rawJsonOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_insider_transactions",
    description: "Retrieve raw insider transaction data for a stock symbol.",
    requiredScopes: [],
    inputSchema: stockSymbolInputSchema,
    outputSchema: rawJsonOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_institutional_holdings",
    description: "Retrieve raw institutional holding data for a stock symbol.",
    requiredScopes: [],
    inputSchema: stockSymbolInputSchema,
    outputSchema: rawJsonOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_earnings_call_transcript",
    description: "Retrieve a raw earnings call transcript for a symbol, quarter, and fiscal year.",
    requiredScopes: [],
    inputSchema: s.object("The input for retrieving an earnings call transcript.", {
      symbol: nonEmptyString("The stock symbol to query, such as IBM."),
      quarter: s.stringEnum("The fiscal quarter to request.", ["Q1", "Q2", "Q3", "Q4"]),
      fiscalYear: s.integer("The fiscal year to request, such as 2024."),
    }),
    outputSchema: rawJsonOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_historical_options",
    description: "Retrieve raw historical options data for a stock symbol.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input for retrieving historical options data.",
      {
        symbol: nonEmptyString("The stock symbol to query, such as IBM."),
        date: s.date("The optional options contract date in YYYY-MM-DD format."),
      },
      { optional: ["date"] },
    ),
    outputSchema: rawJsonOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_realtime_options",
    description: "Retrieve raw realtime options data for a stock symbol.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input for retrieving realtime options data.",
      {
        symbol: nonEmptyString("The stock symbol to query, such as IBM."),
        requireGreeks: s.boolean("Whether to include Greeks and implied volatility fields."),
        contract: nonEmptyString("The optional option contract identifier to request."),
      },
      { optional: ["requireGreeks", "contract"] },
    ),
    outputSchema: rawJsonOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_news_sentiment",
    description: "Retrieve raw live and historical market news and sentiment data.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input for retrieving news sentiment data.",
      {
        tickers: nonEmptyString("Comma-separated tickers or asset identifiers."),
        topics: nonEmptyString("Comma-separated Alpha Vantage news topics."),
        timeFrom: nonEmptyString("The start timestamp in YYYYMMDDTHHMM format."),
        timeTo: nonEmptyString("The end timestamp in YYYYMMDDTHHMM format."),
        sort: s.stringEnum("The article sort order.", ["LATEST", "EARLIEST", "RELEVANCE"]),
        limit: s.integer("The maximum number of articles to return.", {
          minimum: 1,
          maximum: 1000,
        }),
      },
      { optional: ["tickers", "topics", "timeFrom", "timeTo", "sort", "limit"] },
    ),
    outputSchema: rawJsonOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_sector_performance",
    description: "Retrieve raw realtime and historical sector performance data.",
    requiredScopes: [],
    inputSchema: s.object("The input for retrieving sector performance data.", {}),
    outputSchema: rawJsonOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_commodity_data",
    description:
      "Retrieve raw commodity time series data from an Alpha Vantage commodity endpoint.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input for retrieving commodity data.",
      {
        commodity: s.stringEnum("The commodity endpoint to query.", [
          "WTI",
          "BRENT",
          "NATURAL_GAS",
          "COPPER",
          "ALUMINUM",
          "WHEAT",
          "CORN",
          "COTTON",
          "SUGAR",
          "COFFEE",
          "ALL_COMMODITIES",
        ]),
        interval: s.stringEnum("The time interval to request.", ["daily", "weekly", "monthly"]),
        datatype: datatypeSchema,
      },
      { optional: ["interval", "datatype"] },
    ),
    outputSchema: rawJsonOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_macro_indicator",
    description: "Retrieve raw macroeconomic indicator data from Alpha Vantage.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input for retrieving a macroeconomic indicator.",
      {
        indicator: s.stringEnum("The macroeconomic indicator endpoint to query.", [
          "REAL_GDP",
          "REAL_GDP_PER_CAPITA",
          "TREASURY_YIELD",
          "FEDERAL_FUNDS_RATE",
          "CPI",
          "INFLATION",
          "RETAIL_SALES",
          "DURABLES",
          "UNEMPLOYMENT",
          "NONFARM_PAYROLL",
        ]),
        interval: s.stringEnum("The time interval to request where supported.", [
          "daily",
          "weekly",
          "monthly",
          "quarterly",
          "annual",
          "semiannual",
        ]),
        maturity: s.stringEnum("The Treasury yield maturity to request.", [
          "3month",
          "2year",
          "5year",
          "7year",
          "10year",
          "30year",
        ]),
        datatype: datatypeSchema,
      },
      { optional: ["interval", "maturity", "datatype"] },
    ),
    outputSchema: rawJsonOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_technical_indicator",
    description:
      "Retrieve raw technical indicator data using an official Alpha Vantage indicator function.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input for retrieving a technical indicator.",
      {
        indicator: s.stringEnum("The technical indicator function to query.", [
          "SMA",
          "EMA",
          "WMA",
          "DEMA",
          "TEMA",
          "TRIMA",
          "KAMA",
          "MAMA",
          "VWAP",
          "T3",
          "MACD",
          "MACDEXT",
          "STOCH",
          "STOCHF",
          "RSI",
          "STOCHRSI",
          "WILLR",
          "ADX",
          "ADXR",
          "APO",
          "PPO",
          "MOM",
          "BOP",
          "CCI",
          "CMO",
          "ROC",
          "ROCR",
          "AROON",
          "AROONOSC",
          "MFI",
          "TRIX",
          "ULTOSC",
          "DX",
          "MINUS_DI",
          "PLUS_DI",
          "MINUS_DM",
          "PLUS_DM",
          "BBANDS",
          "MIDPOINT",
          "MIDPRICE",
          "SAR",
          "TRANGE",
          "ATR",
          "NATR",
          "AD",
          "ADOSC",
          "OBV",
          "HT_TRENDLINE",
          "HT_SINE",
          "HT_TRENDMODE",
          "HT_DCPERIOD",
          "HT_DCPHASE",
          "HT_PHASOR",
        ]),
        symbol: nonEmptyString("The equity symbol or currency pair to analyze."),
        interval: intervalSchema,
        timePeriod: s.integer("The number of periods used for the indicator calculation.", {
          minimum: 1,
        }),
        seriesType: seriesTypeSchema,
        month: s.string("The optional month in YYYY-MM format for intraday historical data."),
        fastPeriod: s.integer("The fast period parameter for supported indicators.", {
          minimum: 1,
        }),
        slowPeriod: s.integer("The slow period parameter for supported indicators.", {
          minimum: 1,
        }),
        signalPeriod: s.integer("The signal period parameter for supported indicators.", {
          minimum: 1,
        }),
        fastKPeriod: s.integer("The fast K period parameter for supported indicators.", {
          minimum: 1,
        }),
        slowKPeriod: s.integer("The slow K period parameter for supported indicators.", {
          minimum: 1,
        }),
        slowDPeriod: s.integer("The slow D period parameter for supported indicators.", {
          minimum: 1,
        }),
        slowKMatype: s.integer("The slow K moving average type for supported indicators."),
        slowDMatype: s.integer("The slow D moving average type for supported indicators."),
        fastDPeriod: s.integer("The fast D period parameter for supported indicators.", {
          minimum: 1,
        }),
        fastDMatype: s.integer("The fast D moving average type for supported indicators."),
        fastMatype: s.integer("The fast moving average type for supported indicators."),
        slowMatype: s.integer("The slow moving average type for supported indicators."),
        signalMatype: s.integer("The signal moving average type for supported indicators."),
        matype: s.integer("The moving average type for supported indicators."),
        nbdevup: s.integer("The upper band standard deviation multiplier.", { minimum: 1 }),
        nbdevdn: s.integer("The lower band standard deviation multiplier.", { minimum: 1 }),
        acceleration: s.number("The acceleration factor for supported indicators."),
        maximum: s.number("The maximum acceleration value for supported indicators."),
        datatype: datatypeSchema,
      },
      {
        optional: [
          "timePeriod",
          "seriesType",
          "month",
          "fastPeriod",
          "slowPeriod",
          "signalPeriod",
          "fastKPeriod",
          "slowKPeriod",
          "slowDPeriod",
          "slowKMatype",
          "slowDMatype",
          "fastDPeriod",
          "fastDMatype",
          "fastMatype",
          "slowMatype",
          "signalMatype",
          "matype",
          "nbdevup",
          "nbdevdn",
          "acceleration",
          "maximum",
          "datatype",
        ],
      },
    ),
    outputSchema: rawJsonOutputSchema,
  }),
  defineProviderAction(service, {
    name: "call_official_function",
    description:
      "Call a documented Alpha Vantage query function with raw JSON-facing parameters for advanced coverage.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input for calling an official Alpha Vantage function.",
      {
        functionName: s.stringEnum("The official Alpha Vantage function name to call.", [
          "TIME_SERIES_INTRADAY",
          "TIME_SERIES_DAILY",
          "TIME_SERIES_DAILY_ADJUSTED",
          "TIME_SERIES_WEEKLY",
          "TIME_SERIES_WEEKLY_ADJUSTED",
          "TIME_SERIES_MONTHLY",
          "TIME_SERIES_MONTHLY_ADJUSTED",
          "GLOBAL_QUOTE",
          "REALTIME_BULK_QUOTES",
          "INDEX_DATA",
          "INDEX_CATALOG",
          "SYMBOL_SEARCH",
          "MARKET_STATUS",
          "CURRENCY_EXCHANGE_RATE",
          "FX_INTRADAY",
          "FX_DAILY",
          "FX_WEEKLY",
          "FX_MONTHLY",
          "CRYPTO_INTRADAY",
          "DIGITAL_CURRENCY_DAILY",
          "DIGITAL_CURRENCY_WEEKLY",
          "DIGITAL_CURRENCY_MONTHLY",
          "OVERVIEW",
          "ETF_PROFILE",
          "INCOME_STATEMENT",
          "BALANCE_SHEET",
          "CASH_FLOW",
          "EARNINGS",
          "EARNINGS_ESTIMATES",
          "SHARES_OUTSTANDING",
          "LISTING_STATUS",
          "EARNINGS_CALENDAR",
          "IPO_CALENDAR",
          "DIVIDENDS",
          "SPLITS",
          "INSIDER_TRANSACTIONS",
          "INSTITUTIONAL_HOLDINGS",
          "EARNINGS_CALL_TRANSCRIPT",
          "HISTORICAL_OPTIONS",
          "REALTIME_OPTIONS",
          "REALTIME_PUT_CALL_RATIO",
          "HISTORICAL_PUT_CALL_RATIO",
          "REALTIME_VOLUME_OPEN_INTEREST_RATIO",
          "HISTORICAL_VOLUME_OPEN_INTEREST_RATIO",
          "NEWS_SENTIMENT",
          "TOP_GAINERS_LOSERS",
          "SECTOR",
          "WTI",
          "BRENT",
          "NATURAL_GAS",
          "COPPER",
          "ALUMINUM",
          "WHEAT",
          "CORN",
          "COTTON",
          "SUGAR",
          "COFFEE",
          "ALL_COMMODITIES",
          "GOLD_SILVER_SPOT",
          "GOLD_SILVER_HISTORY",
          "REAL_GDP",
          "REAL_GDP_PER_CAPITA",
          "TREASURY_YIELD",
          "FEDERAL_FUNDS_RATE",
          "CPI",
          "INFLATION",
          "RETAIL_SALES",
          "DURABLES",
          "UNEMPLOYMENT",
          "NONFARM_PAYROLL",
          "ANALYTICS_FIXED_WINDOW",
          "ANALYTICS_SLIDING_WINDOW",
          "SMA",
          "EMA",
          "WMA",
          "DEMA",
          "TEMA",
          "TRIMA",
          "KAMA",
          "MAMA",
          "VWAP",
          "T3",
          "MACD",
          "MACDEXT",
          "STOCH",
          "STOCHF",
          "RSI",
          "STOCHRSI",
          "WILLR",
          "ADX",
          "ADXR",
          "APO",
          "PPO",
          "MOM",
          "BOP",
          "CCI",
          "CMO",
          "ROC",
          "ROCR",
          "AROON",
          "AROONOSC",
          "MFI",
          "TRIX",
          "ULTOSC",
          "DX",
          "MINUS_DI",
          "PLUS_DI",
          "MINUS_DM",
          "PLUS_DM",
          "BBANDS",
          "MIDPOINT",
          "MIDPRICE",
          "SAR",
          "TRANGE",
          "ATR",
          "NATR",
          "AD",
          "ADOSC",
          "OBV",
          "HT_TRENDLINE",
          "HT_SINE",
          "HT_TRENDMODE",
          "HT_DCPERIOD",
          "HT_DCPHASE",
          "HT_PHASOR",
        ]),
        parameters: s.record(
          s.anyOf("A string, number, boolean, or null query parameter value.", [
            s.string("A string query value."),
            s.number("A numeric query value."),
            s.boolean("A boolean query value."),
            { type: "null" },
          ]),
          { description: "Official Alpha Vantage query parameters excluding function and apikey." },
        ),
        responseFormat: s.stringEnum("The expected response format.", ["json", "text"]),
      },
      { optional: ["parameters", "responseFormat"] },
    ),
    outputSchema: s.object("The raw Alpha Vantage response.", {
      data: s.unknown("The parsed JSON payload or raw text payload returned by Alpha Vantage."),
    }),
  }),
];
