import type { ActionDefinition } from "../../core/types.ts";
import type { AisaActionRoute } from "./routes.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const scholarInput = s.object(
  "Search terms and publication-year filters.",
  {
    query: s.string("The academic or web search query.", { minLength: 1 }),
    maxResults: s.optional(s.integer("The maximum number of results, from 1 to 100.", { minimum: 1, maximum: 100 })),
    minYear: s.optional(
      s.nullable(s.integer("The earliest publication year, inclusive.", { minimum: 1900, maximum: 2030 })),
    ),
    maxYear: s.optional(
      s.nullable(s.integer("The latest publication year, inclusive.", { minimum: 1900, maximum: 2030 })),
    ),
  },
  { optional: [] },
);

const scholarOutput = s.looseObject(
  "Search results with source links and an upstream search identifier.",
  {
    id: s.string("The upstream search identifier."),
    results: s.array(
      "Matching academic or web sources.",
      s.looseObject(
        "A source; citation and author fields are only present when available.",
        {
          title: s.string("The source title."),
          link: s.string("The source URL."),
          snippet: s.string("The source summary or abstract."),
          authors: s.array("Authors of an academic source.", s.string("An author name.")),
          number_of_citations: s.integer("The reported citation count."),
        },
        { required: [] },
      ),
    ),
  },
  { required: [] },
);

export const discoveryActions: ActionDefinition[] = [
  ...[
    [
      "search_scholar_articles",
      "Search academic papers with source links, abstracts, authors, and citation counts when available.",
    ],
    [
      "search_scholar_mixed",
      "Search academic literature and the web together; author and citation data are optional for mixed sources.",
    ],
    [
      "search_scholar_web",
      "Search web sources with titles, links, and snippets; this does not retrieve full page text.",
    ],
  ].map(([name, description]) =>
    defineProviderAction("aisa", {
      name: name!,
      description: description!,
      operationType: "read",
      requiredScopes: [],
      inputSchema: scholarInput,
      outputSchema: scholarOutput,
    }),
  ),
  defineProviderAction("aisa", {
    name: "search_polymarket",
    description: "Search public Polymarket events, markets, profiles, and tags with filters and pagination.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object(
      "Public prediction-market search filters.",
      {
        query: s.string("Text to search for.", { minLength: 1 }),
        ascending: s.optional(s.boolean("Whether to sort in ascending order.")),
        cache: s.optional(s.boolean("Whether to use cached search results.")),
        eventsStatus: s.optional(s.string("The event status filter.")),
        eventsTag: s.optional(s.array("Event tags to include.", s.string("An event tag."))),
        excludeTagIds: s.optional(s.array("Tag IDs to exclude.", s.integer("A tag ID."))),
        keepClosedMarkets: s.optional(s.integer("The upstream closed-market retention option.")),
        limitPerType: s.optional(s.integer("The maximum results per resource type.")),
        optimized: s.optional(s.boolean("Whether to use optimized search.")),
        page: s.optional(s.integer("The result page to retrieve.")),
        recurrence: s.optional(s.string("The event recurrence filter.")),
        searchProfiles: s.optional(s.boolean("Whether to include public profiles.")),
        searchTags: s.optional(s.boolean("Whether to include matching tags.")),
        sort: s.optional(s.string("The upstream sort field.")),
      },
      { optional: [] },
    ),
    outputSchema: s.looseObject(
      "Matching public events, tags, profiles, and pagination information.",
      {
        events: s.array("Matching events and their markets.", s.looseObject("An event with public market details.")),
        tags: s.array("Matching tags.", s.looseObject("A public tag.")),
        profiles: s.array("Matching public profiles.", s.looseObject("A public profile.")),
        pagination: s.looseObject("Pagination metadata for further search results."),
      },
      { required: [] },
    ),
  }),
  defineProviderAction("aisa", {
    name: "get_polymarket_price_history",
    description:
      "Read historical prices for a Polymarket outcome token obtained from market discovery; this does not place trades.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object(
      "Outcome-token price-history filters.",
      {
        tokenId: s.string("The outcome token asset ID, not the event or condition ID.", {
          minLength: 1,
        }),
        startTimestamp: s.optional(s.number("Return prices after this Unix timestamp in seconds.")),
        endTimestamp: s.optional(s.number("Return prices before this Unix timestamp in seconds.")),
        fidelity: s.optional(s.integer("The price-history resolution in minutes; upstream defaults to 1.")),
        interval: s.optional(
          s.stringEnum("The requested historical time interval.", ["max", "all", "1m", "1w", "1d", "6h", "1h"]),
        ),
      },
      { optional: [] },
    ),
    outputSchema: s.looseObject(
      "Historical prices for the requested outcome token.",
      {
        history: s.array(
          "Historical price points.",
          s.looseObject(
            "A timestamped price point.",
            {
              t: s.number("The Unix timestamp in seconds."),
              p: s.number("The outcome token price."),
            },
            { required: [] },
          ),
        ),
      },
      { required: [] },
    ),
  }),
  defineProviderAction("aisa", {
    name: "get_polymarket_orderbook",
    description: "Read bids, asks, and liquidity for a public Polymarket outcome token.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object(
      "The outcome token to inspect.",
      {
        tokenId: s.string("The outcome token asset ID, not the event or condition ID.", {
          minLength: 1,
        }),
      },
      { optional: [] },
    ),
    outputSchema: s.looseObject(
      "The public outcome-token order book.",
      {
        market: s.string("The market condition ID."),
        asset_id: s.string("The outcome token asset ID."),
        bids: s.array("Available bid levels.", s.looseObject("A price level with price and size strings.")),
        asks: s.array("Available ask levels.", s.looseObject("A price level with price and size strings.")),
        timestamp: s.string("The order-book timestamp returned by Polymarket."),
      },
      { required: [] },
    ),
  }),
  defineProviderAction("aisa", {
    name: "get_polymarket_market",
    description: "Read a public Polymarket market by its numeric market ID, including outcome and token metadata.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object(
      "The public market to retrieve.",
      {
        marketId: s.integer("The numeric market ID returned by market discovery."),
        includeTag: s.optional(s.boolean("Whether to include market tags.")),
      },
      { optional: [] },
    ),
    outputSchema: s.looseObject(
      "The public market and its outcome metadata.",
      {
        id: s.string("The market ID."),
        question: s.string("The prediction-market question."),
        conditionId: s.string("The market condition ID."),
        clobTokenIds: s.string("The JSON-encoded array of outcome token IDs."),
        outcomes: s.string("The JSON-encoded array of outcome labels."),
      },
      { required: [] },
    ),
  }),
  defineProviderAction("aisa", {
    name: "get_polymarket_event",
    description: "Read a public Polymarket event and its related prediction markets by numeric event ID.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object(
      "The public event to retrieve.",
      {
        eventId: s.integer("The numeric event ID returned by event discovery."),
        includeChat: s.optional(s.boolean("Whether to include public event chat metadata.")),
        includeTemplate: s.optional(s.boolean("Whether to include event template metadata.")),
      },
      { optional: [] },
    ),
    outputSchema: s.looseObject(
      "The public event and related markets.",
      {
        id: s.string("The event ID."),
        title: s.string("The event title."),
        markets: s.array("The event's prediction markets.", s.looseObject("A public prediction market.")),
      },
      { required: [] },
    ),
  }),
  defineProviderAction("aisa", {
    name: "get_polymarket_clob_market",
    description:
      "Resolve a Polymarket condition ID into public outcome tokens and exchange market details for price and order-book research.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object(
      "The market condition to resolve.",
      {
        conditionId: s.string("The condition ID returned by market discovery.", { minLength: 1 }),
      },
      { optional: [] },
    ),
    outputSchema: s.looseObject(
      "Public exchange market details and outcome tokens.",
      {
        condition_id: s.string("The market condition ID."),
        question: s.string("The prediction-market question."),
        tokens: s.array(
          "Outcome tokens for price and order-book lookup.",
          s.looseObject(
            "An outcome token.",
            {
              token_id: s.string("The outcome token asset ID."),
              outcome: s.string("The outcome label."),
              price: s.number("The current outcome token price."),
            },
            { required: [] },
          ),
        ),
      },
      { required: [] },
    ),
  }),
  defineProviderAction("aisa", {
    name: "get_kalshi_market",
    description: "Read a public Kalshi market's prices, settlement rules, status, and volume by ticker.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object(
      "The Kalshi market to retrieve.",
      {
        ticker: s.string("The market ticker returned by Kalshi market discovery.", { minLength: 1 }),
      },
      { optional: [] },
    ),
    outputSchema: s.looseObject(
      "The public Kalshi market details.",
      {
        market: s.looseObject("Prices, settlement rules, status, and other public market fields."),
      },
      { required: [] },
    ),
  }),
  defineProviderAction("aisa", {
    name: "get_kalshi_orderbook",
    description: "Read public Kalshi order-book levels for a market ticker; zero depth requests all levels.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object(
      "The Kalshi market and order-book depth.",
      {
        ticker: s.string("The market ticker returned by Kalshi market discovery.", { minLength: 1 }),
        depth: s.optional(
          s.integer("The number of levels, from 1 to 100; 0 returns all levels.", {
            minimum: 0,
            maximum: 100,
          }),
        ),
      },
      { optional: [] },
    ),
    outputSchema: s.looseObject(
      "The public Kalshi order book.",
      {
        orderbook_fp: s.looseObject("Fixed-point yes/no order-book levels returned by Kalshi."),
      },
      { required: [] },
    ),
  }),
];

export const discoveryRoutes: Record<string, AisaActionRoute> = {
  search_scholar_articles: {
    path: "/apis/v1/scholar/search/scholar",
    method: "POST",
    query: { query: "query", maxResults: "max_num_results", minYear: "as_ylo", maxYear: "as_yhi" },
  },
  search_scholar_mixed: {
    path: "/apis/v1/scholar/search/mixed",
    method: "POST",
    query: { query: "query", maxResults: "max_num_results", minYear: "as_ylo", maxYear: "as_yhi" },
  },
  search_scholar_web: {
    path: "/apis/v1/scholar/search/web",
    method: "POST",
    query: { query: "query", maxResults: "max_num_results", minYear: "as_ylo", maxYear: "as_yhi" },
  },
  search_polymarket: {
    path: "/apis/v1/polymarket/public-search",
    query: {
      query: "q",
      ascending: "ascending",
      cache: "cache",
      eventsStatus: "events_status",
      eventsTag: "events_tag",
      excludeTagIds: "exclude_tag_id",
      keepClosedMarkets: "keep_closed_markets",
      limitPerType: "limit_per_type",
      optimized: "optimized",
      page: "page",
      recurrence: "recurrence",
      searchProfiles: "search_profiles",
      searchTags: "search_tags",
      sort: "sort",
    },
  },
  get_polymarket_price_history: {
    path: "/apis/v1/polymarket/prices-history",
    query: {
      tokenId: "market",
      startTimestamp: "startTs",
      endTimestamp: "endTs",
      fidelity: "fidelity",
      interval: "interval",
    },
  },
  get_polymarket_orderbook: { path: "/apis/v1/polymarket/book", query: { tokenId: "token_id" } },
  get_polymarket_market: {
    path: "/apis/v1/polymarket/markets/{id}",
    pathParams: { id: "marketId" },
    query: { includeTag: "include_tag" },
  },
  get_polymarket_event: {
    path: "/apis/v1/polymarket/events/{id}",
    pathParams: { id: "eventId" },
    query: { includeChat: "include_chat", includeTemplate: "include_template" },
  },
  get_polymarket_clob_market: {
    path: "/apis/v1/polymarket/clob-markets/{condition_id}",
    pathParams: { condition_id: "conditionId" },
    query: {},
  },
  get_kalshi_market: {
    path: "/apis/v1/kalshi/markets/{ticker}",
    pathParams: { ticker: "ticker" },
    query: {},
  },
  get_kalshi_orderbook: {
    path: "/apis/v1/kalshi/markets/{ticker}/orderbook",
    pathParams: { ticker: "ticker" },
    query: { depth: "depth" },
  },
};
