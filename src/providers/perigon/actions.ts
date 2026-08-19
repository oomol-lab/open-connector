import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "perigon";

const trimmedString = (description: string): JsonSchema => s.string({ description, minLength: 1, pattern: "\\S" });

const stringList = (description: string, itemDescription: string): JsonSchema =>
  s.array(s.string({ description: itemDescription, minLength: 1, pattern: "\\S" }), {
    description,
    minItems: 1,
  });

const integerList = (description: string, itemDescription: string): JsonSchema =>
  s.array(s.integer({ description: itemDescription }), {
    description,
    minItems: 1,
  });

const pageSchema = s.nonNegativeInteger("The zero-based page number to retrieve.");
const sizeSchema = s.integer("The number of results to return per page.", {
  minimum: 1,
  maximum: 100,
});
const showNumResultsSchema = s.boolean("Whether Perigon should return an exact result count.");

const commonArticleFilterProperties = {
  q: trimmedString("The primary search query using Perigon Boolean search syntax."),
  title: trimmedString("A search query scoped to article titles."),
  desc: trimmedString("A search query scoped to article descriptions."),
  content: trimmedString("A search query scoped to article content."),
  summary: trimmedString("A search query scoped to article summaries."),
  from: trimmedString("The earliest publication date or date-time to include."),
  to: trimmedString("The latest publication date or date-time to include."),
  addDateFrom: trimmedString("The earliest Perigon ingestion date or date-time to include."),
  addDateTo: trimmedString("The latest Perigon ingestion date or date-time to include."),
  category: stringList("The broad news categories to include.", "One Perigon category."),
  topic: stringList("The Perigon topics to include.", "One Perigon topic."),
  source: stringList("The publisher domains or wildcard source patterns to include.", "One source domain."),
  sourceGroup: stringList("The curated Perigon source groups to include.", "One source group."),
  language: stringList("The ISO 639 language codes to include.", "One language code."),
  country: stringList("The source country codes to include.", "One country code."),
  label: stringList("The editorial labels to include.", "One editorial label."),
  medium: stringList("The article media types to include.", "One media type."),
  personName: stringList("The exact person names to include.", "One person name."),
  personWikidataId: stringList("The Wikidata person IDs to include.", "One Wikidata person ID."),
  companyName: trimmedString("The exact company name to include."),
  companyDomain: stringList("The company domains to include.", "One company domain."),
  companyId: stringList("The Perigon company IDs to include.", "One company ID."),
  companySymbol: stringList("The company stock symbols to include.", "One stock symbol."),
  journalistId: stringList("The journalist IDs to include.", "One journalist ID."),
  author: stringList("The author names to include.", "One author name."),
  clusterId: stringList("The story cluster IDs to include.", "One story cluster ID."),
  showReprints: s.boolean("Whether wire-service reprints should be included."),
  sortBy: s.stringEnum("The article sort order.", [
    "relevance",
    "date",
    "reverseDate",
    "addDate",
    "reverseAddDate",
    "pubDate",
    "refreshDate",
  ]),
  page: pageSchema,
  size: sizeSchema,
  showNumResults: showNumResultsSchema,
};

const commonArticleFilterKeys = [
  "q",
  "title",
  "desc",
  "content",
  "summary",
  "from",
  "to",
  "addDateFrom",
  "addDateTo",
  "category",
  "topic",
  "source",
  "sourceGroup",
  "language",
  "country",
  "label",
  "medium",
  "personName",
  "personWikidataId",
  "companyName",
  "companyDomain",
  "companyId",
  "companySymbol",
  "journalistId",
  "author",
  "clusterId",
];

const searchArticlesInputSchema = requireOneFilter(
  s.object(commonArticleFilterProperties, {
    required: [],
    description: "Input parameters for searching Perigon news articles.",
  }),
  commonArticleFilterKeys,
  "At least one article search or filter field is required.",
);

const storyProperties = {
  ...commonArticleFilterProperties,
  name: trimmedString("A search query scoped to story names."),
  initializedFrom: trimmedString("The earliest story initialization date or date-time to include."),
  initializedTo: trimmedString("The latest story initialization date or date-time to include."),
  updatedFrom: trimmedString("The earliest story update date or date-time to include."),
  updatedTo: trimmedString("The latest story update date or date-time to include."),
  minUniqueSources: s.nonNegativeInteger("The minimum number of unique sources in a story."),
  minSourceDiversity: s.number("The minimum unique-source to unique-article ratio.", {
    minimum: 0,
  }),
  sortBy: s.stringEnum("The story sort order.", [
    "createdAt",
    "updatedAt",
    "relevance",
    "count",
    "totalCount",
    "date",
    "reverseDate",
    "addDate",
    "reverseAddDate",
    "pubDate",
    "refreshDate",
  ]),
};

const searchStoriesInputSchema = requireOneFilter(
  s.object(storyProperties, {
    required: [],
    description: "Input parameters for searching Perigon story clusters.",
  }),
  [...commonArticleFilterKeys, "name", "initializedFrom", "initializedTo", "updatedFrom", "updatedTo"],
  "At least one story search or filter field is required.",
);

const sourceProperties = {
  q: trimmedString("The source search query."),
  name: trimmedString("A search query scoped to source names or aliases."),
  sourceGroup: trimmedString("The curated Perigon source group to include."),
  domain: stringList("The exact source domains to include.", "One source domain."),
  paywall: s.boolean("Whether to filter sources by paywall status."),
  minMonthlyPosts: s.nonNegativeInteger("The minimum monthly article count."),
  maxMonthlyPosts: s.nonNegativeInteger("The maximum monthly article count."),
  minMonthlyVisits: s.nonNegativeInteger("The minimum monthly visit count."),
  maxMonthlyVisits: s.nonNegativeInteger("The maximum monthly visit count."),
  showSubdomains: s.boolean("Whether subdomains should be returned as separate sources."),
  sourceLat: s.number("The latitude used for source geo search."),
  sourceLon: s.number("The longitude used for source geo search."),
  sourceMaxDistance: s.number("The source geo-search radius in kilometers.", { minimum: 0 }),
  sortBy: s.stringEnum("The source sort order.", ["createdAt", "updatedAt", "relevance", "count", "totalCount"]),
  page: pageSchema,
  size: sizeSchema,
  showNumResults: showNumResultsSchema,
};

const searchSourcesInputSchema = requireOneFilter(
  s.object(sourceProperties, {
    required: [],
    description: "Input parameters for searching Perigon media sources.",
  }),
  [
    "q",
    "name",
    "sourceGroup",
    "domain",
    "paywall",
    "minMonthlyPosts",
    "maxMonthlyPosts",
    "minMonthlyVisits",
    "maxMonthlyVisits",
    "sourceLat",
    "sourceLon",
  ],
  "At least one source search or filter field is required.",
);

const topicProperties = {
  name: trimmedString("The topic name filter."),
  category: trimmedString("The parent category filter."),
  subcategory: trimmedString("The subcategory filter."),
  page: pageSchema,
  size: sizeSchema,
};

const searchTopicsInputSchema = s.object(topicProperties, {
  required: [],
  description: "Input parameters for browsing or searching Perigon topics.",
});

const journalistProperties = {
  q: trimmedString("The journalist search query."),
  name: trimmedString("A search query scoped to journalist names."),
  twitter: trimmedString("The exact Twitter or X handle without the at sign."),
  minMonthlyPosts: s.nonNegativeInteger("The minimum monthly article count."),
  maxMonthlyPosts: s.nonNegativeInteger("The maximum monthly article count."),
  updatedAtFrom: trimmedString("The earliest journalist profile update date or date-time."),
  updatedAtTo: trimmedString("The latest journalist profile update date or date-time."),
  page: pageSchema,
  size: sizeSchema,
  showNumResults: showNumResultsSchema,
};

const searchJournalistsInputSchema = requireOneFilter(
  s.object(journalistProperties, {
    required: [],
    description: "Input parameters for searching Perigon journalist profiles.",
  }),
  ["q", "name", "twitter", "minMonthlyPosts", "maxMonthlyPosts", "updatedAtFrom", "updatedAtTo"],
  "At least one journalist search or filter field is required.",
);

const getJournalistInputSchema = s.object(
  {
    id: trimmedString("The Perigon journalist ID."),
  },
  {
    required: ["id"],
    description: "Input parameters for retrieving a journalist by ID.",
  },
);

const peopleProperties = {
  q: trimmedString("The person search query."),
  name: trimmedString("A search query scoped to person names."),
  wikidataId: stringList("The Wikidata person IDs to include.", "One Wikidata person ID."),
  page: pageSchema,
  size: sizeSchema,
  showNumResults: showNumResultsSchema,
};

const searchPeopleInputSchema = requireOneFilter(
  s.object(peopleProperties, {
    required: [],
    description: "Input parameters for searching Perigon people entities.",
  }),
  ["q", "name", "wikidataId"],
  "At least one people search or filter field is required.",
);

const companyProperties = {
  q: trimmedString("The company search query."),
  name: trimmedString("A search query scoped to company names."),
  domain: stringList("The company domains to include.", "One company domain."),
  symbol: stringList("The stock symbols to include.", "One stock symbol."),
  id: stringList("The Perigon company IDs to include.", "One company ID."),
  industry: trimmedString("The company industry filter."),
  sector: trimmedString("The company sector filter."),
  country: stringList("The company country codes to include.", "One country code."),
  exchange: trimmedString("The stock exchange filter."),
  page: pageSchema,
  size: sizeSchema,
  showNumResults: showNumResultsSchema,
};

const searchCompaniesInputSchema = requireOneFilter(
  s.object(companyProperties, {
    required: [],
    description: "Input parameters for searching Perigon company entities.",
  }),
  ["q", "name", "domain", "symbol", "id", "industry", "sector", "country", "exchange"],
  "At least one company search or filter field is required.",
);

const wikipediaProperties = {
  q: trimmedString("The Wikipedia search query."),
  title: trimmedString("A search query scoped to Wikipedia page titles."),
  summary: trimmedString("A search query scoped to Wikipedia summaries."),
  text: trimmedString("A search query scoped to Wikipedia page text."),
  reference: trimmedString("A search query scoped to Wikipedia page references."),
  scrapedAtFrom: trimmedString("The earliest Perigon scrape date or date-time to include."),
  scrapedAtTo: trimmedString("The latest Perigon scrape date or date-time to include."),
  wikiRevisionFrom: trimmedString("The earliest Wikipedia revision date or date-time to include."),
  wikiRevisionTo: trimmedString("The latest Wikipedia revision date or date-time to include."),
  pageviewsFrom: s.nonNegativeInteger("The minimum average daily pageview count."),
  pageviewsTo: s.nonNegativeInteger("The maximum average daily pageview count."),
  withPageviews: s.boolean("Whether only pages with pageview data should be returned."),
  id: stringList("The Perigon Wikipedia page IDs to include.", "One Perigon page ID."),
  sectionId: stringList("The Wikipedia section IDs to include.", "One section ID."),
  category: stringList("The Wikipedia categories to include.", "One Wikipedia category."),
  wikiCode: stringList("The wiki project codes to include.", "One wiki project code."),
  wikidataId: stringList("The Wikidata IDs to include.", "One Wikidata ID."),
  wikidataInstanceOfId: stringList("The Wikidata instance-of IDs to include.", "One instance-of ID."),
  wikidataInstanceOfLabel: stringList("The Wikidata instance-of labels to include.", "One instance-of label."),
  wikiNamespace: integerList("The Wikipedia namespaces to include.", "One namespace identifier."),
  wikiPageId: integerList("The Wikipedia page IDs to include.", "One Wikipedia page ID."),
  wikiRevisionId: integerList("The Wikipedia revision IDs to include.", "One revision ID."),
  sortBy: s.stringEnum("The Wikipedia sort order.", [
    "relevance",
    "revisionTsDesc",
    "revisionTsAsc",
    "pageViewsDesc",
    "pageViewsAsc",
    "scrapedAtDesc",
    "scrapedAtAsc",
  ]),
  page: pageSchema,
  size: sizeSchema,
  showNumResults: showNumResultsSchema,
};

const searchWikipediaInputSchema = requireOneFilter(
  s.object(wikipediaProperties, {
    required: [],
    description: "Input parameters for searching Perigon Wikipedia pages.",
  }),
  [
    "q",
    "title",
    "summary",
    "text",
    "reference",
    "id",
    "sectionId",
    "category",
    "wikiCode",
    "wikidataId",
    "wikidataInstanceOfId",
    "wikidataInstanceOfLabel",
    "wikiNamespace",
    "wikiPageId",
    "wikiRevisionId",
  ],
  "At least one Wikipedia search or filter field is required.",
);

const summarizeProperties = {
  ...commonArticleFilterProperties,
  prompt: s.string("Instructions guiding the generated summary.", { maxLength: 2048 }),
  maxArticleCount: s.positiveInteger("The maximum number of matching articles to summarize."),
  returnedArticleCount: s.nonNegativeInteger("The maximum number of source articles to return."),
  maxTokens: s.positiveInteger("The maximum generated-token budget for the summary."),
  temperature: s.number("The model sampling temperature.", { minimum: 0, maximum: 2 }),
  topP: s.number("The nucleus sampling value.", { minimum: 0, maximum: 1 }),
  model: trimmedString("The Perigon-supported language model to use."),
  method: s.stringEnum("The article selection method.", ["ARTICLES", "CLUSTERS"]),
  summarizeFields: s.array(s.stringEnum("One summarization source field.", ["TITLE", "CONTENT", "SUMMARY"]), {
    description: "The article fields Perigon should include in the summarization context.",
    minItems: 1,
    maxItems: 3,
  }),
};

const summarizeNewsInputSchema = requireOneFilter(
  s.object(summarizeProperties, {
    required: [],
    description: "Input parameters for summarizing matching Perigon news articles.",
  }),
  commonArticleFilterKeys,
  "At least one article search or filter field is required for summarization.",
);

const vectorFilterSchema = s.unknownObject(
  "A Perigon vector-search filter object with direct fields or nested AND, OR, and NOT clauses.",
);

const vectorNewsProperties = {
  prompt: trimmedString("The natural-language prompt for semantic news search."),
  page: pageSchema,
  size: sizeSchema,
  pubDateFrom: trimmedString("The earliest article publication date or date-time to include."),
  pubDateTo: trimmedString("The latest article publication date or date-time to include."),
  showReprints: s.boolean("Whether wire-service reprints should be included."),
  filter: vectorFilterSchema,
};

const vectorSearchNewsInputSchema = s.object(vectorNewsProperties, {
  required: ["prompt"],
  description: "Input parameters for Perigon semantic news vector search.",
});

const vectorWikipediaProperties = {
  prompt: trimmedString("The natural-language prompt for semantic Wikipedia search."),
  page: pageSchema,
  size: sizeSchema,
  pageviewsFrom: s.nonNegativeInteger("The minimum average daily pageview count."),
  pageviewsTo: s.nonNegativeInteger("The maximum average daily pageview count."),
  wikiRevisionFrom: trimmedString("The earliest Wikipedia revision date or date-time to include."),
  wikiRevisionTo: trimmedString("The latest Wikipedia revision date or date-time to include."),
  filter: vectorFilterSchema,
};

const vectorSearchWikipediaInputSchema = s.object(vectorWikipediaProperties, {
  required: ["prompt"],
  description: "Input parameters for Perigon semantic Wikipedia vector search.",
});

const loosePayloadSchema = s.unknownObject("One Perigon result object.");
const rawPayloadSchema = s.unknownObject("The raw Perigon response payload.");
const nullableStatusSchema = s.nullable(s.integer("The status code returned by Perigon."));
const nullableNumResultsSchema = s.nullable(
  s.nonNegativeInteger("The result count returned by Perigon when available."),
);

const articlesOutputSchema = s.actionOutput(
  {
    status: nullableStatusSchema,
    numResults: nullableNumResultsSchema,
    articles: s.array("The article objects returned by Perigon.", loosePayloadSchema),
    raw: rawPayloadSchema,
  },
  "The normalized Perigon article search response.",
);

const storiesOutputSchema = s.actionOutput(
  {
    status: nullableStatusSchema,
    numResults: nullableNumResultsSchema,
    stories: s.array("The story cluster objects returned by Perigon.", loosePayloadSchema),
    raw: rawPayloadSchema,
  },
  "The normalized Perigon story search response.",
);

const resultsOutputSchema = (description: string, itemDescription: string): JsonSchema =>
  s.actionOutput(
    {
      status: nullableStatusSchema,
      numResults: nullableNumResultsSchema,
      results: s.array(itemDescription, loosePayloadSchema),
      raw: rawPayloadSchema,
    },
    description,
  );

const topicsOutputSchema = s.actionOutput(
  {
    total: s.nullable(s.nonNegativeInteger("The total number of matching topics when available.")),
    data: s.array("The topic objects returned by Perigon.", loosePayloadSchema),
    raw: rawPayloadSchema,
  },
  "The normalized Perigon topics response.",
);

const getJournalistOutputSchema = s.actionOutput(
  {
    journalist: loosePayloadSchema,
    raw: rawPayloadSchema,
  },
  "The normalized Perigon journalist profile response.",
);

const summaryOutputSchema = s.actionOutput(
  {
    status: nullableStatusSchema,
    numResults: nullableNumResultsSchema,
    summary: s.nullable(s.string("The AI-generated news summary returned by Perigon.")),
    results: s.array("The source article objects returned by Perigon.", loosePayloadSchema),
    raw: rawPayloadSchema,
  },
  "The normalized Perigon summary response.",
);

const vectorOutputSchema = s.actionOutput(
  {
    status: nullableStatusSchema,
    results: s.array("The scored vector-search result objects returned by Perigon.", loosePayloadSchema),
    raw: rawPayloadSchema,
  },
  "The normalized Perigon vector-search response.",
);

export const perigonActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "search_articles",
    description: "Search Perigon news articles with keyword, date, entity, source, and category filters.",
    inputSchema: searchArticlesInputSchema,
    outputSchema: articlesOutputSchema,
  }),
  defineProviderAction(service, {
    name: "search_stories",
    description: "Search Perigon story clusters for evolving news narratives and grouped article coverage.",
    inputSchema: searchStoriesInputSchema,
    outputSchema: storiesOutputSchema,
  }),
  defineProviderAction(service, {
    name: "search_sources",
    description: "Search Perigon media sources by domain, source group, traffic, paywall, and geography filters.",
    inputSchema: searchSourcesInputSchema,
    outputSchema: resultsOutputSchema(
      "The normalized Perigon source search response.",
      "The source objects returned by Perigon.",
    ),
  }),
  defineProviderAction(service, {
    name: "search_topics",
    description: "Browse or search Perigon topics used to classify news content.",
    inputSchema: searchTopicsInputSchema,
    outputSchema: topicsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "search_journalists",
    description: "Search Perigon journalist profiles by name, Twitter handle, post volume, and update date.",
    inputSchema: searchJournalistsInputSchema,
    outputSchema: resultsOutputSchema(
      "The normalized Perigon journalist search response.",
      "The journalist objects returned by Perigon.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_journalist",
    description: "Get one Perigon journalist profile by journalist ID.",
    inputSchema: getJournalistInputSchema,
    outputSchema: getJournalistOutputSchema,
  }),
  defineProviderAction(service, {
    name: "search_people",
    description: "Search Perigon people entities for Wikidata-backed profile metadata.",
    inputSchema: searchPeopleInputSchema,
    outputSchema: resultsOutputSchema(
      "The normalized Perigon people search response.",
      "The people objects returned by Perigon.",
    ),
  }),
  defineProviderAction(service, {
    name: "search_companies",
    description: "Search Perigon company entities by name, domain, symbol, industry, country, and exchange.",
    inputSchema: searchCompaniesInputSchema,
    outputSchema: resultsOutputSchema(
      "The normalized Perigon company search response.",
      "The company objects returned by Perigon.",
    ),
  }),
  defineProviderAction(service, {
    name: "search_wikipedia",
    description: "Search Perigon Wikipedia pages by text, identity, category, revision, and pageview filters.",
    inputSchema: searchWikipediaInputSchema,
    outputSchema: resultsOutputSchema(
      "The normalized Perigon Wikipedia search response.",
      "The Wikipedia page objects returned by Perigon.",
    ),
  }),
  defineProviderAction(service, {
    name: "summarize_news",
    description: "Generate an AI summary over Perigon news articles matching the supplied filters.",
    inputSchema: summarizeNewsInputSchema,
    outputSchema: summaryOutputSchema,
  }),
  defineProviderAction(service, {
    name: "vector_search_news",
    description: "Run semantic vector search over recent Perigon news articles with optional structured filters.",
    inputSchema: vectorSearchNewsInputSchema,
    outputSchema: vectorOutputSchema,
  }),
  defineProviderAction(service, {
    name: "vector_search_wikipedia",
    description: "Run semantic vector search over Perigon Wikipedia content with optional structured filters.",
    inputSchema: vectorSearchWikipediaInputSchema,
    outputSchema: vectorOutputSchema,
  }),
];

function requireOneFilter(schema: JsonSchema, keys: string[], description: string): JsonSchema {
  return {
    ...schema,
    anyOf: keys.map((key) => ({
      required: [key],
    })),
    description: schema.description ?? description,
  };
}
