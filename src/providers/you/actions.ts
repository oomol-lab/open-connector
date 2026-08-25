import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "you";

const rawObjectSchema = s.looseObject("A JSON object passed through to or from You.com.");
const stringArraySchema = (description: string) =>
  s.array(description, s.string("One value.", { minLength: 1 }), { minItems: 1 });
const sourceControlSchema = s.object(
  "Controls which web sources the research agent searches and visits.",
  {
    includeDomains: stringArraySchema("Domains to restrict results to. Cannot be combined with excludeDomains."),
    excludeDomains: stringArraySchema("Domains to exclude from results. Cannot be combined with includeDomains."),
    boostDomains: stringArraySchema("Domains to boost in ranking without filtering out other domains."),
    freshness: s.string("The freshness filter, such as day, week, month, year, or YYYY-MM-DDtoYYYY-MM-DD.", {
      minLength: 1,
    }),
    country: s.string("The country code that determines the geographical focus of the web results.", {
      minLength: 2,
    }),
  },
  { optional: ["includeDomains", "excludeDomains", "boostDomains", "freshness", "country"] },
);

const contentSchema = s.object(
  "The live-crawled page contents returned for a search result.",
  {
    html: s.string("The HTML content of the page."),
    markdown: s.string("The Markdown content of the page."),
  },
  { optional: ["html", "markdown"] },
);
const webResultSchema = s.object(
  "One web search result returned by You.com.",
  {
    url: s.string("The URL of the search result."),
    title: s.string("The title or name of the search result."),
    description: s.string("A brief description of the search result."),
    snippets: s.array("Text snippets from the search result.", s.string("One result snippet.")),
    thumbnailUrl: s.string("The URL of the result thumbnail."),
    pageAge: s.string("The publication or crawl timestamp of the result."),
    contents: contentSchema,
    authors: s.array("The authors of the search result.", s.string("One author name.")),
    faviconUrl: s.string("The URL of the result domain favicon."),
    raw: rawObjectSchema,
  },
  {
    optional: [
      "url",
      "title",
      "description",
      "snippets",
      "thumbnailUrl",
      "pageAge",
      "contents",
      "authors",
      "faviconUrl",
    ],
  },
);
const newsResultSchema = s.object(
  "One news search result returned by You.com.",
  {
    url: s.string("The URL of the news result."),
    title: s.string("The title of the news result."),
    description: s.string("A brief description of the news result."),
    pageAge: s.string("The publication timestamp of the news result."),
    thumbnailUrl: s.string("The URL of the news thumbnail."),
    contents: contentSchema,
    raw: rawObjectSchema,
  },
  { optional: ["url", "title", "description", "pageAge", "thumbnailUrl", "contents"] },
);
const researchSourceSchema = s.object(
  "One source used to generate a research answer.",
  {
    url: s.string("The URL of the source webpage."),
    title: s.string("The title of the source webpage."),
    snippets: s.array("Relevant excerpts from the source page.", s.string("One source snippet.")),
    raw: rawObjectSchema,
  },
  { optional: ["title", "snippets"] },
);
const researchOutputSchema = s.object("The research answer and its supporting sources.", {
  content: s.anyOf("The answer content as Markdown text or a structured JSON object.", [
    s.string("The answer content as Markdown text."),
    rawObjectSchema,
  ]),
  contentType: s.string("The format of the content field."),
  sources: s.array("Sources used to generate the answer.", researchSourceSchema),
  raw: rawObjectSchema,
});

export const youActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "search",
    description: "Search web and news sources with the You.com Search API.",
    inputSchema: s.object(
      "The input payload for searching You.com.",
      {
        query: s.string("The search query used to retrieve relevant results.", { minLength: 1 }),
        count: s.integer("The maximum number of search results to return per section.", { minimum: 1 }),
        freshness: s.string("The freshness filter.", { minLength: 1 }),
        offset: s.integer("The pagination offset calculated in multiples of count.", { minimum: 0, maximum: 9 }),
        country: s.string("The country code that determines the geographical focus of results.", { minLength: 2 }),
        language: s.string("The language of the web results in BCP 47 format.", { minLength: 2 }),
        safesearch: s.stringEnum("The safesearch content moderation setting.", ["off", "moderate", "strict"]),
        livecrawl: s.stringEnum("The result sections to live-crawl for full page content.", ["web", "news", "all"]),
        livecrawlFormats: s.array(
          "The formats to return when livecrawl is enabled.",
          s.stringEnum("One livecrawl format.", ["html", "markdown"]),
          { minItems: 1 },
        ),
        includeDomains: stringArraySchema("Domains to restrict search results to."),
        excludeDomains: stringArraySchema("Domains to exclude from search results."),
        boostDomains: stringArraySchema("Domains to boost in search ranking."),
        crawlTimeout: s.integer("The maximum time in seconds to wait for page content.", { minimum: 1, maximum: 60 }),
      },
      {
        optional: [
          "count",
          "freshness",
          "offset",
          "country",
          "language",
          "safesearch",
          "livecrawl",
          "livecrawlFormats",
          "includeDomains",
          "excludeDomains",
          "boostDomains",
          "crawlTimeout",
        ],
      },
    ),
    outputSchema: s.object("The normalized You.com search response.", {
      web: s.array("Web results returned by You.com.", webResultSchema),
      news: s.array("News results returned by You.com.", newsResultSchema),
      metadata: s.looseObject("Metadata returned with a You.com search response."),
      raw: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "fetch_contents",
    description: "Fetch HTML, Markdown, or metadata for one or more webpages with You.com.",
    inputSchema: s.object(
      "The input payload for fetching webpage contents.",
      {
        urls: s.array("Webpage URLs to fetch contents from.", s.string("One webpage URL.", { minLength: 1 }), {
          minItems: 1,
        }),
        formats: s.array(
          "Content formats to return for each webpage.",
          s.stringEnum("One content format.", ["html", "markdown", "metadata"]),
          { minItems: 1 },
        ),
        crawlTimeout: s.integer("The maximum time in seconds to wait for page content.", { minimum: 1, maximum: 60 }),
      },
      { optional: ["formats", "crawlTimeout"] },
    ),
    outputSchema: s.object("The normalized webpage contents returned by You.com.", {
      pages: s.array("Fetched webpage contents.", s.looseObject("One webpage content result returned by You.com.")),
      raw: s.array("The raw content response array returned by You.com.", rawObjectSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "research",
    description: "Generate a cited research answer with the You.com Research API.",
    inputSchema: s.object(
      "The input payload for You.com research.",
      {
        input: s.string("The research question requiring in-depth investigation.", { minLength: 1, maxLength: 40000 }),
        researchEffort: s.stringEnum("How much effort the Research API spends on the question.", [
          "lite",
          "standard",
          "deep",
          "exhaustive",
        ]),
        sourceControl: sourceControlSchema,
        outputSchema: rawObjectSchema,
      },
      { optional: ["researchEffort", "sourceControl", "outputSchema"] },
    ),
    outputSchema: s.object("The normalized research response returned by You.com.", {
      output: researchOutputSchema,
      raw: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "finance_research",
    description: "Generate a cited finance-grade answer with the You.com Finance Research API.",
    inputSchema: s.object(
      "The input payload for You.com finance research.",
      {
        input: s.string("The financial research question requiring in-depth investigation.", {
          minLength: 1,
          maxLength: 40000,
        }),
        researchEffort: s.stringEnum("How much effort the Finance Research API spends on the question.", [
          "deep",
          "exhaustive",
        ]),
      },
      { optional: ["researchEffort"] },
    ),
    outputSchema: s.object("The normalized finance research response returned by You.com.", {
      output: researchOutputSchema,
      raw: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_account_balance",
    description: "Get the remaining You.com credit balance for the API key account.",
    inputSchema: s.object("The input payload for getting the account balance.", {}),
    outputSchema: s.object("The normalized You.com account balance response.", {
      type: s.string("The billing entity type returned by You.com."),
      id: s.string("The stable hashed identifier for the billing entity."),
      balanceCents: s.number("The remaining credit balance in cents."),
      balanceUsd: s.number("The remaining credit balance converted to US dollars."),
      raw: rawObjectSchema,
    }),
  }),
];
