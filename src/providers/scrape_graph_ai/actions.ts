import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "scrape_graph_ai";

const looseJsonObjectSchema = s.looseObject("A loose JSON object.");
const fetchConfigSchema = s.object(
  "Fetch-time options used when ScrapeGraphAI retrieves a page.",
  {
    mode: s.stringEnum("The fetch mode used by ScrapeGraphAI.", ["auto", "fast", "js"]),
    stealth: s.boolean("Whether ScrapeGraphAI should use residential proxy and anti-bot headers."),
    headers: s.record(
      "Custom HTTP headers ScrapeGraphAI should send while fetching the target page.",
      s.string("One custom HTTP header value."),
    ),
    cookies: s.record(
      "Cookies ScrapeGraphAI should send while fetching the target page.",
      s.string("One cookie value."),
    ),
    scrolls: s.integer("The number of scrolls for infinite-scroll pages.", { minimum: 0, maximum: 100 }),
    wait: s.integer("The milliseconds to wait after page load.", { minimum: 0, maximum: 30000 }),
    timeout: s.integer("The page fetch timeout in milliseconds.", { minimum: 1000, maximum: 60000 }),
    country: s.string("The ISO 3166-1 alpha-2 country code for geo-targeted proxy use."),
  },
  { optional: ["mode", "stealth", "headers", "cookies", "scrolls", "wait", "timeout", "country"] },
);

const formatSchema = s.object(
  "One ScrapeGraphAI scrape output format descriptor.",
  {
    type: s.stringEnum("The output format type to return.", [
      "markdown",
      "html",
      "links",
      "images",
      "summary",
      "json",
      "branding",
      "screenshot",
    ]),
    mode: s.stringEnum("The markdown or HTML processing mode for this format.", ["normal", "reader", "prune"]),
    prompt: s.string("The extraction prompt used when type is json.", { minLength: 1 }),
    schema: looseJsonObjectSchema,
    fullPage: s.boolean("Whether screenshot output should capture the full page."),
    width: s.positiveInteger("The screenshot viewport width in pixels."),
    height: s.positiveInteger("The screenshot viewport height in pixels."),
    quality: s.integer("The screenshot image quality requested from ScrapeGraphAI."),
  },
  { optional: ["mode", "prompt", "schema", "fullPage", "width", "height", "quality"] },
);

const scrapeInputSchema = s.object(
  "The input payload for scraping a public URL with ScrapeGraphAI.",
  {
    url: s.url("The public URL to fetch."),
    formats: s.array("The output formats to return from ScrapeGraphAI.", formatSchema, { minItems: 1 }),
    contentType: s.string("The content type override, such as text/html or application/pdf."),
    fetchConfig: fetchConfigSchema,
  },
  { optional: ["contentType", "fetchConfig"] },
);

const extractInputSchema: JsonSchema = {
  ...s.object(
    "The input payload for extracting structured data with ScrapeGraphAI.",
    {
      url: s.url("The public URL to extract from."),
      html: s.string("Raw HTML content to extract from.", { minLength: 1 }),
      markdown: s.string("Markdown content to extract from.", { minLength: 1 }),
      prompt: s.string("The natural-language description of what to extract.", { minLength: 1 }),
      schema: looseJsonObjectSchema,
      mode: s.stringEnum("The HTML pre-processing mode.", ["normal", "reader", "prune"]),
      fetchConfig: fetchConfigSchema,
    },
    { optional: ["url", "html", "markdown", "schema", "mode", "fetchConfig"] },
  ),
  oneOf: [{ required: ["url"] }, { required: ["html"] }, { required: ["markdown"] }],
};

const searchInputSchema = s.object(
  "The input payload for searching the web with ScrapeGraphAI.",
  {
    query: s.string("The search query.", { minLength: 1 }),
    numResults: s.integer("The number of search results to return and fetch.", { minimum: 1, maximum: 20 }),
    prompt: s.string("The optional extraction prompt to apply across the fetched search results.", { minLength: 1 }),
    schema: looseJsonObjectSchema,
    format: s.stringEnum("The inline content format for each search result.", ["markdown", "html"]),
    timeRange: s.stringEnum("The recency filter for search results.", [
      "past_hour",
      "past_24_hours",
      "past_week",
      "past_month",
      "past_year",
    ]),
    locationGeoCode: s.string("The ISO 3166-1 alpha-2 country code used to localize search results."),
    fetchConfig: fetchConfigSchema,
  },
  {
    optional: ["numResults", "prompt", "schema", "format", "timeRange", "locationGeoCode", "fetchConfig"],
  },
);

const listHistoryInputSchema = s.object(
  "The input payload for listing recent ScrapeGraphAI history entries.",
  {
    page: s.integer("The 1-indexed history page number to fetch.", { minimum: 1 }),
    limit: s.integer("The number of history entries to return per page.", { minimum: 1 }),
    service: s.stringEnum("The ScrapeGraphAI service type to filter by.", [
      "scrape",
      "extract",
      "search",
      "monitor",
      "crawl",
      "schema",
    ]),
  },
  { optional: ["page", "limit", "service"] },
);

const usageSchema = s.looseObject("Token usage or accounting data returned by ScrapeGraphAI.", {
  promptTokens: s.integer("The number of prompt tokens used by the request."),
  completionTokens: s.integer("The number of completion tokens used by the request."),
});
const scrapeOutputSchema = s.looseObject("The output payload for a ScrapeGraphAI scrape request.", {
  id: s.string("The ScrapeGraphAI request ID."),
  results: s.looseObject("The result object keyed by requested output format."),
  metadata: s.looseObject("Metadata returned by ScrapeGraphAI."),
});
const extractOutputSchema = s.looseObject("The output payload for a ScrapeGraphAI extract request.", {
  id: s.string("The ScrapeGraphAI request ID."),
  json: s.unknown("The structured JSON output returned by ScrapeGraphAI."),
  raw: s.unknown("The raw model output returned by ScrapeGraphAI, when available."),
  usage: usageSchema,
  metadata: s.looseObject("Metadata returned by ScrapeGraphAI."),
});
const searchResultSchema = s.looseObject("One search result returned by ScrapeGraphAI.", {
  url: s.url("The result URL."),
  title: s.string("The result title."),
  content: s.string("The inline page content in the requested format."),
});
const searchOutputSchema = s.looseObject("The output payload for a ScrapeGraphAI search request.", {
  id: s.string("The ScrapeGraphAI request ID."),
  results: s.array("The ordered fetched search results.", searchResultSchema),
  json: s.unknown("The structured JSON output when an extraction prompt was supplied."),
  raw: s.unknown("The raw model output when an extraction prompt was supplied."),
  usage: usageSchema,
  metadata: s.looseObject("Metadata returned by ScrapeGraphAI."),
});
const historyEntrySchema = s.looseObject("One ScrapeGraphAI history entry.", {
  id: s.string("The ScrapeGraphAI history entry ID."),
  userId: s.string("The ScrapeGraphAI user ID that issued the request."),
  service: s.string("The ScrapeGraphAI service that produced the entry."),
  status: s.string("The lifecycle status of the entry."),
  params: s.looseObject("The original request parameters."),
  result: s.unknown("The full result payload for the entry."),
  error: s.unknown("The error payload when the entry failed."),
  elapsedMs: s.integer("The elapsed time in milliseconds."),
  requestParentId: s.unknown("The parent request ID when this entry was created by another job."),
  createdAt: s.dateTime("The ISO 8601 creation timestamp."),
});
const creditsOutputSchema = s.looseObject("The output payload for ScrapeGraphAI account credits.", {
  remaining: s.integer("The available credits for request-based endpoints."),
  used: s.integer("The credits consumed in the current billing cycle."),
  plan: s.string("The active subscription plan name."),
  jobs: s.looseObject("Current crawl and monitor job quotas."),
});

export const scrapeGraphAiActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "scrape",
    description: "Fetch a public URL with ScrapeGraphAI and return one or more content formats.",
    inputSchema: scrapeInputSchema,
    outputSchema: scrapeOutputSchema,
  }),
  defineProviderAction(service, {
    name: "extract",
    description: "Extract structured JSON from a URL, raw HTML, or markdown with a natural-language prompt.",
    inputSchema: extractInputSchema,
    outputSchema: extractOutputSchema,
  }),
  defineProviderAction(service, {
    name: "search",
    description: "Run a web search with ScrapeGraphAI, fetch the top results, and optionally extract JSON from them.",
    inputSchema: searchInputSchema,
    outputSchema: searchOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_history",
    description: "List recent ScrapeGraphAI request history entries with optional filters.",
    inputSchema: listHistoryInputSchema,
    outputSchema: s.object("The output payload for listing ScrapeGraphAI history entries.", {
      data: s.array("The history entries returned by ScrapeGraphAI.", historyEntrySchema),
      pagination: s.looseObject("The history pagination metadata.", {
        page: s.integer("The returned page number."),
        limit: s.integer("The returned page size."),
        total: s.integer("The total number of matching entries."),
      }),
    }),
  }),
  defineProviderAction(service, {
    name: "get_history",
    description: "Retrieve one ScrapeGraphAI history entry by request ID.",
    inputSchema: s.object("The input payload for retrieving one history entry.", {
      id: s.uuid("The UUID of the ScrapeGraphAI history entry to retrieve."),
    }),
    outputSchema: historyEntrySchema,
  }),
  defineProviderAction(service, {
    name: "get_credits",
    description: "Check ScrapeGraphAI remaining credits, plan, and job quotas.",
    inputSchema: s.object("No input is required.", {}),
    outputSchema: creditsOutputSchema,
  }),
];
