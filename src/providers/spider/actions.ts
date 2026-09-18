import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "spider";

const requestTypeSchema = s.stringEnum("The retrieval engine Spider Cloud should use.", [
  "http",
  "browser",
  "chrome",
  "smart",
]);
const returnFormatSchema = s.stringEnum("The JSON-compatible page content format to return.", [
  "raw",
  "text",
  "html2text",
  "markdown",
  "commonmark",
  "xml",
  "empty",
]);
const dataOutputSchema = s.actionOutput(
  {
    data: s.unknown("The JSON payload returned by Spider Cloud."),
  },
  "The normalized Spider Cloud response.",
);

const pageOptions: Record<string, JsonSchema> = {
  request: requestTypeSchema,
  return_format: returnFormatSchema,
  readability: s.boolean("Whether Spider Cloud should apply readability processing."),
  metadata: s.boolean("Whether Spider Cloud should include page metadata."),
  return_page_links: s.boolean("Whether Spider Cloud should include links found on the page."),
  filter_output_main_only: s.boolean("Whether Spider Cloud should keep only main-page content."),
  respect_robots: s.boolean("Whether Spider Cloud should respect the target site's robots rules."),
  cache: s.boolean("Whether Spider Cloud may use a cached response."),
  request_timeout: s.integer("The upstream page request timeout in milliseconds.", {
    minimum: 1,
  }),
  delay: s.integer("The delay in milliseconds before Spider Cloud captures page content.", {
    minimum: 0,
  }),
};
const pageOptionNames = [
  "request",
  "return_format",
  "readability",
  "metadata",
  "return_page_links",
  "filter_output_main_only",
  "respect_robots",
  "cache",
  "request_timeout",
  "delay",
];

export const spiderActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_credits",
    operationType: "read",
    description: "Get the available credits for the connected Spider Cloud account.",
    inputSchema: s.actionInput({}, [], "No input is required to get Spider Cloud credits."),
    outputSchema: dataOutputSchema,
  }),
  defineProviderAction(service, {
    name: "scrape",
    operationType: "read",
    description: "Scrape one public URL with Spider Cloud and return its JSON response.",
    inputSchema: s.object(
      "Input for scraping one public URL with Spider Cloud.",
      {
        url: s.url("The public URL Spider Cloud should scrape."),
        ...pageOptions,
      },
      { optional: pageOptionNames },
    ),
    outputSchema: dataOutputSchema,
  }),
  defineProviderAction(service, {
    name: "search",
    operationType: "read",
    description: "Search the web with Spider Cloud and optionally fetch result-page content.",
    inputSchema: s.actionInput(
      {
        search: s.nonEmptyString("The web search query."),
        search_limit: s.integer("The maximum number of search results to retrieve.", {
          minimum: 1,
        }),
        fetch_page_content: s.boolean("Whether Spider Cloud should fetch content from each search result."),
        location: s.nonEmptyString("The location name used to localize search results."),
        country: s.string("The country code used to localize search results.", { minLength: 2 }),
        language: s.string("The language code used to localize search results.", { minLength: 2 }),
        page: s.integer("The 1-indexed search result page to retrieve.", { minimum: 1 }),
        request: requestTypeSchema,
        return_format: returnFormatSchema,
      },
      ["search"],
      "Input for a Spider Cloud web search.",
    ),
    outputSchema: dataOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_links",
    operationType: "read",
    description: "Extract links from one public URL with Spider Cloud.",
    inputSchema: s.actionInput(
      {
        url: s.url("The public URL whose links Spider Cloud should extract."),
        request: requestTypeSchema,
        respect_robots: pageOptions.respect_robots,
        cache: pageOptions.cache,
        request_timeout: pageOptions.request_timeout,
      },
      ["url"],
      "Input for extracting links from one public URL with Spider Cloud.",
    ),
    outputSchema: dataOutputSchema,
  }),
];
