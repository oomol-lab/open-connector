import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "currents_api";

const nonEmptyString = (description: string) => s.nonEmptyString(description);
const optionalPositiveInteger = (description: string) => s.positiveInteger(description);

const newsItemSchema = s.looseObject("A single news article returned by Currents.", {
  id: nonEmptyString("Unique Currents article identifier."),
  title: nonEmptyString("Article headline returned by Currents."),
  description: nonEmptyString("Article summary returned by Currents."),
  url: nonEmptyString("Canonical article URL."),
  author: nonEmptyString("Publisher or author name reported by Currents."),
  image: nonEmptyString("Image URL associated with the article."),
  language: nonEmptyString("Language code returned for the article."),
  category: s.array(nonEmptyString("Category value returned by Currents for the article."), {
    description: "Article categories returned by Currents.",
  }),
  published: nonEmptyString("Published timestamp string returned by Currents."),
});

const newsCollectionOutputSchema = s.looseRequiredObject(
  "Currents news collection response.",
  {
    status: nonEmptyString("Top-level request status returned by Currents."),
    news: s.array(newsItemSchema, { description: "News articles returned by Currents for this request." }),
    page_number: s.integer("Current page number returned by Currents."),
    nextPage: nonEmptyString("Cursor token returned by Currents for fetching the next search page."),
  },
  { optional: ["page_number", "nextPage"] },
);

const latestNewsInputSchema = s.object(
  {
    language: nonEmptyString("Comma-separated language codes used to filter the latest news feed."),
    country: nonEmptyString("Comma-separated region codes used to filter the latest news feed."),
    category: nonEmptyString("Comma-separated category values used to filter the latest news feed."),
    type: nonEmptyString("Article type filter forwarded to Currents."),
    domain: nonEmptyString("Comma-separated domains to include in the latest news feed."),
    domain_not: nonEmptyString("Comma-separated domains to exclude from the latest news feed."),
    page_number: optionalPositiveInteger("One-based page number to request from Currents."),
    page_size: optionalPositiveInteger("Maximum number of news articles to request from Currents."),
  },
  {
    optional: ["language", "country", "category", "type", "domain", "domain_not", "page_number", "page_size"],
    description: "Input parameters for retrieving the latest Currents news feed.",
  },
);

const searchNewsInputSchema = s.object(
  {
    keywords: nonEmptyString("Keyword query forwarded to Currents search."),
    language: nonEmptyString("Comma-separated language codes used to filter search."),
    country: nonEmptyString("Comma-separated region codes used to filter search."),
    category: nonEmptyString("Comma-separated category values used to filter search."),
    start_date: s.dateTime("UTC timestamp filter in ISO 8601 format, such as 2026-04-29T00:00:00Z."),
    end_date: s.dateTime("UTC timestamp filter in ISO 8601 format, such as 2026-04-29T00:00:00Z."),
    type: nonEmptyString("Article type filter forwarded to Currents search."),
    domain: nonEmptyString("Comma-separated domains to include in the search results."),
    domain_not: nonEmptyString("Comma-separated domains to exclude from the search results."),
    author: nonEmptyString("Comma-separated author names used to filter search."),
    page_number: optionalPositiveInteger("One-based page number to request from Currents."),
    page_size: optionalPositiveInteger("Maximum number of news articles to request from Currents search."),
    cursor: nonEmptyString("Cursor token returned by Currents for deep pagination."),
  },
  {
    optional: [
      "keywords",
      "language",
      "country",
      "category",
      "start_date",
      "end_date",
      "type",
      "domain",
      "domain_not",
      "author",
      "page_number",
      "page_size",
      "cursor",
    ],
    description: "Input parameters for searching Currents news articles.",
  },
);

const taxonomyStatusSchema = nonEmptyString("Top-level request status returned by Currents.");
const taxonomyDescriptionSchema = nonEmptyString(
  "Human-readable description returned by Currents for this taxonomy payload.",
);

export const currentsApiActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_latest_news",
    description: "Retrieve the latest Currents news feed with optional language and region filters.",
    inputSchema: latestNewsInputSchema,
    outputSchema: newsCollectionOutputSchema,
  }),
  defineProviderAction(service, {
    name: "search_news",
    description: "Search Currents news articles with keyword, taxonomy, and time-range filters.",
    inputSchema: searchNewsInputSchema,
    outputSchema: newsCollectionOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_available_languages",
    description: "List the language codes currently supported by Currents.",
    inputSchema: s.object({}, { description: "No input is required for listing Currents languages." }),
    outputSchema: s.object(
      {
        status: taxonomyStatusSchema,
        languages: s.record(
          "Language display names mapped to Currents language codes.",
          s.string("One Currents language code."),
        ),
        description: taxonomyDescriptionSchema,
      },
      {
        required: ["status", "languages"],
        optional: ["description"],
        description: "Currents available languages response.",
      },
    ),
  }),
  defineProviderAction(service, {
    name: "list_available_regions",
    description: "List the region codes currently supported by Currents.",
    inputSchema: s.object({}, { description: "No input is required for listing Currents regions." }),
    outputSchema: s.object(
      {
        status: taxonomyStatusSchema,
        regions: s.record(
          "Region display names mapped to Currents region codes.",
          s.string("One Currents region code."),
        ),
        description: taxonomyDescriptionSchema,
      },
      {
        required: ["status", "regions"],
        optional: ["description"],
        description: "Currents available regions response.",
      },
    ),
  }),
  defineProviderAction(service, {
    name: "list_available_categories",
    description: "List the news categories currently supported by Currents.",
    inputSchema: s.object({}, { description: "No input is required for listing Currents categories." }),
    outputSchema: s.object(
      {
        status: taxonomyStatusSchema,
        categories: s.array(nonEmptyString("Category value returned by Currents."), {
          description: "Categories currently supported by Currents.",
        }),
        description: taxonomyDescriptionSchema,
      },
      {
        required: ["status", "categories"],
        optional: ["description"],
        description: "Currents available categories response.",
      },
    ),
  }),
];
