import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "statista" as const;

const querySchema = s.string("The natural language or keyword query sent to Statista.", {
  minLength: 1,
  maxLength: 1000,
});
const offsetSchema = s.nonNegativeInteger("The number of results to skip before returning items.");
const statisticsSizeSchema = s.nonNegativeInteger(
  "The maximum number of statistic search results returned by Statista.",
);
const boundedSearchSizeSchema = s.integer("The maximum number of search results returned by Statista.", {
  minimum: 1,
  maximum: 25,
});
const dateFilterSchema = s.string("A Statista-supported date filter such as YYYY-MM-DD or an ISO 8601 datetime.", {
  minLength: 1,
});
const premiumSchema = s.boolean("Whether to restrict statistic results to premium or free content.");

const teaserImageSchema = s.object("A Statista teaser image link.", {
  width: s.integer("The image width in pixels."),
  src: s.string("The image URL returned by Statista.", { minLength: 1 }),
});

const statisticSearchItemSchema = s.object("A normalized Statista statistic search result.", {
  identifier: s.integer("The Statista statistic identifier."),
  title: s.string("The statistic title returned by Statista."),
  subject: s.string("The statistic subject summary."),
  isPremium: s.boolean("Whether Statista marks the statistic as premium content."),
  description: s.nullable(s.string("The optional statistic description.")),
  link: s.string("The Statista web URL for the statistic."),
  date: s.nullable(s.string("The statistic publication date when returned.")),
  platform: s.string("The Statista platform or locale value returned for the statistic."),
  teaserImageUrls: s.array("The statistic teaser image URLs.", teaserImageSchema),
  rankingScore: s.nullable(s.number("The optional ranking score returned by Statista.")),
  raw: s.looseObject("The raw statistic search result returned by Statista."),
});

const statisticSearchOutputSchema = s.object("A normalized Statista statistic search response.", {
  items: s.array("The statistic search results.", statisticSearchItemSchema),
  totalCount: s.integer("The total number of matching statistic results."),
  took: s.nullable(s.looseObject("The optional Statista timing breakdown.")),
  raw: s.looseObject("The raw Statista search response."),
});

const statisticDataSchema = s.object("A normalized Statista statistic data response.", {
  identifier: s.integer("The Statista statistic identifier."),
  title: s.string("The statistic title returned by Statista."),
  subject: s.string("The statistic subject summary."),
  isPremium: s.boolean("Whether Statista marks the statistic as premium content."),
  description: s.nullable(s.string("The optional statistic description.")),
  link: s.string("The Statista web URL for the statistic."),
  date: s.nullable(s.string("The statistic publication date when returned.")),
  platform: s.string("The Statista platform or locale value returned for the statistic."),
  teaserImageUrls: s.array("The statistic teaser image URLs.", teaserImageSchema),
  chart: s.looseObject("The Statista chart object including graph type and data points."),
  raw: s.looseObject("The raw statistic data response returned by Statista."),
});

const statisticDataOutputSchema = s.object("The response returned when reading statistic data.", {
  statistic: statisticDataSchema,
});

const marketInsightItemSchema = s.object("A normalized Statista Market Insights indicator search result.", {
  identifier: s.string("The Market Insights indicator identifier."),
  title: s.string("The indicator title returned by Statista."),
  subject: s.string("The indicator subject summary."),
  description: s.nullable(s.string("The indicator description when returned.")),
  link: s.string("The Statista web URL for the indicator."),
  updatedAt: s.nullable(s.string("The indicator update date when returned.")),
  industries: s.array(
    "The industries covered by this indicator.",
    s.looseObject("A Statista Market Insights industry object."),
  ),
  coveredTimeframe: s.nullable(s.looseObject("The timeframe covered by this indicator when returned.")),
  coveredGeos: s.nullable(s.record("The geographic coverage map keyed by Statista geo code.", s.string("Geo name."))),
  marketType: s.nullable(s.string("The indicator market type when returned.")),
  marketTypeDescription: s.nullable(s.string("The indicator market type description when returned.")),
  raw: s.looseObject("The raw Market Insights indicator returned by Statista."),
});

const marketInsightSearchOutputSchema = s.object("A normalized Statista Market Insights indicator search response.", {
  items: s.array("The Market Insights indicator results.", marketInsightItemSchema),
  totalCount: s.integer("The total number of matching indicators."),
  raw: s.looseObject("The raw Statista search response."),
});

const consumerInsightAnswerSchema = s.object("A normalized Consumer Insights answer option.", {
  answerId: s.string("The Statista answer identifier."),
  label: s.string("The answer label."),
  order: s.integer("The answer order returned by Statista."),
  code: s.integer("The numeric answer code returned by Statista."),
  raw: s.looseObject("The raw answer object returned by Statista."),
});

const consumerInsightResultSchema = s.object("A normalized Statista Consumer Insights search result.", {
  questionId: s.string("The Statista question identifier."),
  indicator: s.string("The short question indicator."),
  label: s.string("The question text shown to survey respondents."),
  questionType: s.string("The Statista question type."),
  metadata: s.looseObject("The Statista metadata object for the question."),
  answersSubset: s.array("The answer options returned in the search result.", consumerInsightAnswerSchema),
  totalAnswers: s.integer("The number of available answer options."),
  raw: s.looseObject("The raw Consumer Insights result returned by Statista."),
});

const consumerInsightSearchOutputSchema = s.object("A normalized Statista Consumer Insights search response.", {
  results: s.array("The Consumer Insights question results.", consumerInsightResultSchema),
  raw: s.looseObject("The raw Statista search response."),
});

const searchStatisticsInputSchema = s.object(
  "Input parameters for searching Statista statistics.",
  {
    q: querySchema,
    offset: offsetSchema,
    size: statisticsSizeSchema,
    date_from: dateFilterSchema,
    date_to: dateFilterSchema,
    premium: premiumSchema,
  },
  { optional: ["q", "offset", "size", "date_from", "date_to", "premium"] },
);

const getStatisticInputSchema = s.object("Input parameters for reading Statista statistic data.", {
  id: s.positiveInteger("The Statista statistic identifier to retrieve."),
});

const simpleSearchInputSchema = s.object(
  "Input parameters for searching a Statista data family.",
  {
    q: querySchema,
    size: boundedSearchSizeSchema,
  },
  { optional: ["size"] },
);

export const statistaActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "search_statistics",
    description: "Search Statista statistics using natural language or keywords.",
    requiredScopes: [],
    inputSchema: searchStatisticsInputSchema,
    outputSchema: statisticSearchOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_statistic",
    description: "Retrieve chart data and metadata for a Statista statistic identifier.",
    requiredScopes: [],
    inputSchema: getStatisticInputSchema,
    outputSchema: statisticDataOutputSchema,
  }),
  defineProviderAction(service, {
    name: "search_market_insights_indicators",
    description: "Search Statista Market Insights indicators using natural language or keywords.",
    requiredScopes: [],
    inputSchema: simpleSearchInputSchema,
    outputSchema: marketInsightSearchOutputSchema,
  }),
  defineProviderAction(service, {
    name: "search_consumer_insights",
    description: "Search Statista Consumer Insights survey questions and answer options.",
    requiredScopes: [],
    inputSchema: simpleSearchInputSchema,
    outputSchema: consumerInsightSearchOutputSchema,
  }),
];
