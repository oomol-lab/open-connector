import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "mediastack";

const sortSchema = s.stringEnum("Sort order used by the live news request.", [
  "published_desc",
  "published_asc",
  "popularity",
]);

const paginationSchema = s.object("Pagination information returned by Mediastack.", {
  limit: s.integer("Requested page size returned by Mediastack."),
  offset: s.integer("Number of skipped records before the current page."),
  count: s.integer("Number of records returned on the current page."),
  total: s.integer("Total number of matching records available."),
});

const sourceSchema = s.object("Normalized news source returned by Mediastack.", {
  id: s.nullableString("Unique source identifier returned by Mediastack."),
  name: s.nullableString("Display name of the news source."),
  description: s.nullableString("Short description of the news source."),
  category: s.nullableString("Category assigned to the source."),
  country: s.nullableString("Country code assigned to the source."),
  language: s.nullableString("Language code assigned to the source."),
  url: s.nullableString("Homepage URL of the source."),
});

const articleSchema = s.object("Normalized news article returned by Mediastack.", {
  author: s.nullableString("Author name returned by Mediastack."),
  title: s.nullableString("Article title returned by Mediastack."),
  description: s.nullableString("Article summary or excerpt."),
  url: s.nullableString("Canonical article URL."),
  source: s.nullableString("Source name returned by Mediastack."),
  image: s.nullableString("Preview image URL returned by Mediastack."),
  category: s.nullableString("Article category returned by Mediastack."),
  language: s.nullableString("Article language code returned by Mediastack."),
  country: s.nullableString("Article country code returned by Mediastack."),
  publishedAt: s.nullableString("Article publication timestamp returned by Mediastack."),
});

export const mediastackActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "search_news_sources",
    description: "Search Mediastack news sources with language, country, category, and pagination filters.",
    inputSchema: s.object(
      "Input parameters for searching Mediastack news sources.",
      {
        search: s.nonEmptyString("Search text used to match source names or descriptions."),
        countries: s.nonEmptyString("Comma-separated country codes used to filter the returned sources."),
        languages: s.nonEmptyString("Comma-separated language codes used to filter the returned sources."),
        categories: s.nonEmptyString("Comma-separated categories used to filter the returned sources."),
        limit: s.integer("Maximum number of sources to return.", { minimum: 1, maximum: 100 }),
        offset: s.nonNegativeInteger("Number of leading sources to skip."),
      },
      { required: ["search"], optional: ["countries", "languages", "categories", "limit", "offset"] },
    ),
    outputSchema: s.object("News source search response returned by Mediastack.", {
      sources: s.array("News sources returned by Mediastack.", sourceSchema),
      pagination: paginationSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "search_live_news",
    description: "Search live Mediastack news articles with optional keyword, source, location, and sorting filters.",
    inputSchema: s.object(
      "Input parameters for searching Mediastack live news.",
      {
        keywords: s.nonEmptyString("Keywords used to filter returned news articles by title or description."),
        sources: s.nonEmptyString("Comma-separated source identifiers used to filter returned articles."),
        countries: s.nonEmptyString("Comma-separated country codes used to filter returned articles."),
        languages: s.nonEmptyString("Comma-separated language codes used to filter returned articles."),
        categories: s.nonEmptyString("Comma-separated categories used to filter returned articles."),
        sort: sortSchema,
        limit: s.integer("Maximum number of articles to return.", { minimum: 1, maximum: 100 }),
        offset: s.nonNegativeInteger("Number of leading articles to skip."),
      },
      {
        optional: ["keywords", "sources", "countries", "languages", "categories", "sort", "limit", "offset"],
      },
    ),
    outputSchema: s.object("Live news search response returned by Mediastack.", {
      articles: s.array("News articles returned by Mediastack.", articleSchema),
      pagination: paginationSchema,
    }),
  }),
];
