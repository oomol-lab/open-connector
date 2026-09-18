import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "coinmarketcal";

const statusSchema = s.looseObject("CoinMarketCal response status metadata.", {
  error_code: s.integer("CoinMarketCal error code where 0 indicates success."),
  error_message: s.nullableString("Error message returned by CoinMarketCal when present."),
  credit_count: s.integer("API credits used by the request."),
  elapsed: s.integer("Time spent by CoinMarketCal processing the request."),
});
const eventCategorySchema = s.object(
  "One CoinMarketCal event category.",
  {
    id: s.integer("The unique identifier of the event category."),
    slug: s.string("The slug identifier of the event category."),
    name: s.string("The display name of the event category."),
    description: s.string("The description of the event category."),
    icon: s.string("The icon URL of the event category."),
    isBase: s.boolean("Whether the category is a base category."),
    parentId: s.integer("The parent category identifier when present."),
    subCategories: s.array("The sub-category identifiers of the category.", s.integer("One sub-category id.")),
  },
  { optional: ["parentId", "subCategories"] },
);
const coinSchema = s.object(
  "One CoinMarketCal coin.",
  {
    id: s.string("The unique identifier of the coin."),
    name: s.string("The short name of the coin."),
    symbol: s.string("The ticker symbol of the coin."),
    fullname: s.string("The full name of the coin."),
    rank: s.integer("The rank of the coin when present."),
    popular: s.integer("The number of popular events for the coin."),
    trending: s.integer("The number of trending events for the coin."),
    upcoming: s.integer("The number of upcoming events for the coin."),
    hot_index: s.integer("The hot index of the coin."),
    catalyst: s.integer("The number of catalyst events for the coin."),
    influential: s.integer("The number of influential events for the coin."),
  },
  { optional: ["rank", "popular", "trending", "upcoming", "hot_index", "catalyst", "influential"] },
);
const eventSchema = s.looseObject("One CoinMarketCal event.", {
  id: s.integer("The unique identifier of the event."),
  title: s.looseObject("The localized title object of the event.", {
    en: s.string("The English title of the event."),
  }),
  coins: s.array("The coins associated with the event.", coinSchema),
  categories: s.array("The categories associated with the event.", eventCategorySchema),
  proof: s.string("The proof URL or source link of the event."),
  source: s.string("The source of the event."),
  is_hot: s.boolean("Whether the event is marked as hot."),
  can_occur_before: s.boolean("Whether the event may occur before its announced date."),
});
const translationsSchema = s.stringEnum("The translation language code used by the request.", [
  "en",
  "ko",
  "ru",
  "tr",
  "ja",
  "es",
  "pl",
  "pt",
  "id",
]);
const eventSortBySchema = s.stringEnum("The sort order applied to the event list.", [
  "created_desc",
  "updated_desc",
  "created_desc_and_updated_desc",
  "trending_events",
  "popular_events",
  "influential_events",
  "catalyst_events",
]);
const eventShowOnlySchema = s.stringEnum("The filter applied to keep only one event subset.", [
  "trending_events",
  "popular_events",
  "firmed_date",
  "confirmed_by_representatives",
]);
const rankedEventModeSchema = s.stringEnum("The ranking mode mapped to the corresponding feed.", [
  "trending",
  "popular",
  "influential",
  "catalyst",
]);
const eventListFilterFields: Record<string, JsonSchema> = {
  page: s.integer("The page number of the event list.", { minimum: 1 }),
  max: s.integer("The maximum number of events to return per page.", { minimum: 1, maximum: 75 }),
  coins: s.nonEmptyString("A comma-separated list of coin identifiers or slugs used to filter events."),
  categories: s.nonEmptyString("A comma-separated list of category identifiers used to filter events."),
  dateRangeStart: s.date("The start date of the event filter in YYYY-MM-DD format."),
  dateRangeEnd: s.date("The end date of the event filter in YYYY-MM-DD format."),
  showViews: s.boolean("Whether to include view counts in the event response."),
  showVotes: s.boolean("Whether to include vote data in the event response."),
  translations: translationsSchema,
};
const listEventsOutputSchema = s.object("The response returned when listing CoinMarketCal events.", {
  status: statusSchema,
  events: s.array("The events returned by CoinMarketCal.", eventSchema),
});

export const coinmarketcalActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_event_categories",
    operationType: "read",
    description: "List available CoinMarketCal event categories.",
    inputSchema: s.object({}, { description: "The input payload for listing event categories." }),
    outputSchema: s.object("The response returned when listing CoinMarketCal event categories.", {
      status: statusSchema,
      categories: s.array("The event categories returned by CoinMarketCal.", eventCategorySchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_coins",
    operationType: "read",
    description: "List available CoinMarketCal coins.",
    inputSchema: s.object({}, { description: "The input payload for listing CoinMarketCal coins." }),
    outputSchema: s.object("The response returned when listing CoinMarketCal coins.", {
      status: statusSchema,
      coins: s.array("The coins returned by CoinMarketCal.", coinSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_events",
    operationType: "read",
    description: "List CoinMarketCal events with optional filters.",
    inputSchema: s.object(
      "The input payload for listing CoinMarketCal events.",
      {
        ...eventListFilterFields,
        sortBy: eventSortBySchema,
        showOnly: eventShowOnlySchema,
      },
      {
        optional: [
          "page",
          "max",
          "coins",
          "categories",
          "dateRangeStart",
          "dateRangeEnd",
          "showViews",
          "showVotes",
          "translations",
          "sortBy",
          "showOnly",
        ],
      },
    ),
    outputSchema: listEventsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_ranked_events",
    operationType: "read",
    description: "List CoinMarketCal events ranked by market attention or impact.",
    inputSchema: s.object(
      "The input payload for listing CoinMarketCal events by ranking mode.",
      {
        ...eventListFilterFields,
        ranking: rankedEventModeSchema,
      },
      {
        optional: [
          "page",
          "max",
          "coins",
          "categories",
          "dateRangeStart",
          "dateRangeEnd",
          "showViews",
          "showVotes",
          "translations",
        ],
      },
    ),
    outputSchema: listEventsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_confirmed_events",
    operationType: "read",
    description: "List CoinMarketCal events confirmed by project representatives.",
    inputSchema: s.object("The input payload for listing confirmed CoinMarketCal events.", eventListFilterFields, {
      optional: [
        "page",
        "max",
        "coins",
        "categories",
        "dateRangeStart",
        "dateRangeEnd",
        "showViews",
        "showVotes",
        "translations",
      ],
    }),
    outputSchema: listEventsOutputSchema,
  }),
];
