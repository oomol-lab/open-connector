import type { ActionDefinition } from "../../core/types.ts";

import { jsonSchema as s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "quant_data";

const tickerSchema = s.nonWhitespaceString(
  "The US equity or option-underlying ticker symbol, for example AAPL or SPY.",
);
const sessionDateSchema = s.date("The trading session date in YYYY-MM-DD format. Omit it to use the latest session.");
const timeRangeSchema = s.object("An inclusive-start, exclusive-end UTC time range.", {
  startTime: s.dateTime("The inclusive start instant in ISO 8601 format."),
  endTime: s.dateTime("The exclusive end instant in ISO 8601 format."),
});
const snapshotTimeSchema = s.dateTime("The exact market snapshot instant in ISO 8601 format.");
const aggregationPeriodSchema = s.nonWhitespaceString(
  "The documented Quant Data aggregation period, such as 1m, 5m, 15m, 1h, or 1d.",
);
const filterExpressionSchema = s.looseObject(
  "A Quant Data boolean filter-expression node. Use a terminal with field, operation, and value or values, or a compound node with conjunction and filters.",
  {
    field: s.nonWhitespaceString("The documented canonical or aliased Quant Data field name."),
    operation: s.nonWhitespaceString("A documented comparison operation such as =, !=, >, >=, <, or <=."),
    value: s.unknown("The single comparison value for a terminal filter."),
    values: s.array(
      "The comparison values for a terminal filter, combined with OR semantics.",
      s.unknown("One comparison value."),
    ),
    conjunction: s.stringEnum("The boolean conjunction for a compound filter node.", ["AND", "OR"]),
    filters: s.array(
      "The nested terminal or compound filter nodes.",
      s.looseObject("A nested Quant Data filter-expression node."),
      { minItems: 1 },
    ),
  },
);
const genericOptionsFilterSchema = s.looseObject(
  "Documented Quant Data option-trade convenience filters. Additional documented upstream filters may also be supplied.",
  {
    tickers: s.stringArray("Ticker symbols to include.", {
      itemDescription: "A ticker symbol to include.",
      minItems: 1,
    }),
    sectors: s.stringArray("GICS sectors to include.", {
      itemDescription: "A sector to include.",
      minItems: 1,
    }),
    industries: s.stringArray("GICS industries to include.", {
      itemDescription: "An industry to include.",
      minItems: 1,
    }),
    contractTypes: s.array(
      "Option contract types to include.",
      s.stringEnum("An option contract type.", ["CALL", "PUT"]),
      { minItems: 1 },
    ),
    expirationDates: s.array(
      "Option expiration dates to include.",
      s.date("An option expiration date in YYYY-MM-DD format."),
      { minItems: 1 },
    ),
    moneyTypes: s.stringArray("Moneyness categories to include.", {
      itemDescription: "A documented moneyness value such as ATM, ITM, or OTM.",
      minItems: 1,
    }),
    tradeSideCodes: s.stringArray("Trade-side values to include.", {
      itemDescription: "A documented trade-side value such as ABOVE_ASK or BID.",
      minItems: 1,
    }),
    sentimentTypes: s.stringArray("Trade-sentiment values to include.", {
      itemDescription: "A documented trade-sentiment value.",
      minItems: 1,
    }),
    isUnusual: s.boolean("Whether to include only trades flagged as unusual."),
    isGoldenSweep: s.boolean("Whether to include only trades flagged as golden sweeps."),
  },
);
const sortSchema = s.object("Cursor-page sort settings.", {
  field: s.nonWhitespaceString("The documented filterable field used for sorting."),
  direction: s.stringEnum("The sort direction.", ["ASCENDING", "DESCENDING"]),
});
const searchAfterSchema = s.array(
  "The opaque cursor returned as nextSearchAfter by the previous page.",
  s.unknown("One opaque cursor component."),
  { minItems: 1 },
);
const projectionSchema = s.stringArray("Documented response fields to project.", {
  itemDescription: "A documented projectable field name.",
  minItems: 1,
});
const pageSizeSchema = s.integer("The maximum number of rows to return on this page.", {
  minimum: 1,
  maximum: 100,
});

const mapOutputSchema = (description: string, dataDescription: string) =>
  s.object(description, {
    data: s.looseObject(dataDescription),
  });

const tableOutputSchema = (description: string, rowDescription: string, withStatistics = false) =>
  s.object(
    description,
    {
      data: s.array("The rows returned by Quant Data.", s.looseObject(rowDescription)),
      nextSearchAfter: s.optional(
        s.array(
          "The opaque cursor for the next page, omitted when the result walk is complete.",
          s.unknown("One opaque cursor component."),
        ),
      ),
      ...(withStatistics
        ? {
            statistics: s.optional(s.looseObject("First-page statistics returned when includeStatistics is enabled.")),
          }
        : {}),
    },
    { optional: withStatistics ? ["nextSearchAfter", "statistics"] : ["nextSearchAfter"] },
  );

function mutuallyExclusiveInput(schema: Record<string, unknown>) {
  return schema;
}

const optionsMapInputSchema = (description: string) =>
  mutuallyExclusiveInput(
    s.object(
      description,
      {
        sessionDate: sessionDateSchema,
        timeRange: timeRangeSchema,
        filter: genericOptionsFilterSchema,
        filterExpression: filterExpressionSchema,
      },
      { optional: ["sessionDate", "timeRange", "filter", "filterExpression"] },
    ),
  );

export const quantDataActions: readonly ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_gainers_losers",
    operationType: "read",
    description: "Rank optionable tickers by bullish and bearish premium, volume, and trade activity.",
    inputSchema: optionsMapInputSchema("Input parameters for Quant Data gainers and losers."),
    outputSchema: mapOutputSchema(
      "Quant Data gainers and losers response.",
      "Per-ticker bullish and bearish premium, volume, trade-count, and premium-ratio metrics.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_order_flow_consolidated",
    operationType: "read",
    description: "List consolidated option blocks, splits, sweeps, and multi-leg trades with cursor pagination.",
    inputSchema: mutuallyExclusiveInput(
      s.object(
        "Input parameters for Quant Data consolidated option order flow.",
        {
          sessionDate: sessionDateSchema,
          timeRange: timeRangeSchema,
          filter: genericOptionsFilterSchema,
          filterExpression: filterExpressionSchema,
          size: pageSizeSchema,
          sort: sortSchema,
          searchAfter: searchAfterSchema,
          includes: projectionSchema,
          excludes: projectionSchema,
          includeStatistics: s.boolean(
            "Whether to include first-page statistics grouped by contract type and trade side.",
          ),
          includeComprisingTrades: s.boolean(
            "Whether to include the individual trades comprising each consolidated trade.",
          ),
        },
        {
          optional: [
            "sessionDate",
            "timeRange",
            "filter",
            "filterExpression",
            "size",
            "sort",
            "searchAfter",
            "includes",
            "excludes",
            "includeStatistics",
            "includeComprisingTrades",
          ],
        },
      ),
    ),
    outputSchema: tableOutputSchema(
      "Paginated Quant Data consolidated option order-flow response.",
      "One consolidated option trade with provider-defined fields and optional nested comprising trades.",
      true,
    ),
  }),
  defineProviderAction(service, {
    name: "get_exposure_by_strike",
    operationType: "read",
    description: "Get dealer Greek exposure aggregated by expiration and strike for one ticker.",
    inputSchema: s.object(
      "Input parameters for Quant Data exposure by strike.",
      {
        sessionDate: sessionDateSchema,
        snapshotTime: snapshotTimeSchema,
        greekMode: s.stringEnum("The Greek used to calculate exposure.", ["CHARM", "DELTA", "GAMMA", "VANNA"]),
        representationMode: s.stringEnum("The scale used for exposure values.", [
          "PER_ONE_DOLLAR_MOVE",
          "PER_ONE_PERCENT_MOVE",
          "RAW",
        ]),
        filter: s.looseRequiredObject(
          "Exposure-by-strike filters.",
          {
            ticker: tickerSchema,
            expirationDate: s.date("The option expiration date to include."),
            expirationDates: s.array(
              "The option expiration dates to include.",
              s.date("An option expiration date to include."),
              { minItems: 1 },
            ),
            moneyTypes: s.stringArray("Moneyness categories to include.", {
              itemDescription: "A documented moneyness category.",
              minItems: 1,
            }),
          },
          { optional: ["expirationDate", "expirationDates", "moneyTypes"] },
        ),
        filterExpression: filterExpressionSchema,
      },
      { optional: ["sessionDate", "snapshotTime", "filterExpression"] },
    ),
    outputSchema: mapOutputSchema(
      "Quant Data exposure-by-strike response.",
      "Per-ticker stock price and exposure map keyed by expiration date and strike.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_exposure_by_expiration",
    operationType: "read",
    description: "Get dealer Greek exposure aggregated by strike and expiration for one ticker.",
    inputSchema: s.object(
      "Input parameters for Quant Data exposure by expiration.",
      {
        sessionDate: sessionDateSchema,
        snapshotTime: snapshotTimeSchema,
        greekMode: s.stringEnum("The Greek used to calculate exposure.", ["CHARM", "DELTA", "GAMMA", "VANNA"]),
        representationMode: s.stringEnum("The scale used for exposure values.", [
          "PER_ONE_DOLLAR_MOVE",
          "PER_ONE_PERCENT_MOVE",
          "RAW",
        ]),
        filter: s.looseRequiredObject("Exposure-by-expiration filters.", {
          ticker: tickerSchema,
        }),
        filterExpression: filterExpressionSchema,
      },
      { optional: ["sessionDate", "snapshotTime", "filterExpression"] },
    ),
    outputSchema: mapOutputSchema(
      "Quant Data exposure-by-expiration response.",
      "Per-ticker stock price and exposure map keyed by expiration date and strike.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_net_drift",
    operationType: "read",
    description: "Get time-bucketed net call and put premium and volume with the underlying stock price.",
    inputSchema: mutuallyExclusiveInput(
      s.object(
        "Input parameters for Quant Data net drift.",
        {
          sessionDate: sessionDateSchema,
          timeRange: timeRangeSchema,
          aggregationPeriod: aggregationPeriodSchema,
          filter: genericOptionsFilterSchema,
          filterExpression: filterExpressionSchema,
        },
        {
          optional: ["sessionDate", "timeRange", "aggregationPeriod", "filter", "filterExpression"],
        },
      ),
    ),
    outputSchema: mapOutputSchema(
      "Quant Data net-drift response.",
      "Net call and put premium and volume buckets keyed by epoch-millisecond start time.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_net_flow",
    operationType: "read",
    description: "Get total call and put premium or volume over time.",
    inputSchema: mutuallyExclusiveInput(
      s.object(
        "Input parameters for Quant Data net flow.",
        {
          sessionDate: sessionDateSchema,
          timeRange: timeRangeSchema,
          aggregationPeriod: aggregationPeriodSchema,
          dataMode: s.stringEnum("The metric aggregated by net flow.", ["NET_PREMIUM", "NET_VOLUME"]),
          filter: genericOptionsFilterSchema,
          filterExpression: filterExpressionSchema,
        },
        {
          optional: ["sessionDate", "timeRange", "aggregationPeriod", "filter", "filterExpression"],
        },
      ),
    ),
    outputSchema: mapOutputSchema(
      "Quant Data net-flow response.",
      "Call and put flow buckets keyed by epoch-millisecond start time.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_iv_rank",
    operationType: "read",
    description: "Get historical implied-volatility rank for one ticker and maturity window.",
    inputSchema: s.object(
      "Input parameters for Quant Data implied-volatility rank.",
      {
        sessionDate: sessionDateSchema,
        lookBackPeriod: s.integer("The historical IV lookback in days.", {
          minimum: 1,
          maximum: 365,
        }),
        maturity: s.integer("The option maturity in days.", { minimum: 1, maximum: 365 }),
        filter: s.looseRequiredObject(
          "Implied-volatility-rank filters.",
          {
            ticker: tickerSchema,
            contractTypes: s.array(
              "Option contract types to include.",
              s.stringEnum("An option contract type.", ["CALL", "PUT"]),
              { minItems: 1 },
            ),
          },
          { optional: ["contractTypes"] },
        ),
      },
      { optional: ["sessionDate"] },
    ),
    outputSchema: mapOutputSchema(
      "Quant Data implied-volatility-rank response.",
      "Per-session and per-contract-type implied-volatility rank metrics.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_volatility_skew",
    operationType: "read",
    description: "Get the implied-volatility surface across expirations and strikes for one ticker.",
    inputSchema: s.object(
      "Input parameters for Quant Data volatility skew.",
      {
        sessionDate: sessionDateSchema,
        snapshotTime: snapshotTimeSchema,
        filter: s.looseRequiredObject(
          "Volatility-skew filters.",
          {
            ticker: tickerSchema,
            contractTypes: s.array(
              "Option contract types to include.",
              s.stringEnum("An option contract type.", ["CALL", "PUT"]),
              { minItems: 1 },
            ),
            expirationDates: s.array(
              "Option expiration dates to include.",
              s.date("An option expiration date to include."),
              { minItems: 1 },
            ),
          },
          { optional: ["contractTypes", "expirationDates"] },
        ),
        filterExpression: filterExpressionSchema,
      },
      { optional: ["sessionDate", "snapshotTime", "filterExpression"] },
    ),
    outputSchema: mapOutputSchema(
      "Quant Data volatility-skew response.",
      "Per-ticker stock price and implied-volatility surface keyed by expiration and strike.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_dark_flow",
    operationType: "read",
    description: "Get time-bucketed off-exchange notional value, share count, trade count, and stock price.",
    inputSchema: mutuallyExclusiveInput(
      s.object(
        "Input parameters for Quant Data dark flow.",
        {
          sessionDate: sessionDateSchema,
          timeRange: timeRangeSchema,
          aggregationPeriod: aggregationPeriodSchema,
          filter: s.object("Dark-flow filters.", { ticker: tickerSchema }),
        },
        { optional: ["sessionDate", "timeRange", "aggregationPeriod"] },
      ),
    ),
    outputSchema: mapOutputSchema(
      "Quant Data dark-flow response.",
      "Dark-flow metrics keyed by epoch-millisecond bucket start time.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_dark_pool_levels",
    operationType: "read",
    description: "Get off-exchange print activity aggregated by price level for one ticker.",
    inputSchema: s.object("Input parameters for Quant Data dark-pool levels.", {
      filter: s.object("Dark-pool-level filters.", { ticker: tickerSchema }),
      sessionDateRange: s.object(
        "The trading-session date range to aggregate.",
        {
          startDate: s.date("The inclusive first trading-session date."),
          endDate: s.date("The inclusive last trading-session date."),
        },
        { optional: ["endDate"] },
      ),
    }),
    outputSchema: mapOutputSchema(
      "Quant Data dark-pool-levels response.",
      "Per-ticker latest stock price and off-exchange activity keyed by price level.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_equity_prints",
    operationType: "read",
    description: "List individual lit and dark US equity prints with cursor pagination.",
    inputSchema: mutuallyExclusiveInput(
      s.object(
        "Input parameters for Quant Data equity prints.",
        {
          sessionDate: sessionDateSchema,
          timeRange: timeRangeSchema,
          filter: s.looseObject("Documented Quant Data equity-print convenience filters.", {
            tickers: s.stringArray("Ticker symbols to include.", {
              itemDescription: "A ticker symbol to include.",
              minItems: 1,
            }),
            printTypes: s.stringArray("Equity-print types to include.", {
              itemDescription: "A documented print type such as LIT or DARK.",
              minItems: 1,
            }),
            tradeSides: s.stringArray("Trade-side values to include.", {
              itemDescription: "A documented equity trade-side value.",
              minItems: 1,
            }),
          }),
          filterExpression: filterExpressionSchema,
          size: pageSizeSchema,
          sort: sortSchema,
          searchAfter: searchAfterSchema,
          includes: projectionSchema,
          excludes: projectionSchema,
        },
        {
          optional: [
            "sessionDate",
            "timeRange",
            "filter",
            "filterExpression",
            "size",
            "sort",
            "searchAfter",
            "includes",
            "excludes",
          ],
        },
      ),
    ),
    outputSchema: tableOutputSchema(
      "Paginated Quant Data equity-print response.",
      "One lit or dark equity print with provider-defined fields.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_news_articles",
    operationType: "read",
    description: "List ticker-tagged market news with topics and per-ticker sentiment using cursor pagination.",
    inputSchema: mutuallyExclusiveInput(
      s.object(
        "Input parameters for Quant Data market news.",
        {
          timeRange: timeRangeSchema,
          filter: s.looseObject("Market-news filters.", {
            tickers: s.stringArray("Ticker symbols to include.", {
              itemDescription: "A ticker symbol to include.",
              minItems: 1,
            }),
            topics: s.stringArray("News topic tags to include.", {
              itemDescription: "A documented Quant Data news topic.",
              minItems: 1,
            }),
            sentiments: s.stringArray("Per-ticker sentiment values to include.", {
              itemDescription: "A documented Quant Data news sentiment value.",
              minItems: 1,
            }),
          }),
          filterExpression: filterExpressionSchema,
          size: pageSizeSchema,
          searchAfter: searchAfterSchema,
          includes: projectionSchema,
          excludes: projectionSchema,
          includeBody: s.boolean("Whether to populate the article body on every returned row."),
        },
        {
          optional: [
            "timeRange",
            "filter",
            "filterExpression",
            "size",
            "searchAfter",
            "includes",
            "excludes",
            "includeBody",
          ],
        },
      ),
    ),
    outputSchema: tableOutputSchema(
      "Paginated Quant Data market-news response.",
      "One market-news article with ticker tags, topics, and per-ticker sentiment.",
    ),
  }),
];
