import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "world_news_api";

const nullableOptionalString = (description: string): JsonSchema => s.nullableString(description);

const articleSchema = s.looseObject("One article returned by World News API.", {
  id: s.integer("The unique article identifier returned by World News API."),
  title: s.string("The article headline."),
  text: nullableOptionalString("The full article text returned by World News API."),
  summary: nullableOptionalString("The short article summary returned by World News API."),
  url: s.string("The canonical article URL."),
  image: nullableOptionalString("The preview image URL returned by World News API."),
  video: nullableOptionalString("The preview video URL returned by World News API."),
  publish_date: s.string("The article publish timestamp."),
  author: nullableOptionalString("The primary author returned by World News API."),
  authors: s.array(
    "The author names returned by World News API.",
    s.string("One author name returned by World News API."),
  ),
  language: s.string("The language code associated with the article."),
  source_country: s.string("The source country code associated with the article."),
  sentiment: s.number("The sentiment score returned by World News API."),
  category: s.string("The article category returned by World News API."),
});

const sourceSchema = s.looseObject("One news source returned by World News API.", {
  url: s.string("The homepage URL of the news source."),
  name: s.string("The display name of the news source."),
  language: s.string("The language code of the news source."),
});

const searchNewsOptionalFields = [
  "text",
  "language",
  "sourceCountries",
  "categories",
  "earliestPublishDate",
  "latestPublishDate",
  "newsSources",
  "authors",
  "locationFilter",
  "entities",
  "sort",
  "sortDirection",
  "minSentiment",
  "maxSentiment",
  "offset",
  "number",
];
const searchNewsFilterFields = searchNewsOptionalFields.filter(
  (field) => field !== "sort" && field !== "sortDirection" && field !== "offset" && field !== "number",
);
const searchNewsSourcesOptionalFields = ["name", "language", "sourceCountry"];

const searchNewsInputSchema: JsonSchema = {
  ...s.object(
    "Input parameters for searching news articles with World News API.",
    {
      text: s.nonEmptyString("Keywords or phrases used to search matching articles."),
      language: s.string("The language code used to filter matching articles.", { minLength: 2, maxLength: 8 }),
      sourceCountries: s.nonEmptyString(
        "A comma-separated list of source country codes used to filter matching articles.",
      ),
      categories: s.nonEmptyString("A comma-separated list of categories used to filter matching articles."),
      earliestPublishDate: s.nonEmptyString("The earliest publish date or timestamp accepted by World News API."),
      latestPublishDate: s.nonEmptyString("The latest publish date or timestamp accepted by World News API."),
      newsSources: s.nonEmptyString("A comma-separated list of source URLs used to filter matching articles."),
      authors: s.nonEmptyString("A comma-separated list of author names used to filter matching articles."),
      locationFilter: s.nonEmptyString(
        "A latitude,longitude,radius filter used to constrain matching articles by location.",
      ),
      entities: s.nonEmptyString("A comma-separated list of entity filters accepted by World News API."),
      sort: s.stringEnum("The sorting mode used for the article search request.", ["publish-time", "relevance"]),
      sortDirection: s.stringEnum("The sort direction used for the article search request.", ["asc", "desc"]),
      minSentiment: s.number("The minimum sentiment score accepted for matching articles.", {
        minimum: -1,
        maximum: 1,
      }),
      maxSentiment: s.number("The maximum sentiment score accepted for matching articles.", {
        minimum: -1,
        maximum: 1,
      }),
      offset: s.nonNegativeInteger("The zero-based result offset for pagination."),
      number: s.positiveInteger("The maximum number of articles to return.", { maximum: 100 }),
    },
    { optional: searchNewsOptionalFields },
  ),
  anyOf: searchNewsFilterFields.map((field) => ({ required: [field] })),
};

const searchNewsSourcesInputSchema: JsonSchema = {
  ...s.object(
    "Input parameters for searching news sources with World News API.",
    {
      name: s.nonEmptyString("The source name used to search matching news sources."),
      language: s.string("The language code used to filter matching news sources.", { minLength: 2, maxLength: 8 }),
      sourceCountry: s.string("The source country code used to filter matching news sources.", {
        minLength: 2,
        maxLength: 2,
      }),
    },
    { optional: searchNewsSourcesOptionalFields },
  ),
  anyOf: searchNewsSourcesOptionalFields.map((field) => ({ required: [field] })),
};

export const worldNewsApiActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "search_news",
    description: "Search news articles with World News API using the first-pass filtering subset.",
    inputSchema: searchNewsInputSchema,
    outputSchema: s.looseObject("The article search response returned by World News API.", {
      offset: s.integer("The zero-based offset used for the current page."),
      number: s.integer("The number of items requested for the current page."),
      available: s.integer("The total number of available articles matching the request."),
      news: s.array("The news articles returned by the request.", articleSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_top_news",
    description: "Retrieve top-news clusters for one source country and optional language or date filters.",
    inputSchema: s.object(
      "Input parameters for retrieving top news with World News API.",
      {
        sourceCountry: s.string("The source country code used to retrieve top news.", { minLength: 2, maxLength: 2 }),
        language: s.string("The language code used to retrieve top news.", { minLength: 2, maxLength: 8 }),
        date: s.date("The calendar date used to retrieve top news in YYYY-MM-DD format."),
      },
      { optional: ["language", "date"] },
    ),
    outputSchema: s.looseObject("The top-news response returned by World News API.", {
      top_news: s.array(
        "The clustered top-news results.",
        s.looseObject("One top-news cluster returned by World News API.", {
          news: s.array("The news items grouped into one top-news cluster.", articleSchema),
        }),
      ),
      language: s.string("The language used for the top-news response."),
      country: s.string("The country used for the top-news response."),
    }),
  }),
  defineProviderAction(service, {
    name: "retrieve_news",
    description: "Retrieve one or more articles by identifier from World News API.",
    inputSchema: s.actionInput(
      {
        ids: s.array(
          "The article identifiers to retrieve.",
          s.integer("One article identifier returned by World News API."),
          { minItems: 1 },
        ),
      },
      ["ids"],
      "Input parameters for retrieving articles by identifier.",
    ),
    outputSchema: s.looseObject("The article retrieval response returned by World News API.", {
      news: s.array("The articles retrieved by identifier.", articleSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "search_news_sources",
    description: "Search World News API sources by name, language, or source country.",
    inputSchema: searchNewsSourcesInputSchema,
    outputSchema: s.looseObject("The news source search response returned by World News API.", {
      available: s.integer("The total number of news sources matching the request."),
      sources: s.array("The news sources returned by the request.", sourceSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_geo_coordinates",
    description: "Resolve a location string to latitude and longitude with World News API.",
    inputSchema: s.object(
      "Input parameters for looking up geo coordinates with World News API.",
      {
        location: s.nonEmptyString("The location text to geocode."),
        language: s.string("The language code used to localize the geocoding response.", {
          minLength: 2,
          maxLength: 8,
        }),
      },
      { optional: ["language"] },
    ),
    outputSchema: s.looseObject("The geo-coordinate lookup response returned by World News API.", {
      latitude: s.number("The latitude coordinate resolved for the requested location."),
      longitude: s.number("The longitude coordinate resolved for the requested location."),
      city: nullableOptionalString("The city name resolved for the requested location."),
    }),
  }),
];
