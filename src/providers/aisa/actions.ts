import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { ahrefsActions } from "./ahrefs-actions.ts";
import { aktaActions } from "./akta-actions.ts";
import { answerActions } from "./answer-actions.ts";
import { apolloActions } from "./apollo-actions.ts";
import { braveRichActions } from "./brave-rich-actions.ts";
import { commercialResearchActions } from "./commercial-research-actions.ts";
import { creatorActions } from "./creator-actions.ts";
import { cryptoActions, cryptoResearchActions } from "./crypto-actions.ts";
import { dataForSeoActions } from "./dataforseo-actions.ts";
import { dataForSeoInstantActions } from "./dataforseo-instant-actions.ts";
import { dataForSeoOnPageActions } from "./dataforseo-onpage-actions.ts";
import { dataForSeoReferenceAction } from "./dataforseo-reference-actions.ts";
import { dataForSeoResearchActions } from "./dataforseo-research-actions.ts";
import { dataForSeoTaskActions } from "./dataforseo-task-actions.ts";
import { discoveryActions } from "./discovery-actions.ts";
import { financialActions } from "./financial-actions.ts";
import { financialResearchActions } from "./financial-research-actions.ts";
import { aisaFirecrawlActions } from "./firecrawl-actions.ts";
import { fredActions } from "./fred-actions.ts";
import { macroResearchActions } from "./macro-research-actions.ts";
import { pinterestResearchActions } from "./pinterest-research-actions.ts";
import { polymarketResearchActions } from "./polymarket-research-actions.ts";
import { publicUtilityActions } from "./public-utility-actions.ts";
import { redditActions } from "./reddit-actions.ts";
import { regionalResearchActions } from "./regional-research-actions.ts";
import { researchTaskActions } from "./research-task-actions.ts";
import { searchResearchActions } from "./search-research-actions.ts";
import { seoActions } from "./seo-actions.ts";
import { similarwebActions } from "./similarweb-actions.ts";
import { socialActions } from "./social-actions.ts";
import { nativeSocialActions } from "./social-research-actions.ts";
import { twitterResearchActions } from "./twitter-research-actions.ts";
import { weatherActions } from "./weather-actions.ts";
import { webActions } from "./web-actions.ts";

const service = "aisa";

const paginationInput = {
  limit: s.integer("The maximum number of records to return.", { minimum: 0, maximum: 1000 }),
  cursor: s.string("The pagination cursor returned by the previous response."),
};

const offsetPaginationInput = {
  limit: s.integer("The maximum number of records to return.", { minimum: 0 }),
  offset: s.integer("The number of records to skip.", { minimum: 0 }),
};

const kalshiMarketsAction = defineProviderAction(service, {
  name: "get_kalshi_markets",
  operationType: "read",
  description: "List Kalshi prediction markets with live quotes, settlement rules, and pagination.",
  requiredScopes: [],
  inputSchema: s.object(
    "Filters for listing Kalshi prediction markets through AIsa.",
    {
      ...paginationInput,
      tickers: s.string("Comma-separated Kalshi market tickers to retrieve."),
      eventTicker: s.string("A Kalshi event ticker used to filter markets."),
      seriesTicker: s.string("A Kalshi series ticker used to filter markets."),
      search: s.string("Keywords to find in market titles and descriptions."),
      status: s.stringEnum("The Kalshi market status to return.", ["unopened", "open", "paused", "closed", "settled"]),
      minCreatedTimestamp: s.integer("Return markets created after this Unix timestamp."),
      maxCreatedTimestamp: s.integer("Return markets created before this Unix timestamp."),
      minUpdatedTimestamp: s.integer("Return markets updated after this Unix timestamp."),
      minCloseTimestamp: s.integer("Return markets closing after this Unix timestamp."),
      maxCloseTimestamp: s.integer("Return markets closing before this Unix timestamp."),
      minSettledTimestamp: s.integer("Return markets settled after this Unix timestamp."),
      maxSettledTimestamp: s.integer("Return markets settled before this Unix timestamp."),
      multivariateEventFilter: s.stringEnum("How to filter multivariate-event markets.", ["only", "exclude"]),
    },
    {
      optional: [
        "limit",
        "cursor",
        "tickers",
        "eventTicker",
        "seriesTicker",
        "search",
        "status",
        "minCreatedTimestamp",
        "maxCreatedTimestamp",
        "minUpdatedTimestamp",
        "minCloseTimestamp",
        "maxCloseTimestamp",
        "minSettledTimestamp",
        "maxSettledTimestamp",
        "multivariateEventFilter",
      ],
    },
  ),
  outputSchema: s.object(
    "A page of Kalshi markets returned by AIsa.",
    {
      cursor: s.optional(s.string("The cursor for the next page when more markets are available.")),
      markets: s.array(
        "The Kalshi markets matching the filters.",
        s.looseObject("A Kalshi market with quotes, status, timing, volume, and settlement rules."),
      ),
    },
    { optional: [] },
  ),
});

const kalshiTradesAction = defineProviderAction(service, {
  name: "get_kalshi_trades",
  operationType: "read",
  description: "List executed Kalshi trades with prices, size, side, and pagination.",
  requiredScopes: [],
  inputSchema: s.object(
    "Filters for listing executed Kalshi trades through AIsa.",
    {
      ...paginationInput,
      ticker: s.string("The Kalshi market ticker to filter by."),
      minTimestamp: s.integer("Return trades executed after this Unix timestamp."),
      maxTimestamp: s.integer("Return trades executed before this Unix timestamp."),
      isBlockTrade: s.boolean("Whether to return only block trades or only non-block trades."),
    },
    { optional: ["limit", "cursor", "ticker", "minTimestamp", "maxTimestamp", "isBlockTrade"] },
  ),
  outputSchema: s.object(
    "A page of executed Kalshi trades returned by AIsa.",
    {
      cursor: s.optional(s.string("The cursor for the next page when more trades are available.")),
      trades: s.array(
        "The executed Kalshi trades matching the filters.",
        s.looseObject("An executed Kalshi trade with market, price, size, side, and timing data."),
      ),
    },
    { optional: [] },
  ),
});

const polymarketCommonInput = {
  ...offsetPaginationInput,
  order: s.string("A comma-separated list of fields used to order the results."),
  ascending: s.boolean("Whether to sort the results in ascending order."),
};

const polymarketMarketsAction = defineProviderAction(service, {
  name: "get_polymarket_markets",
  operationType: "read",
  description: "List Polymarket questions with outcome prices, liquidity, volume, and date filters.",
  requiredScopes: [],
  inputSchema: s.object(
    "Filters for listing Polymarket markets through AIsa.",
    {
      ...polymarketCommonInput,
      ids: s.array("The Polymarket market IDs to return.", s.integer("A Polymarket market ID.")),
      slugs: s.array("The Polymarket market slugs to return.", s.string("A Polymarket market slug.")),
      clobTokenIds: s.array("The CLOB token IDs to filter by.", s.string("A Polymarket CLOB token ID.")),
      conditionIds: s.array("The condition IDs to filter by.", s.string("A Polymarket condition ID.")),
      minVolume: s.number("The minimum total market volume."),
      maxVolume: s.number("The maximum total market volume."),
      minStartDate: s.string("Return markets starting after this ISO timestamp.", {
        format: "date-time",
      }),
      maxStartDate: s.string("Return markets starting before this ISO timestamp.", {
        format: "date-time",
      }),
      minEndDate: s.string("Return markets ending after this ISO timestamp.", {
        format: "date-time",
      }),
      maxEndDate: s.string("Return markets ending before this ISO timestamp.", {
        format: "date-time",
      }),
      tagId: s.integer("The Polymarket tag ID to filter by."),
      closed: s.boolean("Whether to return closed or open markets."),
      includeTag: s.boolean("Whether to include tag metadata in each market."),
    },
    {
      optional: [
        "limit",
        "offset",
        "order",
        "ascending",
        "ids",
        "slugs",
        "clobTokenIds",
        "conditionIds",
        "minVolume",
        "maxVolume",
        "minStartDate",
        "maxStartDate",
        "minEndDate",
        "maxEndDate",
        "tagId",
        "closed",
        "includeTag",
      ],
    },
  ),
  outputSchema: s.array(
    "The Polymarket markets matching the filters.",
    s.looseObject("A Polymarket market with its question, outcomes, prices, volume, liquidity, and dates."),
  ),
});

const polymarketEventsAction = defineProviderAction(service, {
  name: "get_polymarket_events",
  operationType: "read",
  description: "List Polymarket events and their related prediction markets.",
  requiredScopes: [],
  inputSchema: s.object(
    "Filters for listing Polymarket events through AIsa.",
    {
      ...polymarketCommonInput,
      ids: s.array("The Polymarket event IDs to return.", s.integer("A Polymarket event ID.")),
      slugs: s.array("The Polymarket event slugs to return.", s.string("A Polymarket event slug.")),
      tagId: s.integer("The Polymarket tag ID to filter by."),
      tagSlug: s.string("The Polymarket tag slug to filter by."),
      active: s.boolean("Whether to return active or inactive events."),
      archived: s.boolean("Whether to return archived or unarchived events."),
      featured: s.boolean("Whether to return featured or non-featured events."),
      closed: s.boolean("Whether to return closed or open events."),
      minLiquidity: s.number("The minimum event liquidity."),
      maxLiquidity: s.number("The maximum event liquidity."),
      minVolume: s.number("The minimum event volume."),
      maxVolume: s.number("The maximum event volume."),
      minStartDate: s.string("Return events starting after this ISO timestamp.", {
        format: "date-time",
      }),
      maxStartDate: s.string("Return events starting before this ISO timestamp.", {
        format: "date-time",
      }),
      minEndDate: s.string("Return events ending after this ISO timestamp.", {
        format: "date-time",
      }),
      maxEndDate: s.string("Return events ending before this ISO timestamp.", {
        format: "date-time",
      }),
    },
    {
      optional: [
        "limit",
        "offset",
        "order",
        "ascending",
        "ids",
        "slugs",
        "tagId",
        "tagSlug",
        "active",
        "archived",
        "featured",
        "closed",
        "minLiquidity",
        "maxLiquidity",
        "minVolume",
        "maxVolume",
        "minStartDate",
        "maxStartDate",
        "minEndDate",
        "maxEndDate",
      ],
    },
  ),
  outputSchema: s.array(
    "The Polymarket events matching the filters.",
    s.looseObject("A Polymarket event with its topic metadata, volume, liquidity, dates, and nested markets."),
  ),
});

const creditsBalanceAction = defineProviderAction(service, {
  name: "get_credits_balance",
  operationType: "read",
  description: "Get the current AIsa account, key, and go-to-market credit balances.",
  requiredScopes: [],
  inputSchema: s.object("The input payload for getting the current AIsa credit balance.", {}, { optional: [] }),
  outputSchema: s.looseObject("The current AIsa balance snapshot in micro-USD."),
});

const usageAction = defineProviderAction(service, {
  name: "get_usage",
  operationType: "read",
  description: "Get AIsa request, token, value, and charged usage in daily buckets.",
  requiredScopes: [],
  inputSchema: s.object(
    "The time window for getting AIsa account or API key usage.",
    {
      startTimestamp: s.integer("The usage window start as a positive Unix timestamp.", {
        minimum: 1,
      }),
      endTimestamp: s.integer("The usage window end as a Unix timestamp; defaults to the current time.", {
        minimum: 1,
      }),
    },
    { optional: ["endTimestamp"] },
  ),
  outputSchema: s.looseObject("AIsa usage totals and daily buckets for the requested time window."),
});

export const aisaActions: readonly ActionDefinition[] = [
  ...answerActions,
  ...pinterestResearchActions,
  ...researchTaskActions,
  ...dataForSeoTaskActions,
  ...dataForSeoOnPageActions,
  ...dataForSeoInstantActions,
  ...publicUtilityActions,
  ...nativeSocialActions,
  ...braveRichActions,
  ...regionalResearchActions,
  ...polymarketResearchActions,
  ...twitterResearchActions,
  ...macroResearchActions,
  ...searchResearchActions,
  ...weatherActions,
  ...commercialResearchActions,
  ...discoveryActions,
  ...redditActions,
  ...fredActions,
  ...financialResearchActions,
  creditsBalanceAction,
  usageAction,
  kalshiMarketsAction,
  kalshiTradesAction,
  polymarketMarketsAction,
  polymarketEventsAction,
  ...similarwebActions,
  ...creatorActions,
  ...seoActions,
  ...ahrefsActions,
  ...aktaActions,
  ...financialActions,
  ...dataForSeoActions,
  ...dataForSeoResearchActions,
  dataForSeoReferenceAction,
  ...cryptoActions,
  ...cryptoResearchActions,
  ...socialActions,
  ...apolloActions,
  ...webActions,
  ...aisaFirecrawlActions,
];
