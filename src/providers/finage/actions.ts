import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "finage";

const timespanSchema = s.stringEnum("Aggregation interval unit supported by Finage.", [
  "minute",
  "hour",
  "day",
  "week",
  "month",
  "quarter",
  "year",
]);
const sortSchema = s.stringEnum("Sort direction for aggregate bars ordered by timestamp.", ["asc", "desc"]);
const symbolInputSchema = s.requiredObject("Input parameters for retrieving Finage data for one U.S. stock symbol.", {
  symbol: s.nonEmptyString("U.S. stock symbol to request from Finage."),
});
const symbolListItemSchema = s.requiredObject("One U.S. stock symbol returned by Finage.", {
  symbol: s.nonEmptyString("Market symbol returned by Finage."),
  name: s.nonEmptyString("Display name associated with the market symbol."),
});
const symbolListOutputSchema = s.requiredObject("Paginated Finage U.S. stock symbol list.", {
  page: s.integer("Current result page returned by Finage."),
  symbols: s.array("U.S. stock symbols on the current page.", symbolListItemSchema),
});
const quoteOutputSchema = s.requiredObject("Latest quote returned by Finage for a single U.S. stock.", {
  symbol: s.nonEmptyString("Stock symbol returned by Finage."),
  ask: s.number("Latest ask price."),
  bid: s.number("Latest bid price."),
  askSize: s.integer("Latest ask size."),
  bidSize: s.integer("Latest bid size."),
  timestamp: s.integer("Timestamp of the latest quote update in milliseconds."),
});
const tradeOutputSchema = s.requiredObject("Latest trade returned by Finage for a single U.S. stock.", {
  symbol: s.nonEmptyString("Stock symbol returned by Finage."),
  price: s.number("Latest trade price."),
  tradeSize: s.integer("Latest trade size."),
  timestamp: s.integer("Timestamp of the latest trade update in milliseconds."),
});
const aggregateBarSchema = s.requiredObject("One OHLCV aggregate bar returned by Finage.", {
  open: s.number("Opening price for the aggregate bar."),
  high: s.number("Highest price for the aggregate bar."),
  low: s.number("Lowest price for the aggregate bar."),
  close: s.number("Closing price for the aggregate bar."),
  volume: s.number("Traded volume for the aggregate bar."),
  timestamp: s.integer("Timestamp of the aggregate bar in milliseconds."),
});
const aggregateOutputSchema = s.requiredObject("Finage aggregate bars response.", {
  symbol: s.nonEmptyString("Stock symbol returned by Finage."),
  totalResults: s.integer("Total number of aggregate bars returned."),
  results: s.array("Aggregate bars returned by Finage.", aggregateBarSchema),
});
const snapshotQuoteSchema = s.requiredObject("One quote row returned by the Finage stock snapshot endpoint.", {
  symbol: s.nonEmptyString("Stock symbol returned by Finage."),
  ask: s.number("Latest ask price in the snapshot."),
  bid: s.number("Latest bid price in the snapshot."),
  askSize: s.integer("Latest ask size in the snapshot."),
  bidSize: s.integer("Latest bid size in the snapshot."),
  timestamp: s.integer("Timestamp returned by Finage for the snapshot quote entry."),
});
const snapshotTradeSchema = s.requiredObject("One trade row returned by the Finage stock snapshot endpoint.", {
  symbol: s.nonEmptyString("Stock symbol returned by Finage."),
  price: s.number("Latest trade price in the snapshot."),
  tradeSize: s.integer("Latest trade size in the snapshot."),
  timestamp: s.integer("Timestamp returned by Finage for the snapshot trade entry."),
});
const snapshotOutputSchema = s.requiredObject("Finage stock snapshot response for a bounded symbol list.", {
  totalResults: s.integer("Total number of symbols included in the snapshot."),
  lastQuotes: s.array("Quote rows returned in the snapshot.", snapshotQuoteSchema),
  lastTrades: s.array("Trade rows returned in the snapshot.", snapshotTradeSchema),
});

export const finageActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_stock_symbols",
    description: "List Finage U.S. stock symbols with optional page and search filters.",
    inputSchema: s.object(
      "Input parameters for listing Finage U.S. stock symbols.",
      {
        page: s.integer("Result page number for the Finage symbol list.", { minimum: 1 }),
        search: s.nonEmptyString("Search text used to filter symbols by ticker or name."),
      },
      { optional: ["page", "search"] },
    ),
    outputSchema: symbolListOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_last_quote",
    description: "Get the latest Finage quote for a single U.S. stock symbol.",
    inputSchema: symbolInputSchema,
    outputSchema: quoteOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_last_trade",
    description: "Get the latest Finage trade for a single U.S. stock symbol.",
    inputSchema: symbolInputSchema,
    outputSchema: tradeOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_aggregates",
    description: "Get Finage OHLCV aggregate bars for a U.S. stock over a date range.",
    inputSchema: s.object(
      "Input parameters for retrieving Finage stock aggregate bars.",
      {
        symbol: s.nonEmptyString("U.S. stock symbol to aggregate."),
        multiplier: s.integer("Positive bar multiplier used by the Finage aggregate endpoint.", { minimum: 1 }),
        timespan: timespanSchema,
        dateFrom: s.date("Inclusive start date in YYYY-MM-DD format."),
        dateTo: s.date("Inclusive end date in YYYY-MM-DD format."),
        limit: s.integer("Maximum number of aggregate bars to return, up to 50000.", { minimum: 1, maximum: 50000 }),
        sort: sortSchema,
      },
      { required: ["symbol", "multiplier", "timespan", "dateFrom", "dateTo"], optional: ["limit", "sort"] },
    ),
    outputSchema: aggregateOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_previous_close",
    description: "Get the previous close aggregate bar for a single Finage U.S. stock symbol.",
    inputSchema: symbolInputSchema,
    outputSchema: aggregateOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_snapshot",
    description:
      "Get a Finage stock snapshot for a bounded list of U.S. stock symbols, including quotes, trades, or both.",
    inputSchema: s.object(
      "Input parameters for retrieving a bounded Finage stock snapshot.",
      {
        symbols: s.stringArray("Bounded list of U.S. stock symbols to request from Finage.", {
          minItems: 1,
          itemDescription: "U.S. stock symbol to include in the snapshot request.",
        }),
        includeQuotes: s.boolean("Whether to include quote rows in the snapshot response. Defaults to true."),
        includeTrades: s.boolean("Whether to include trade rows in the snapshot response. Defaults to false."),
      },
      { required: ["symbols"], optional: ["includeQuotes", "includeTrades"] },
    ),
    outputSchema: snapshotOutputSchema,
  }),
];

export type FinageActionName =
  | "list_stock_symbols"
  | "get_last_quote"
  | "get_last_trade"
  | "get_aggregates"
  | "get_previous_close"
  | "get_snapshot";
