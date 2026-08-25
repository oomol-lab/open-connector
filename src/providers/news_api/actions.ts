import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "news_api";

const countryCodes = [
  "ae",
  "ar",
  "at",
  "au",
  "be",
  "bg",
  "br",
  "ca",
  "ch",
  "cn",
  "co",
  "cu",
  "cz",
  "de",
  "eg",
  "fr",
  "gb",
  "gr",
  "hk",
  "hu",
  "id",
  "ie",
  "il",
  "in",
  "is",
  "it",
  "jp",
  "kr",
  "lt",
  "lv",
  "ma",
  "mx",
  "my",
  "ng",
  "nl",
  "no",
  "nz",
  "ph",
  "pl",
  "pt",
  "ro",
  "rs",
  "ru",
  "sa",
  "se",
  "sg",
  "si",
  "sk",
  "th",
  "tr",
  "tw",
  "ua",
  "us",
  "ve",
  "za",
];
const headlineCountryCodes = countryCodes.filter((country) => country !== "is");
const languageCodes = ["ar", "de", "en", "es", "fr", "he", "it", "nl", "no", "pt", "ru", "sv", "ud", "zh"];
const categories = ["business", "entertainment", "general", "health", "science", "sports", "technology"];

const articleSchema = s.looseObject("One article returned by News API.", {
  source: s.looseObject("The source metadata for the article.", {
    id: s.nullableString("The source identifier for the article."),
    name: s.string("The display name of the article source."),
  }),
  author: s.nullableString("The author of the article."),
  title: s.string("The article title."),
  description: s.nullableString("The short description or snippet."),
  url: s.url("The canonical URL of the article."),
  urlToImage: s.nullableString("The associated image URL."),
  publishedAt: s.dateTime("The article publication timestamp."),
  content: s.nullableString("The content excerpt returned by News API."),
});
const articlesOutputSchema = s.looseRequiredObject("News API article search response.", {
  status: s.string("Top-level News API status."),
  totalResults: s.integer("Total number of matching articles."),
  articles: s.array("Articles returned by News API.", articleSchema),
});
const sourceSchema = s.looseObject("One source returned by News API.", {
  id: s.string("The unique source identifier."),
  name: s.string("The display name of the source."),
  description: s.string("The short description of the source."),
  url: s.url("The source homepage URL."),
  category: s.string("The source category."),
  language: s.string("The source language."),
  country: s.string("The source country."),
});
const sourcesOutputSchema = s.looseRequiredObject("News API source listing response.", {
  status: s.string("Top-level News API status."),
  sources: s.array("Sources returned by News API.", sourceSchema),
});

const everythingInputSchema = {
  ...s.object(
    "Input parameters for the News API everything endpoint.",
    {
      q: s.nonEmptyString("Keywords or phrases to search for in the article title and body."),
      from: s.string("The oldest date or date-time allowed for articles in the result set."),
      to: s.string("The newest date or date-time allowed for articles in the result set."),
      sortBy: s.stringEnum("The order used to sort article results.", ["relevancy", "popularity", "publishedAt"]),
      sources: s.nonEmptyString("A comma-separated list of source identifiers to include."),
      domains: s.nonEmptyString("A comma-separated list of domains to include."),
      excludeDomains: s.nonEmptyString("A comma-separated list of domains to exclude."),
      language: s.stringEnum("The ISO 639-1 language code used by the request.", languageCodes),
      qInTitle: s.nonEmptyString("Keywords or phrases to search for only in article titles."),
      pageSize: s.integer("The number of results to return per page.", { minimum: 1, maximum: 100 }),
      page: s.positiveInteger("The page number to return."),
    },
    {
      optional: [
        "q",
        "from",
        "to",
        "sortBy",
        "sources",
        "domains",
        "excludeDomains",
        "language",
        "qInTitle",
        "pageSize",
        "page",
      ],
    },
  ),
  anyOf: [{ required: ["q"] }, { required: ["qInTitle"] }, { required: ["sources"] }, { required: ["domains"] }],
} satisfies JsonSchema;

const topHeadlinesInputSchema = {
  ...s.object(
    "Input parameters for the News API top headlines endpoint.",
    {
      q: s.nonEmptyString("Keywords or phrases to search for in the article title and body."),
      country: s.stringEnum("The country code to retrieve headlines for.", headlineCountryCodes),
      category: s.stringEnum("The news category filter.", categories),
      sources: s.nonEmptyString("A comma-separated list of source identifiers to include."),
      pageSize: s.integer("The number of results to return per page.", { minimum: 1, maximum: 100 }),
      page: s.positiveInteger("The page number to return."),
    },
    { optional: ["q", "country", "category", "sources", "pageSize", "page"] },
  ),
  anyOf: [{ required: ["q"] }, { required: ["country"] }, { required: ["category"] }, { required: ["sources"] }],
} satisfies JsonSchema;

export const newsApiActions: readonly ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_everything",
    description: "Search every article published by News API using the official everything endpoint.",
    inputSchema: everythingInputSchema,
    outputSchema: articlesOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_top_headlines",
    description: "Retrieve current top and breaking headlines using the official top headlines endpoint.",
    inputSchema: topHeadlinesInputSchema,
    outputSchema: articlesOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_sources",
    description: "List available news sources using the official sources endpoint.",
    inputSchema: s.object(
      "Input parameters for the News API sources endpoint.",
      {
        category: s.stringEnum("The source category filter.", categories),
        language: s.stringEnum("The ISO 639-1 language code used by the source listing request.", languageCodes),
        country: s.stringEnum("The country code to retrieve sources for.", countryCodes),
      },
      { optional: ["category", "language", "country"] },
    ),
    outputSchema: sourcesOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_v1_articles",
    description:
      "Provide a compatibility wrapper for the legacy v1 articles action using top headlines with one source.",
    inputSchema: s.object(
      "Input parameters for the legacy News API v1 articles compatibility action.",
      {
        source: s.nonEmptyString("The legacy single-source identifier."),
        sortBy: s.stringEnum("The legacy v1 sort order requested by the caller.", ["top"]),
      },
      { required: ["source"], optional: ["sortBy"] },
    ),
    outputSchema: articlesOutputSchema,
  }),
];
