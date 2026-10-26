import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { jsonSchema as s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const common = {
  url: s.string("The full URL to scrape, including the protocol.", { format: "uri" }),
  super: s.boolean("Use additional resources to bypass anti-bot protection."),
  browserRendering: s.boolean("Render the page using Chromium."),
  waitUntil: s.stringEnum("When browser navigation is considered complete.", [
    "domcontentloaded",
    "load",
    "networkidle0",
    "networkidle2",
  ]),
  timeout: s.integer("Maximum page loading time in seconds; the upstream default is 300.", {
    minimum: 1,
  }),
  geoCode: s.string("Geographic code for the proxy location."),
  proxyCountry: s.string("Country code of the proxy server."),
};

const fetching = {
  blockResources: s.boolean("Block images, fonts, and stylesheets."),
  waitForSelector: s.string("Wait for this CSS selector before extracting content."),
  returnCookie: s.boolean("Include browser session cookies in the response."),
};

const budget = {
  tokenCap: s.integer(
    "Token budget for the scrape and retries; omit for no limit. An individual attempt may exceed the cap.",
    { minimum: 1 },
  ),
  maxRetries: s.integer("Maximum number of retries for the request.", { minimum: 0 }),
};

const saved = {
  saveResult: s.boolean("Save the result to the Result tab; the upstream default is true."),
};

const prompt = s.string(
  "Describe the data to extract. This only parses content; it cannot instruct browser navigation. Append a Json Schema: section to specify a JSON schema.",
);

const maxPages = s.integer(
  "Maximum pages to process; a batch from infinite scroll or Load More counts as one page. The upstream default is 3.",
  { minimum: 1 },
);

const outputProperties = {
  data: s.unknown("Extracted data in the upstream-defined shape."),
  html: s.string("Scraped HTML when included by the upstream API."),
  markdown: s.string("Converted Markdown when included by the upstream API."),
  runtime: s.number("Execution runtime in seconds."),
  token_usage: s.number("Tokens consumed by the request."),
  data_path: s.nullable(s.string("Upstream result storage path; not necessarily a public URL.")),
  html_path: s.nullable(s.string("Upstream HTML storage path; not necessarily a public URL.")),
};

function action(
  name: string,
  description: string,
  properties: Record<string, JsonSchema>,
  html = false,
): ActionDefinition {
  return defineProviderAction("mrscraper", {
    name,
    description,
    operationType: html ? "read" : "write",
    requiredScopes: [],
    inputSchema: s.object("Web scraping request settings.", properties, {
      optional: [],
      required: ["url"],
    }),
    outputSchema: html
      ? s.requiredObject("Fetched page content.", { html: s.string("The raw HTML returned by MrScraper.") })
      : s.object(
          "MrScraper result with extraction data and usage metadata; additional upstream fields are preserved.",
          outputProperties,
          {
            additionalProperties: true,
            required: [],
          },
        ),
  });
}

export const mrscraperActions: ActionDefinition[] = [
  action(
    "fetch_html",
    "Fetch raw webpage HTML with optional browser rendering and geo-targeting.",
    { ...common, ...fetching },
    true,
  ),
  action("scrape_markdown", "Convert a webpage to Markdown and optionally save the result in MrScraper.", {
    ...common,
    ...fetching,
    ...budget,
    ...saved,
    action: s.string("Scraper action flag used to separate analytics per domain."),
    proxy: s.string("Custom proxy URL, optionally including username and password."),
  }),
  action("scrape_json", "Extract structured data from a single page using a natural language prompt.", {
    ...common,
    ...budget,
    ...saved,
    prompt,
    html: s.boolean("Include the raw HTML in the response."),
  }),
  action("scrape_listing", "Extract items across paginated listings, infinite scroll, or Load More batches.", {
    ...common,
    ...budget,
    ...saved,
    super: s.literal(true, {
      description: "Additional resources are required for listing extraction.",
    }),
    prompt,
    maxPages,
  }),
  action("scrape_sitemap", "Discover website URLs with crawl depth, page limits, and URL pattern filters.", {
    ...common,
    ...budget,
    ...saved,
    maxPages,
    maxDepth: s.integer("Maximum crawl depth; the upstream default is 2.", { minimum: 1 }),
    limit: s.integer("Maximum URLs to collect; the upstream default is 1000.", { minimum: 1 }),
    includePatterns: s.array("Only crawl URLs matching these patterns.", s.string("One URL inclusion pattern.")),
    excludePatterns: s.array("Skip URLs matching these patterns.", s.string("One URL exclusion pattern.")),
  }),
];
