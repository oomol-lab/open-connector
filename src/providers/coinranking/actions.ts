import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "coinranking";

const nonEmpty = (description: string): JsonSchema => s.nonEmptyString(description);
const positiveInteger = (description: string, maximum?: number): JsonSchema =>
  s.integer(description, maximum === undefined ? { minimum: 1 } : { minimum: 1, maximum });

const timePeriodSchema = s.stringEnum("Time period used for change and historical market data.", [
  "1h",
  "3h",
  "12h",
  "24h",
  "7d",
  "30d",
  "3m",
  "1y",
  "3y",
  "5y",
]);
const orderBySchema = s.stringEnum("Field used to sort the returned coins.", [
  "marketCap",
  "price",
  "change",
  "24hVolume",
  "listedAt",
]);
const orderDirectionSchema = s.stringEnum("Sort direction applied to the ordered result set.", ["asc", "desc"]);
const suggestionItemSchema = s.looseObject("One suggestion item returned by Coinranking.", {
  uuid: nonEmpty("Unique identifier returned by Coinranking."),
  name: nonEmpty("Display name returned by Coinranking."),
  symbol: nonEmpty("Ticker or short symbol returned by Coinranking."),
  price: nonEmpty("String price returned by Coinranking when present."),
  iconUrl: nonEmpty("Icon URL returned by Coinranking when present."),
});
const suggestionResultsSchema = s.object("Grouped search suggestion payload returned by Coinranking.", {
  coins: s.array("Coin suggestions matched by the query.", suggestionItemSchema),
  exchanges: s.array("Exchange suggestions matched by the query.", s.looseObject("One exchange suggestion.")),
  markets: s.array("Market suggestions matched by the query.", s.looseObject("One market suggestion.")),
  fiat: s.array("Fiat currency suggestions matched by the query.", s.looseObject("One fiat suggestion.")),
});
const coinListStatsSchema = s.looseObject("List statistics returned by Coinranking.", {
  total: s.integer("Total number of matching coins when present."),
});
const coinSummarySchema = s.looseObject("One coin summary returned by Coinranking.", {
  uuid: nonEmpty("Unique identifier of the coin."),
  symbol: nonEmpty("Ticker symbol of the coin."),
  name: nonEmpty("Name of the coin."),
  price: nonEmpty("Current price returned by Coinranking."),
  marketCap: nonEmpty("Market capitalization returned by Coinranking."),
});
const priceHistoryItemSchema = s.object(
  "One historical price point returned by Coinranking.",
  {
    price: nonEmpty("Historical price returned by Coinranking."),
    timestamp: s.integer("Unix timestamp for the historical price point."),
  },
  { optional: ["price"] },
);
const referenceCurrencySchema = s.looseObject("One reference currency returned by Coinranking.", {
  uuid: nonEmpty("Unique identifier of the reference currency."),
  type: nonEmpty("Reference currency type returned by Coinranking."),
  symbol: nonEmpty("Reference currency symbol."),
  name: nonEmpty("Reference currency display name."),
});

export const coinrankingActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "search_suggestions",
    operationType: "read",
    description: "Search Coinranking suggestions by keyword and return grouped entity matches.",
    inputSchema: s.object(
      "Input parameters for searching Coinranking suggestions.",
      {
        query: nonEmpty("Search query used for Coinranking suggestions."),
      },
      { required: ["query"] },
    ),
    outputSchema: s.object("Search suggestion results returned by Coinranking.", {
      results: suggestionResultsSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_coins",
    operationType: "read",
    description: "List coins from Coinranking with optional filtering, sorting, and pagination.",
    inputSchema: s.object(
      "Input parameters for listing coins from Coinranking.",
      {
        limit: positiveInteger("Maximum number of coins to return.", 100),
        offset: s.nonNegativeInteger("Number of leading results to skip."),
        search: nonEmpty("Search string used to filter the returned coins."),
        orderBy: orderBySchema,
        orderDirection: orderDirectionSchema,
        referenceCurrencyUuid: nonEmpty("Reference currency UUID used to price the returned coins."),
        timePeriod: timePeriodSchema,
      },
      {
        optional: ["limit", "offset", "search", "orderBy", "orderDirection", "referenceCurrencyUuid", "timePeriod"],
      },
    ),
    outputSchema: s.object("Coin list payload returned by Coinranking.", {
      stats: coinListStatsSchema,
      coins: s.array("Ordered list of coins returned by Coinranking.", coinSummarySchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_coin_details",
    operationType: "read",
    description: "Get detailed information for a single coin from Coinranking.",
    inputSchema: s.object(
      "Input parameters for retrieving coin details from Coinranking.",
      {
        uuid: nonEmpty("Coin UUID returned by Coinranking."),
        referenceCurrencyUuid: nonEmpty("Reference currency UUID used to price the returned coin."),
        timePeriod: timePeriodSchema,
      },
      { optional: ["referenceCurrencyUuid", "timePeriod"] },
    ),
    outputSchema: s.object("Detailed coin response returned by Coinranking.", {
      coin: s.looseObject("Detailed coin payload returned by Coinranking."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_coin_price_history",
    operationType: "read",
    description: "Get historical price points for a single coin from Coinranking.",
    inputSchema: s.object(
      "Input parameters for retrieving historical prices from Coinranking.",
      {
        uuid: nonEmpty("Coin UUID returned by Coinranking."),
        referenceCurrencyUuid: nonEmpty("Reference currency UUID used to price the historical points."),
        timePeriod: timePeriodSchema,
      },
      { optional: ["referenceCurrencyUuid", "timePeriod"] },
    ),
    outputSchema: s.object("Price history response returned by Coinranking.", {
      change: nonEmpty("Price change percentage over the requested time period."),
      history: s.array("Historical price points for the coin.", priceHistoryItemSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_reference_currencies",
    operationType: "read",
    description: "List reference currencies supported by Coinranking.",
    inputSchema: s.object({}, { description: "Input parameters for listing Coinranking reference currencies." }),
    outputSchema: s.object("Reference currency list returned by Coinranking.", {
      currencies: s.array("Reference currencies returned by Coinranking.", referenceCurrencySchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_global_stats",
    operationType: "read",
    description: "Get global cryptocurrency market statistics from Coinranking.",
    inputSchema: s.object({}, { description: "Input parameters for retrieving Coinranking global stats." }),
    outputSchema: s.object("Global market statistics returned by Coinranking.", {
      stats: s.looseObject("Global market statistics returned by Coinranking."),
    }),
  }),
];
