import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "hyperbrowser";

const nonEmptyString = (description: string) => s.string(description, { minLength: 1, pattern: "\\S" });
const urlSchema = s.string("The URL Hyperbrowser should load.", { format: "uri", minLength: 1 });
const jobIdSchema = nonEmptyString("The Hyperbrowser crawl job ID.");
const looseDataSchema = s.looseObject("Hyperbrowser response data.");

const statusSchema = s.stringEnum("The Hyperbrowser job status.", [
  "pending",
  "running",
  "completed",
  "failed",
  "stopped",
]);
const fetchStatusSchema = s.stringEnum("The Hyperbrowser fetch status.", ["pending", "running", "completed", "failed"]);
const outputFormatSchema = s.stringEnum("The Hyperbrowser fetch output format.", [
  "markdown",
  "html",
  "links",
  "screenshot",
  "branding",
]);

const outputOptionsSchema = s.object(
  "Output options sent to Hyperbrowser.",
  {
    formats: s.array("The output formats Hyperbrowser should return.", outputFormatSchema, { minItems: 1 }),
    sanitize: s.stringEnum("The content sanitization mode.", ["none", "basic", "advanced"]),
    includeSelectors: s.array(
      "CSS selectors Hyperbrowser should include in extracted content.",
      nonEmptyString("A CSS selector to include."),
      { minItems: 1 },
    ),
    excludeSelectors: s.array(
      "CSS selectors Hyperbrowser should exclude from extracted content.",
      nonEmptyString("A CSS selector to exclude."),
      { minItems: 1 },
    ),
  },
  { optional: ["formats", "sanitize", "includeSelectors", "excludeSelectors"] },
);

const fetchInputSchema = s.object(
  "Request parameters for fetching one web page with Hyperbrowser.",
  {
    url: urlSchema,
    stealth: s.stringEnum("The stealth mode Hyperbrowser should use.", ["none", "auto", "ultra"]),
    outputs: outputOptionsSchema,
  },
  { optional: ["stealth", "outputs"] },
);

const searchFiltersSchema = s.object(
  "Search filters sent to Hyperbrowser.",
  {
    exactPhrase: s.boolean("Whether Hyperbrowser should match the exact phrase."),
    semanticPhrase: s.boolean("Whether Hyperbrowser should use semantic phrase matching."),
    excludeTerms: s.array(
      "Terms Hyperbrowser should exclude from the search.",
      nonEmptyString("A search term to exclude."),
      {
        minItems: 1,
      },
    ),
    boostTerms: s.array("Terms Hyperbrowser should boost in the search.", nonEmptyString("A search term to boost."), {
      minItems: 1,
    }),
    filetype: s.stringEnum("The file type filter for search results.", [
      "pdf",
      "doc",
      "docx",
      "xls",
      "xlsx",
      "ppt",
      "pptx",
      "html",
    ]),
    site: nonEmptyString("The site Hyperbrowser should restrict results to."),
    excludeSite: nonEmptyString("The site Hyperbrowser should exclude from results."),
    intitle: nonEmptyString("Text that must appear in result titles."),
    inurl: nonEmptyString("Text that must appear in result URLs."),
  },
  {
    optional: [
      "exactPhrase",
      "semanticPhrase",
      "excludeTerms",
      "boostTerms",
      "filetype",
      "site",
      "excludeSite",
      "intitle",
      "inurl",
    ],
  },
);

const searchLocationSchema = s.object(
  "Location bias for Hyperbrowser search.",
  {
    country: nonEmptyString("The country used for search localization."),
    state: nonEmptyString("The state or region used for search localization."),
    city: nonEmptyString("The city used for search localization."),
  },
  { optional: ["state", "city"] },
);

const searchInputSchema = s.object(
  "Request parameters for searching the web with Hyperbrowser.",
  {
    query: s.string("The search query.", { minLength: 1, maxLength: 500, pattern: "\\S" }),
    page: s.integer("The search results page number.", { minimum: 1 }),
    maxAgeSeconds: s.integer("The maximum age of cached search results in seconds.", { minimum: 0 }),
    location: searchLocationSchema,
    filters: searchFiltersSchema,
  },
  { optional: ["page", "maxAgeSeconds", "location", "filters"] },
);

const crawlOptionsSchema = s.object(
  "Crawl options sent to Hyperbrowser.",
  {
    maxPages: s.integer("The maximum number of pages Hyperbrowser should crawl.", { minimum: 1, maximum: 100 }),
    followLinks: s.boolean("Whether Hyperbrowser should follow links from crawled pages."),
    ignoreSitemap: s.boolean("Whether Hyperbrowser should ignore the site's sitemap."),
    excludePatterns: s.array(
      "URL patterns Hyperbrowser should exclude while crawling.",
      nonEmptyString("A URL pattern to exclude."),
      { minItems: 1 },
    ),
    includePatterns: s.array(
      "URL patterns Hyperbrowser should include while crawling.",
      nonEmptyString("A URL pattern to include."),
      { minItems: 1 },
    ),
  },
  { optional: ["maxPages", "followLinks", "ignoreSitemap", "excludePatterns", "includePatterns"] },
);

const startCrawlInputSchema = s.object(
  "Request parameters for starting a Hyperbrowser web crawl.",
  {
    url: urlSchema,
    stealth: s.stringEnum("The stealth mode Hyperbrowser should use.", ["none", "auto", "ultra"]),
    outputs: outputOptionsSchema,
    crawlOptions: crawlOptionsSchema,
  },
  { optional: ["stealth", "outputs", "crawlOptions"] },
);

const responseSchema = (description: string, status = statusSchema) =>
  s.object(
    description,
    {
      jobId: jobIdSchema,
      status,
      error: s.nullable(s.string("The error message returned by Hyperbrowser.")),
      data: looseDataSchema,
    },
    { optional: ["error", "data"] },
  );

export const hyperbrowserActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "fetch_page",
    description: "Fetch a web page with Hyperbrowser and return the requested data formats.",
    inputSchema: fetchInputSchema,
    outputSchema: responseSchema("The Hyperbrowser fetch response.", fetchStatusSchema),
  }),
  defineProviderAction(service, {
    name: "search_web",
    description: "Search the web with Hyperbrowser and return structured search results.",
    inputSchema: searchInputSchema,
    outputSchema: responseSchema("The Hyperbrowser search response."),
  }),
  defineProviderAction(service, {
    name: "start_web_crawl",
    description: "Start an asynchronous Hyperbrowser crawl job from a URL.",
    inputSchema: startCrawlInputSchema,
    outputSchema: s.actionOutput(
      {
        jobId: jobIdSchema,
      },
      "The response for a started Hyperbrowser crawl job.",
    ),
    asyncLifecycle: {
      startActionId: "hyperbrowser.start_web_crawl",
      statusActionId: "hyperbrowser.get_web_crawl_status",
    },
  }),
  defineProviderAction(service, {
    name: "get_web_crawl_status",
    description: "Get the current status of a Hyperbrowser crawl job.",
    inputSchema: s.actionInput(
      {
        id: jobIdSchema,
      },
      ["id"],
      "Request parameters for reading a Hyperbrowser crawl job status.",
    ),
    outputSchema: s.actionOutput(
      {
        status: statusSchema,
      },
      "The Hyperbrowser crawl job status response.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_web_crawl_results",
    description: "Get paginated results for a Hyperbrowser crawl job.",
    inputSchema: s.object(
      "Request parameters for reading Hyperbrowser crawl job results.",
      {
        id: jobIdSchema,
        page: s.integer("The zero-based result page to read.", { minimum: 0 }),
        batchSize: s.integer("The number of crawl pages to return in one batch.", { minimum: 1 }),
      },
      { optional: ["page", "batchSize"] },
    ),
    outputSchema: s.object(
      "The Hyperbrowser crawl job results response.",
      {
        jobId: jobIdSchema,
        status: statusSchema,
        error: s.nullable(s.string("The error message returned by Hyperbrowser.")),
        totalPages: s.integer("The total number of crawled pages.", { minimum: 0 }),
        totalPageBatches: s.integer("The total number of result batches.", { minimum: 0 }),
        currentPageBatch: s.integer("The current result batch number.", { minimum: 0 }),
        batchSize: s.integer("The result batch size.", { minimum: 1 }),
        data: s.array("The crawl page data returned by Hyperbrowser.", looseDataSchema),
      },
      { optional: ["error", "totalPages", "totalPageBatches", "currentPageBatch", "batchSize", "data"] },
    ),
  }),
];
