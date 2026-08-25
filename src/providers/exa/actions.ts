import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "exa";

const exaSearchTypeSchema = s.stringEnum("The Exa search mode to execute.", [
  "neural",
  "fast",
  "auto",
  "deep",
  "deep-reasoning",
  "instant",
]);
const exaCategorySchema = s.stringEnum("The Exa category used to narrow search results.", [
  "company",
  "research paper",
  "news",
  "pdf",
  "github",
  "personal site",
  "people",
  "financial report",
]);
const exaSectionSchema = s.stringEnum("A semantic page section used by Exa content extraction.", [
  "header",
  "navigation",
  "banner",
  "body",
  "sidebar",
  "footer",
  "metadata",
]);
const exaStringArraySchema = (description: string) => s.stringArray(description, { minItems: 1 });
const exaMaxAgeHoursSchema = s.union([s.literal(-1), s.nonNegativeInteger("A non-negative cache age in hours.")], {
  description:
    "Maximum age of cached content in hours. Use -1 to always use cache, 0 to always livecrawl, or a positive integer to require fresher content.",
});
const exaTextOptionsSchema = s.object(
  "Advanced configuration for Exa text extraction.",
  {
    maxCharacters: s.positiveInteger("The maximum number of characters to return for extracted text."),
    includeHtmlTags: s.boolean("Whether Exa should preserve HTML tags in extracted text."),
    verbosity: s.stringEnum("The verbosity level for extracted page text.", ["compact", "standard", "full"]),
    includeSections: s.array("Only include content from these semantic page sections.", exaSectionSchema, {
      minItems: 1,
    }),
    excludeSections: s.array("Exclude content from these semantic page sections.", exaSectionSchema, {
      minItems: 1,
    }),
  },
  { optional: ["maxCharacters", "includeHtmlTags", "verbosity", "includeSections", "excludeSections"] },
);
const exaHighlightsOptionsSchema = s.object(
  "Advanced configuration for Exa highlights.",
  {
    maxCharacters: s.positiveInteger("The maximum number of characters to return across highlights."),
    numSentences: s.positiveInteger("Deprecated by Exa. The number of sentences to include in each highlight snippet."),
    highlightsPerUrl: s.positiveInteger("Deprecated by Exa. The number of highlight snippets to return per URL."),
    query: s.nonEmptyString("A custom query that guides Exa highlight selection."),
  },
  { optional: ["maxCharacters", "numSentences", "highlightsPerUrl", "query"] },
);
const exaSummaryOptionsSchema = s.object(
  "Configuration for an Exa summary response.",
  {
    query: s.nonEmptyString("A custom query that guides Exa summary generation."),
    schema: s.record("A JSON Schema object used for structured Exa summaries.", true),
  },
  { optional: ["query", "schema"] },
);
const exaSubpageTargetSchema = s.union(
  [
    s.nonEmptyString("A single keyword used to locate relevant subpages."),
    s.stringArray("A list of keywords used to locate relevant subpages.", { minItems: 1 }),
  ],
  { description: "Keywords Exa should use when selecting subpages." },
);
const exaExtrasSchema = s.object(
  "Additional Exa extraction options.",
  {
    links: s.nonNegativeInteger("The maximum number of webpage links to return for each result."),
    imageLinks: s.nonNegativeInteger("The maximum number of image links to return for each result."),
  },
  { optional: ["links", "imageLinks"] },
);
const exaContentsOptionsSchema = s.object(
  "The Exa contents request object.",
  {
    text: s.union([s.boolean("Whether Exa should return extracted text."), exaTextOptionsSchema]),
    highlights: s.union([s.boolean("Whether Exa should return highlights."), exaHighlightsOptionsSchema]),
    summary: exaSummaryOptionsSchema,
    livecrawlTimeout: s.nonNegativeInteger("The livecrawl timeout in milliseconds."),
    maxAgeHours: exaMaxAgeHoursSchema,
    subpages: s.nonNegativeInteger("The maximum number of subpages Exa should crawl per result."),
    subpageTarget: exaSubpageTargetSchema,
    extras: exaExtrasSchema,
  },
  {
    optional: [
      "text",
      "highlights",
      "summary",
      "livecrawlTimeout",
      "maxAgeHours",
      "subpages",
      "subpageTarget",
      "extras",
    ],
  },
);
const searchFilterProperties: Record<string, JsonSchema> = {
  includeDomains: exaStringArraySchema("Only return results from these domains."),
  excludeDomains: exaStringArraySchema("Exclude results from these domains."),
  startCrawlDate: s.dateTime("Only return results crawled after this timestamp."),
  endCrawlDate: s.dateTime("Only return results crawled before this timestamp."),
  startPublishedDate: s.dateTime("Only return results published after this timestamp."),
  endPublishedDate: s.dateTime("Only return results published before this timestamp."),
  includeText: exaStringArraySchema("Phrases that must appear in the result text."),
  excludeText: exaStringArraySchema("Phrases that must not appear in the result text."),
  moderation: s.boolean("Whether Exa should filter unsafe content from results."),
  contents: exaContentsOptionsSchema,
};
const exaResultSchema = s.looseObject("An Exa search or contents result object.", {
  id: s.string("The temporary Exa document identifier."),
  url: s.string("The result URL."),
  title: s.string("The result title."),
  publishedDate: s.nullableString("The estimated publication timestamp for the result."),
  author: s.nullableString("The result author."),
  score: s.nullableNumber("The result relevance score."),
});
const exaCostDollarsSchema = s.looseObject("The Exa costDollars object.", {
  total: s.number("The total request cost in US dollars."),
});

export const exaActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "search",
    description: "Search the web with Exa and optionally enrich each result with contents.",
    inputSchema: s.object(
      "The input payload for an Exa search request. includeDomains and excludeDomains cannot be provided together.",
      {
        query: s.nonEmptyString("The search query to send to Exa."),
        additionalQueries: exaStringArraySchema(
          "Additional query variations to use with deep or deep-reasoning search.",
        ),
        type: exaSearchTypeSchema,
        category: exaCategorySchema,
        numResults: s.integer("The number of search results to return, up to 100.", { minimum: 1, maximum: 100 }),
        userLocation: s.string({
          minLength: 2,
          maxLength: 2,
          description: "A two-letter ISO country code used to localize search results.",
        }),
        ...searchFilterProperties,
      },
      {
        optional: [
          "additionalQueries",
          "type",
          "category",
          "numResults",
          "userLocation",
          "includeDomains",
          "excludeDomains",
          "startCrawlDate",
          "endCrawlDate",
          "startPublishedDate",
          "endPublishedDate",
          "includeText",
          "excludeText",
          "moderation",
          "contents",
        ],
      },
    ),
    outputSchema: s.object(
      "The response payload for exa.search.",
      {
        requestId: s.string("The unique identifier for this Exa request."),
        results: s.array("The Exa search results.", exaResultSchema),
        searchType: s.string("The search type Exa selected for the request."),
        output: s.looseObject("The Exa deep search output object."),
        costDollars: exaCostDollarsSchema,
      },
      { optional: ["searchType", "output", "costDollars"] },
    ),
  }),
  defineProviderAction(service, {
    name: "get_contents",
    description: "Fetch text, highlights, or summaries from Exa for URLs or document IDs.",
    inputSchema: s.object(
      "The input payload for fetching Exa contents by URL.",
      {
        urls: s.array("The list of URLs to retrieve content for.", s.url("One URL to retrieve content for."), {
          minItems: 1,
        }),
        ids: exaStringArraySchema("Deprecated. A backward-compatibility list of Exa document IDs."),
        text: s.union([s.boolean("Whether Exa should return extracted text."), exaTextOptionsSchema]),
        highlights: s.union([s.boolean("Whether Exa should return highlights."), exaHighlightsOptionsSchema]),
        summary: exaSummaryOptionsSchema,
        livecrawlTimeout: s.nonNegativeInteger("The livecrawl timeout in milliseconds."),
        maxAgeHours: exaMaxAgeHoursSchema,
        subpages: s.nonNegativeInteger("The maximum number of subpages Exa should crawl per result."),
        subpageTarget: exaSubpageTargetSchema,
        extras: exaExtrasSchema,
      },
      {
        optional: [
          "ids",
          "text",
          "highlights",
          "summary",
          "livecrawlTimeout",
          "maxAgeHours",
          "subpages",
          "subpageTarget",
          "extras",
        ],
      },
    ),
    outputSchema: s.object(
      "The response payload for exa.get_contents.",
      {
        requestId: s.string("The unique identifier for this Exa request."),
        results: s.array("The Exa content results returned successfully.", exaResultSchema),
        statuses: s.array("The fetch status for each requested input item.", s.looseObject("One Exa content status.")),
        costDollars: exaCostDollarsSchema,
      },
      { optional: ["statuses", "costDollars"] },
    ),
  }),
  defineProviderAction(service, {
    name: "answer",
    description: "Generate a citation-backed answer from Exa search results.",
    inputSchema: s.object(
      "The input payload for an Exa answer request.",
      {
        query: s.nonEmptyString("The question or prompt Exa should answer."),
        text: s.boolean("Whether citations should include the full source text."),
      },
      { optional: ["text"] },
    ),
    outputSchema: s.object(
      "The response payload for exa.answer.",
      {
        answer: s.union([
          s.string("The text answer returned by Exa."),
          s.looseObject("The structured answer returned by Exa."),
        ]),
        citations: s.array("The citations supporting the Exa answer.", s.looseObject("An Exa answer citation.")),
        costDollars: exaCostDollarsSchema,
      },
      { optional: ["answer", "costDollars"] },
    ),
  }),
  defineProviderAction(service, {
    name: "find_similar",
    description: "Find pages similar to a given URL and optionally enrich them with contents.",
    inputSchema: s.object(
      "The input payload for an Exa findSimilar request. includeDomains and excludeDomains cannot be provided together.",
      {
        url: s.url("The URL used to find similar pages."),
        excludeSourceDomain: s.boolean("Whether to exclude results from the same domain as the input URL."),
        numResults: s.integer("The number of similar results to return, up to 100.", { minimum: 1, maximum: 100 }),
        ...searchFilterProperties,
      },
      {
        optional: [
          "excludeSourceDomain",
          "numResults",
          "includeDomains",
          "excludeDomains",
          "startCrawlDate",
          "endCrawlDate",
          "startPublishedDate",
          "endPublishedDate",
          "includeText",
          "excludeText",
          "moderation",
          "contents",
        ],
      },
    ),
    outputSchema: s.object(
      "The response payload for exa.find_similar.",
      {
        requestId: s.string("The unique identifier for this Exa request."),
        results: s.array("The Exa similar-page results.", exaResultSchema),
        costDollars: exaCostDollarsSchema,
      },
      { optional: ["costDollars"] },
    ),
  }),
];
