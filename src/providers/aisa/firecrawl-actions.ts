import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { aisaJobOutput, aisaJobSubmissionProperties, aisaJobTaskId } from "./async-job-schema.ts";

const url = s.string("HTTPS URL without credentials, fragment or PDF suffix.", {
  format: "uri",
});
const tags = (description: string) =>
  s.nullable(
    s.array(description, s.nonEmptyString("An HTML tag selector, up to 128 UTF-8 bytes."), {
      maxItems: 50,
    }),
  );
const scrapeProperties = {
  includeTags: tags("Only include matching HTML tags."),
  excludeTags: tags("Exclude matching HTML tags."),
  onlyMainContent: s.nullable(s.boolean("Extract only the main page content.")),
  maxAge: s.nullable(s.integer("Maximum cached content age in milliseconds.", { minimum: 0, maximum: 31536000000 })),
  minAge: s.nullable(s.integer("Minimum cached content age in milliseconds.", { minimum: 0, maximum: 31536000000 })),
  timeout: s.nullable(s.integer("Per-page scrape timeout in milliseconds.", { minimum: 1000, maximum: 300000 })),
};

const paths = (description: string) =>
  s.nullable(
    s.array(description, s.nonEmptyString("A path pattern, up to 256 UTF-8 bytes."), {
      maxItems: 20,
    }),
  );
const concurrency = s.nullable(s.integer("Maximum concurrent page requests.", { minimum: 1, maximum: 20 }));
const crawlInput = s.object(
  "Submit an asynchronous website crawl through AIsa.",
  {
    ...aisaJobSubmissionProperties,
    url,
    limit: s.integer("Maximum pages to crawl.", { minimum: 1, maximum: 1000 }),
    allowExternalLinks: s.nullable(s.boolean("Allow links to external websites.")),
    allowSubdomains: s.nullable(s.boolean("Allow crawling subdomains.")),
    crawlEntireDomain: s.nullable(s.boolean("Crawl across the entire domain.")),
    delay: s.nullable(s.number("Delay between requests in seconds.", { minimum: 0, maximum: 30 })),
    excludePaths: paths("Path patterns to exclude from crawling."),
    includePaths: paths("Path patterns to include in crawling."),
    ignoreQueryParameters: s.nullable(s.boolean("Ignore query parameters when identifying pages.")),
    maxConcurrency: concurrency,
    maxDiscoveryDepth: s.nullable(s.integer("Maximum link discovery depth.", { minimum: 0, maximum: 10 })),
    scrapeOptions: s.nullable(s.object("Options applied to each crawled page.", scrapeProperties, { required: [] })),
    sitemap: s.nullable(s.stringEnum("How to use the website sitemap.", ["skip", "include", "only"])),
  },
  { required: ["url", "limit"] },
);
const batchInput = s.object(
  "Submit an asynchronous batch of known page URLs through AIsa.",
  {
    ...aisaJobSubmissionProperties,
    ...scrapeProperties,
    maxConcurrency: concurrency,
    urls: s.array("Distinct page URLs; duplicates after trimming trailing slashes are not allowed.", url, {
      minItems: 1,
      maxItems: 1000,
      uniqueItems: true,
    }),
  },
  { required: ["urls"] },
);
interface FirecrawlFamily {
  name: string;
  path: string;
  inputSchema: JsonSchema;
}

export const aisaFirecrawlFamilies: readonly FirecrawlFamily[] = [
  { name: "crawl", path: "crawl", inputSchema: crawlInput },
  { name: "batch_scrape", path: "batch-scrape", inputSchema: batchInput },
];

export const aisaFirecrawlActions: readonly ActionDefinition[] = aisaFirecrawlFamilies.flatMap((family) => [
  defineProviderAction("aisa", {
    name: `submit_firecrawl_${family.name}`,
    operationType: "write",
    requiredScopes: [],
    description:
      family.name === "crawl"
        ? "Start a background website crawl through AIsa Firecrawl. Poll the returned task ID for results."
        : "Start a background batch scrape of known URLs through AIsa Firecrawl. Poll the returned task ID for results.",
    inputSchema: family.inputSchema,
    outputSchema: s.object("The submitted task handle.", { taskId: aisaJobTaskId }, { optional: [] }),
    asyncLifecycle: {
      startActionId: "aisa." + `submit_firecrawl_${family.name}`,
      statusActionId: `aisa.get_firecrawl_${family.name}`,
    },
  }),
  defineProviderAction("aisa", {
    name: `get_firecrawl_${family.name}`,
    operationType: "read",
    requiredScopes: [],
    description:
      "Get a Firecrawl task state and results. Check outputExpired and job errors even when the task has finished.",
    inputSchema: s.object("Identify the task to query.", { taskId: aisaJobTaskId }, { optional: [] }),
    outputSchema: aisaJobOutput,
  }),
  defineProviderAction("aisa", {
    name: `cancel_firecrawl_${family.name}`,
    operationType: "destructive",
    requiredScopes: [],
    description:
      "Request cancellation of a Firecrawl task. Work already performed may still be charged; poll the task for final state and pricing.",
    inputSchema: s.object("Identify the task to cancel.", { taskId: aisaJobTaskId }, { optional: [] }),
    outputSchema: aisaJobOutput,
  }),
]);
