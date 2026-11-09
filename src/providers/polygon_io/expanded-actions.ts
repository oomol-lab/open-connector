import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { jsonSchema as s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "polygon_io";
const ticker = s.nonEmptyString("The case-sensitive Massive ticker symbol, for example AAPL.");
const text = (description: string) => s.nonEmptyString(description);
const order = s.stringEnum("The order used when sorting returned results.", ["asc", "desc"]);
const limit = s.integer("The maximum number of results to return.", { minimum: 1, maximum: 50000 });
const snapshotLimit = s.integer("The maximum number of snapshot results to return.", {
  minimum: 1,
  maximum: 250,
});
const cursor = text("The pagination cursor from a previous response nextCursor value.");
const date = (description: string) => s.date(description);
const tickerArray = (description: string) =>
  s.array(description, s.nonWhitespaceString("A Massive ticker symbol."), {
    minItems: 1,
    maxItems: 250,
    uniqueItems: true,
  });

const meta = s.object("Common response metadata returned by Massive.", {
  status: s.nullable(s.string("The response status returned by Massive.")),
  requestId: s.nullable(s.string("The request identifier assigned by Massive.")),
  count: s.nullable(s.integer("The response count when Massive reports one.")),
});
const page = s.object("Cursor pagination information returned by Massive.", {
  nextUrl: s.nullable(s.string("The next page URL when present.")),
  nextCursor: s.nullable(s.string("The cursor extracted from nextUrl when present.")),
});
const rawRecord = s.looseObject("An unmodified result record returned by Massive.");
const listOutput = (description: string) =>
  s.object(description, {
    meta,
    results: s.array("The result records returned by Massive.", rawRecord),
    page,
  });
const resultOutput = (description: string) =>
  s.object(description, { meta, result: s.unknown("The result payload returned by Massive.") });
const pagedResultOutput = (description: string) =>
  s.object(description, {
    meta,
    result: s.unknown("The result payload returned by Massive."),
    page,
  });

function input(description: string, properties: Record<string, JsonSchema>, optional: string[] = []) {
  return s.object(description, properties, { optional });
}

function readAction<const TName extends string>(config: {
  name: TName;
  description: string;
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
}) {
  return defineProviderAction(service, { operationType: "read", ...config });
}

const paging = { order, limit, sort: text("The upstream field used to sort results."), cursor };
const pagingOptional = ["order", "limit", "sort", "cursor"];
const dateRange = {
  date: date("Filter results to this date."),
  dateGte: date("Return results on or after this date."),
  dateLte: date("Return results on or before this date."),
};

export const expandedPolygonIoActions: readonly ActionDefinition[] = [
  readAction({
    name: "list_related_tickers",
    description: "List companies related to a Massive stock ticker.",
    inputSchema: input("Input parameters for listing related tickers.", { ticker }),
    outputSchema: listOutput("The related tickers returned by Massive."),
  }),
  readAction({
    name: "get_daily_open_close",
    description: "Get a stock ticker's open, close, and extended-hours prices for one date.",
    inputSchema: input(
      "Input parameters for retrieving a daily open and close summary.",
      {
        ticker,
        date: date("The trading date to retrieve."),
        adjusted: s.boolean("Whether prices should be adjusted for splits."),
      },
      ["adjusted"],
    ),
    outputSchema: resultOutput("The daily open and close summary returned by Massive."),
  }),
  readAction({
    name: "get_stock_snapshot",
    description: "Get the latest trade, quote, minute, day, and previous-day data for one stock.",
    inputSchema: input("Input parameters for retrieving a stock snapshot.", { ticker }),
    outputSchema: resultOutput("The stock snapshot returned by Massive."),
  }),
  readAction({
    name: "get_unified_snapshot",
    description: "Get current snapshots for an explicit list of Massive tickers across asset classes.",
    inputSchema: input(
      "Input parameters for retrieving unified snapshots.",
      {
        tickers: tickerArray("The ticker symbols to retrieve."),
        assetType: s.stringEnum("The optional asset type filter.", ["stocks", "options", "fx", "crypto", "indices"]),
        ...paging,
        limit: snapshotLimit,
      },
      ["assetType", ...pagingOptional],
    ),
    outputSchema: listOutput("The unified snapshots returned by Massive."),
  }),
  readAction({
    name: "get_stock_movers",
    description: "Get the current top gaining or losing U.S. stocks.",
    inputSchema: input("Input parameters for retrieving stock market movers.", {
      direction: s.stringEnum("Whether to return gainers or losers.", ["gainers", "losers"]),
    }),
    outputSchema: listOutput("The stock market movers returned by Massive."),
  }),
  readAction({
    name: "list_trades",
    description: "List historical trades for a stock or options ticker.",
    inputSchema: input(
      "Input parameters for listing historical trades.",
      {
        ticker,
        timestamp: text("Filter by an exact date, nanosecond timestamp, or RFC 3339 timestamp."),
        timestampGte: text("Return trades at or after this date or timestamp."),
        timestampLte: text("Return trades at or before this date or timestamp."),
        ...paging,
      },
      ["timestamp", "timestampGte", "timestampLte", ...pagingOptional],
    ),
    outputSchema: listOutput("The historical trades returned by Massive."),
  }),
  readAction({
    name: "get_last_stock_trade",
    description: "Get the latest available trade for a stock ticker.",
    inputSchema: input("Input parameters for retrieving the latest stock trade.", { ticker }),
    outputSchema: resultOutput("The latest stock trade returned by Massive."),
  }),
  readAction({
    name: "list_quotes",
    description: "List historical quotes for a stock or options ticker.",
    inputSchema: input(
      "Input parameters for listing historical quotes.",
      {
        ticker,
        timestamp: text("Filter by an exact date, nanosecond timestamp, or RFC 3339 timestamp."),
        timestampGte: text("Return quotes at or after this date or timestamp."),
        timestampLte: text("Return quotes at or before this date or timestamp."),
        ...paging,
      },
      ["timestamp", "timestampGte", "timestampLte", ...pagingOptional],
    ),
    outputSchema: listOutput("The historical quotes returned by Massive."),
  }),
  readAction({
    name: "get_last_stock_quote",
    description: "Get the latest national best bid and offer for a stock ticker.",
    inputSchema: input("Input parameters for retrieving the latest stock quote.", { ticker }),
    outputSchema: resultOutput("The latest stock quote returned by Massive."),
  }),
  readAction({
    name: "list_market_holidays",
    description: "List upcoming market holidays and their trading hours.",
    inputSchema: input("The input payload for listing upcoming market holidays.", {}),
    outputSchema: listOutput("The upcoming market holidays returned by Massive."),
  }),
  readAction({
    name: "list_condition_codes",
    description: "List trade and quote condition codes known by Massive.",
    inputSchema: input(
      "Input parameters for listing condition codes.",
      {
        assetClass: text("Filter by asset class, such as stocks or options."),
        dataType: s.stringEnum("Filter conditions by market data type.", ["trade", "quote"]),
        id: s.integer("Filter by the Massive condition identifier."),
        sipMapping: text("Filter by a Securities Information Processor mapping."),
      },
      ["assetClass", "dataType", "id", "sipMapping"],
    ),
    outputSchema: listOutput("The condition codes returned by Massive."),
  }),
  readAction({
    name: "list_ticker_news",
    description: "List recent financial news and sentiment associated with tickers.",
    inputSchema: input(
      "Input parameters for listing ticker news.",
      {
        ticker,
        publishedUtcGte: text("Return articles published at or after this RFC 3339 timestamp."),
        publishedUtcLte: text("Return articles published at or before this RFC 3339 timestamp."),
        ...paging,
      },
      ["ticker", "publishedUtcGte", "publishedUtcLte", ...pagingOptional],
    ),
    outputSchema: listOutput("The news articles returned by Massive."),
  }),
  readAction({
    name: "list_dividends",
    description: "List current-version stock dividend events and adjustment factors.",
    inputSchema: input(
      "Input parameters for listing stock dividends.",
      {
        ticker,
        exDividendDate: date("Filter by an exact ex-dividend date."),
        exDividendDateGte: date("Return dividends with an ex-dividend date on or after this date."),
        exDividendDateLte: date("Return dividends with an ex-dividend date on or before this date."),
        ...paging,
      },
      ["ticker", "exDividendDate", "exDividendDateGte", "exDividendDateLte", ...pagingOptional],
    ),
    outputSchema: listOutput("The stock dividend events returned by Massive."),
  }),
  readAction({
    name: "list_splits",
    description: "List current-version stock split events and adjustment factors.",
    inputSchema: input(
      "Input parameters for listing stock splits.",
      {
        ticker,
        executionDate: date("Filter by an exact split execution date."),
        executionDateGte: date("Return splits executed on or after this date."),
        executionDateLte: date("Return splits executed on or before this date."),
        ...paging,
      },
      ["ticker", "executionDate", "executionDateGte", "executionDateLte", ...pagingOptional],
    ),
    outputSchema: listOutput("The stock split events returned by Massive."),
  }),
  ...(["balance_sheets", "income_statements", "cash_flow_statements", "financial_ratios"] as const).map((name) =>
    readAction({
      name: `list_${name}` as const,
      description: `List company ${name.split("_").join(" ")} from Massive.`,
      inputSchema: input(
        `Input parameters for listing company ${name.split("_").join(" ")}.`,
        {
          tickers: tickerArray("Filter by one or more stock tickers."),
          cik: text("Filter by Central Index Key."),
          timeframe: s.stringEnum("Filter by reporting timeframe.", ["quarterly", "annual", "trailing_twelve_months"]),
          fiscalYear: s.integer("Filter by fiscal year."),
          fiscalQuarter: s.integer("Filter by fiscal quarter.", { minimum: 1, maximum: 4 }),
          periodEnd: date("Filter by an exact reporting period end date."),
          periodEndGte: date("Return periods ending on or after this date."),
          periodEndLte: date("Return periods ending on or before this date."),
          filingDateGte: date("Return statements filed on or after this date."),
          filingDateLte: date("Return statements filed on or before this date."),
          ...paging,
        },
        [
          "tickers",
          "cik",
          "timeframe",
          "fiscalYear",
          "fiscalQuarter",
          "periodEnd",
          "periodEndGte",
          "periodEndLte",
          "filingDateGte",
          "filingDateLte",
          ...pagingOptional,
        ],
      ),
      outputSchema: listOutput(`The company ${name.split("_").join(" ")} returned by Massive.`),
    }),
  ),
  readAction({
    name: "list_short_interest",
    description: "List reported short interest for U.S. stocks.",
    inputSchema: input(
      "Input parameters for listing short interest.",
      {
        ticker,
        settlementDate: date("Filter by settlement date."),
        settlementDateGte: date("Return records settled on or after this date."),
        settlementDateLte: date("Return records settled on or before this date."),
        ...paging,
      },
      ["ticker", "settlementDate", "settlementDateGte", "settlementDateLte", ...pagingOptional],
    ),
    outputSchema: listOutput("The short-interest records returned by Massive."),
  }),
  readAction({
    name: "list_short_volume",
    description: "List daily short-sale volume for U.S. stocks.",
    inputSchema: input("Input parameters for listing short volume.", { ticker, ...dateRange, ...paging }, [
      "ticker",
      "date",
      "dateGte",
      "dateLte",
      ...pagingOptional,
    ]),
    outputSchema: listOutput("The short-volume records returned by Massive."),
  }),
  readAction({
    name: "list_option_contracts",
    description: "List Massive options contracts with contract-specific filters.",
    inputSchema: input(
      "Input parameters for listing options contracts.",
      {
        underlyingTicker: ticker,
        contractType: s.stringEnum("Filter by options contract type.", ["call", "put"]),
        expirationDate: date("Filter by an exact expiration date."),
        expirationDateGte: date("Return contracts expiring on or after this date."),
        expirationDateLte: date("Return contracts expiring on or before this date."),
        strikePrice: s.number("Filter by an exact strike price."),
        expired: s.boolean("Whether to include expired contracts."),
        asOf: date("Return contracts valid as of this date."),
        ...paging,
      },
      [
        "underlyingTicker",
        "contractType",
        "expirationDate",
        "expirationDateGte",
        "expirationDateLte",
        "strikePrice",
        "expired",
        "asOf",
        ...pagingOptional,
      ],
    ),
    outputSchema: listOutput("The options contracts returned by Massive."),
  }),
  readAction({
    name: "get_option_contract",
    description: "Get reference details for one Massive options contract.",
    inputSchema: input(
      "Input parameters for retrieving an options contract.",
      {
        optionsTicker: text("The case-sensitive Massive options contract ticker."),
        asOf: date("Return the contract definition valid as of this date."),
      },
      ["asOf"],
    ),
    outputSchema: resultOutput("The options contract details returned by Massive."),
  }),
  readAction({
    name: "get_option_chain_snapshot",
    description: "Get an options chain with prices, Greeks, implied volatility, and open interest.",
    inputSchema: input(
      "Input parameters for retrieving an options chain snapshot.",
      {
        underlyingTicker: ticker,
        contractType: s.stringEnum("Filter by options contract type.", ["call", "put"]),
        expirationDate: date("Filter by an exact expiration date."),
        expirationDateGte: date("Return contracts expiring on or after this date."),
        expirationDateLte: date("Return contracts expiring on or before this date."),
        strikePrice: s.number("Filter by an exact strike price."),
        strikePriceGte: s.number("Return contracts at or above this strike price."),
        strikePriceLte: s.number("Return contracts at or below this strike price."),
        ...paging,
      },
      [
        "contractType",
        "expirationDate",
        "expirationDateGte",
        "expirationDateLte",
        "strikePrice",
        "strikePriceGte",
        "strikePriceLte",
        ...pagingOptional,
      ],
    ),
    outputSchema: listOutput("The options chain snapshots returned by Massive."),
  }),
  readAction({
    name: "get_option_contract_snapshot",
    description: "Get prices, Greeks, implied volatility, and open interest for one options contract.",
    inputSchema: input("Input parameters for retrieving an options contract snapshot.", {
      underlyingTicker: ticker,
      optionsTicker: text("The case-sensitive Massive options contract ticker."),
    }),
    outputSchema: resultOutput("The options contract snapshot returned by Massive."),
  }),
  ...(["treasury_yields", "inflation", "inflation_expectations", "labor_market", "funding_conditions"] as const).map(
    (name) =>
      readAction({
        name: `list_${name}` as const,
        description: `List U.S. ${name.split("_").join(" ")} observations from Massive.`,
        inputSchema: input(
          `Input parameters for listing ${name.split("_").join(" ")} observations.`,
          { ...dateRange, ...paging },
          ["date", "dateGte", "dateLte", ...pagingOptional],
        ),
        outputSchema: listOutput(`The ${name.split("_").join(" ")} observations returned by Massive.`),
      }),
  ),
  ...(["sma", "ema", "rsi"] as const).map((name) =>
    readAction({
      name: `get_${name}` as const,
      description: `Get the ${name.toUpperCase()} technical indicator for a Massive ticker.`,
      inputSchema: input(
        `Input parameters for retrieving the ${name.toUpperCase()} indicator.`,
        {
          ticker,
          timespan: text("The aggregate timespan used to calculate the indicator."),
          window: s.positiveInteger("The number of aggregate periods in the calculation window."),
          adjusted: s.boolean("Whether the underlying aggregates should be split adjusted."),
          expandUnderlying: s.boolean("Whether to include the underlying aggregate bars used by the indicator."),
          seriesType: s.stringEnum("The aggregate price series used by the indicator.", [
            "open",
            "high",
            "low",
            "close",
          ]),
          timestamp: text("Filter by an exact date or millisecond timestamp."),
          timestampGte: text("Return values at or after this date or timestamp."),
          timestampLte: text("Return values at or before this date or timestamp."),
          ...paging,
        },
        [
          "timespan",
          "window",
          "adjusted",
          "expandUnderlying",
          "seriesType",
          "timestamp",
          "timestampGte",
          "timestampLte",
          ...pagingOptional,
        ],
      ),
      outputSchema: pagedResultOutput(`The ${name.toUpperCase()} values returned by Massive.`),
    }),
  ),
  readAction({
    name: "get_macd",
    description: "Get the MACD technical indicator for a Massive ticker.",
    inputSchema: input(
      "Input parameters for retrieving the MACD indicator.",
      {
        ticker,
        timespan: text("The aggregate timespan used to calculate MACD."),
        shortWindow: s.positiveInteger("The short exponential moving-average window."),
        longWindow: s.positiveInteger("The long exponential moving-average window."),
        signalWindow: s.positiveInteger("The signal-line exponential moving-average window."),
        adjusted: s.boolean("Whether the underlying aggregates should be split adjusted."),
        expandUnderlying: s.boolean("Whether to include the underlying aggregate bars used by MACD."),
        seriesType: s.stringEnum("The aggregate price series used by MACD.", ["open", "high", "low", "close"]),
        timestamp: text("Filter by an exact date or millisecond timestamp."),
        timestampGte: text("Return values at or after this date or timestamp."),
        timestampLte: text("Return values at or before this date or timestamp."),
        ...paging,
      },
      [
        "timespan",
        "shortWindow",
        "longWindow",
        "signalWindow",
        "adjusted",
        "expandUnderlying",
        "seriesType",
        "timestamp",
        "timestampGte",
        "timestampLte",
        ...pagingOptional,
      ],
    ),
    outputSchema: pagedResultOutput("The MACD values returned by Massive."),
  }),
];
