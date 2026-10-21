import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "keenable";

const searchResult = s.requiredObject("One web page that matched the query.", {
  title: s.string("The page title."),
  url: s.url("The page URL."),
  snippet: s.string("Text extracted from the page."),
  acquiredAt: s.nullableString("When Keenable fetched this copy of the page, as an ISO 8601 timestamp."),
});

export const keenableActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "search",
    operationType: "read",
    description:
      "Search the web with Keenable and return matching pages with their title, URL and a text snippet. Optionally limit results to one site or to a publication date range. Works without an API key.",
    requiredScopes: [],
    inputSchema: s.object(
      "Web search input.",
      {
        query: s.nonEmptyString("The search query."),
        maxResults: s.positiveInteger("Maximum number of results to return.", { maximum: 50, default: 10 }),
        site: s.nonEmptyString("Only return pages from this domain, such as docs.python.org."),
        publishedAfter: s.date("Only return pages published after this date, as YYYY-MM-DD."),
        publishedBefore: s.date("Only return pages published before this date, as YYYY-MM-DD."),
      },
      { optional: ["maxResults", "site", "publishedAfter", "publishedBefore"] },
    ),
    outputSchema: s.requiredObject("Web search results.", {
      results: s.array("Matching pages in ranked order.", searchResult),
    }),
    followUpActions: ["keenable.fetch_page"],
  }),
  defineProviderAction(service, {
    name: "fetch_page",
    operationType: "read",
    description: "Fetch one web page with Keenable and return its main content as markdown. Works without an API key.",
    requiredScopes: [],
    inputSchema: s.requiredObject("Page fetch input.", {
      url: s.url("The absolute http or https URL of the page to fetch."),
    }),
    outputSchema: s.requiredObject("The fetched page.", {
      url: s.string("The URL of the fetched page."),
      title: s.nullableString("The page title, when the page has one."),
      content: s.string("The main content of the page as markdown."),
    }),
  }),
];
