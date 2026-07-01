import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "firecrawl";

const looseObject = s.looseObject({}, { description: "A loose JSON object." });
const headersSchema = s.record(s.string("A custom HTTP header value."), {
  description: "Custom HTTP headers to send with the request.",
});
const stringArrayItem = s.string("A string value.", { minLength: 1 });
const formatObjectSchema = s.looseRequiredObject(
  "A structured Firecrawl format descriptor.",
  {
    type: s.nonEmptyString("The structured format type, such as json or screenshot."),
  },
  { optional: [] },
);
const formatSchema = s.oneOf(
  [
    s.stringEnum("A built-in Firecrawl output format.", [
      "markdown",
      "html",
      "rawHtml",
      "links",
      "screenshot",
      "screenshot@fullPage",
      "json",
      "changeTracking",
      "summary",
    ]),
    formatObjectSchema,
  ],
  { description: "A requested Firecrawl output format." },
);
const jsonOptionsSchema = s.looseRequiredObject(
  "Options for structured JSON output.",
  {
    prompt: s.string("An extraction prompt that explains the desired JSON structure."),
    schema: looseObject,
  },
  { optional: ["prompt", "schema"] },
);
const locationSchema = s.looseRequiredObject(
  "Location settings for the request.",
  {
    country: s.string("The ISO 3166-1 alpha-2 country code to request from."),
    languages: s.array("The preferred locales for the request.", stringArrayItem),
  },
  { optional: ["country", "languages"] },
);
const browserActionSchema = s.looseRequiredObject(
  "A browser action to perform before scraping.",
  {
    type: s.nonEmptyString("The browser action type, such as click, write, wait, or press."),
    selector: s.string("The CSS selector targeted by the action."),
    text: s.string("The text to type for write actions."),
    key: s.string("The key to press for press actions."),
    milliseconds: s.integer("The duration in milliseconds used by wait-style actions."),
  },
  { optional: ["selector", "text", "key", "milliseconds"] },
);
const webhookSchema = s.looseRequiredObject(
  "Webhook callback settings for async jobs.",
  {
    url: s.nonEmptyString("The webhook destination URL."),
    events: s.stringArray("The webhook events that should trigger notifications."),
    headers: headersSchema,
    metadata: looseObject,
  },
  { optional: ["events", "headers", "metadata"] },
);
const scrapeOptionsSchema = s.looseRequiredObject(
  "Shared Firecrawl scrape options.",
  {
    actions: s.array("The browser actions to perform before extraction.", browserActionSchema),
    formats: s.array("The formats to return from Firecrawl.", formatSchema),
    headers: headersSchema,
    location: locationSchema,
    jsonOptions: jsonOptionsSchema,
    timeout: s.integer("The request timeout in milliseconds."),
    waitFor: s.integer("The delay in milliseconds before extraction starts."),
    maxAge: s.integer("The cache max age in milliseconds."),
    onlyMainContent: s.boolean("Whether to keep only the main content of the page."),
    mobile: s.boolean("Whether to emulate a mobile device."),
    includeTags: s.stringArray("The HTML tags that should be prioritized in the extracted content."),
    excludeTags: s.stringArray("The HTML tags that should be removed from the extracted content."),
    parsers: s.stringArray("The parser plugins to enable for the request."),
    parsePDF: s.boolean("Whether PDF parsing should be enabled."),
    proxy: s.stringEnum("The proxy mode to use for the request.", ["basic", "stealth", "auto"]),
    storeInCache: s.boolean("Whether Firecrawl should store the result in cache."),
    removeBase64Images: s.boolean("Whether base64-encoded images should be removed from the output."),
    blockAds: s.boolean("Whether ad resources should be blocked."),
    skipTlsVerification: s.boolean("Whether TLS certificate verification should be skipped."),
    zeroDataRetention: s.boolean("Whether the request should opt into zero data retention."),
    changeTrackingOptions: looseObject,
  },
  {
    optional: [
      "actions",
      "formats",
      "headers",
      "location",
      "jsonOptions",
      "timeout",
      "waitFor",
      "maxAge",
      "onlyMainContent",
      "mobile",
      "includeTags",
      "excludeTags",
      "parsers",
      "parsePDF",
      "proxy",
      "storeInCache",
      "removeBase64Images",
      "blockAds",
      "skipTlsVerification",
      "zeroDataRetention",
      "changeTrackingOptions",
    ],
  },
);
const sourceSchema = s.looseRequiredObject(
  "A source object returned by Firecrawl.",
  {
    url: s.nonEmptyString("The source URL."),
    title: s.string("The source title."),
    description: s.string("The source description."),
    icon: s.string("The source icon URL."),
  },
  { optional: ["title", "description", "icon"] },
);
const activitySchema = s.looseRequiredObject(
  "A deep research activity item.",
  {
    type: s.string("The activity type."),
    depth: s.integer("The research depth for the activity."),
    status: s.string("The activity status."),
    message: s.string("The activity summary message."),
    timestamp: s.string("The ISO 8601 timestamp of the activity."),
  },
  { optional: ["type", "depth", "status", "message", "timestamp"] },
);
const jobStartSchema = s.looseRequiredObject(
  "A Firecrawl async job start response.",
  {
    success: s.boolean("Whether the job was accepted successfully."),
    id: s.string("The Firecrawl job ID."),
    url: s.string("The status URL returned by Firecrawl."),
    invalidURLs: s.stringArray("The invalid URLs rejected before the job started."),
    warning: s.string("A warning returned by Firecrawl."),
  },
  { optional: ["url", "invalidURLs", "warning"] },
);
const scrapeResultSchema = s.looseRequiredObject(
  "A Firecrawl scrape response.",
  {
    success: s.boolean("Whether the scrape request succeeded."),
    data: looseObject,
    warning: s.string("A warning returned by Firecrawl."),
    error: s.string("An error message returned by Firecrawl."),
    code: s.oneOf([s.string("A string response code."), s.number("A numeric response code.")], {
      description: "The Firecrawl response code.",
    }),
  },
  { optional: ["data", "warning", "error", "code"] },
);
const pagedJobStatusSchema = s.looseRequiredObject(
  "A Firecrawl paged async job status response.",
  {
    success: s.boolean("Whether the request succeeded."),
    status: s.string("The current job status."),
    total: s.integer("The total number of queued or discovered items."),
    completed: s.integer("The number of completed items in the job."),
    creditsUsed: s.integer("The credits used by the job."),
    expiresAt: s.string("The ISO 8601 expiry timestamp for the job data."),
    next: s.nullableString("The pagination URL for the next segment of data."),
    data: s.array("The result items returned by Firecrawl.", looseObject),
    warning: s.string("A warning returned by Firecrawl."),
    error: s.string("An error message returned by Firecrawl."),
  },
  { optional: ["success", "total", "completed", "creditsUsed", "expiresAt", "next", "data", "warning", "error"] },
);
const errorsSchema = s.looseRequiredObject(
  "The failed Firecrawl job items.",
  {
    errors: s.array(
      "The failed items for the job.",
      s.looseRequiredObject(
        "An error item returned by Firecrawl.",
        {
          id: s.string("The job item ID."),
          url: s.string("The URL that failed."),
          code: s.string("The Firecrawl error code."),
          error: s.string("The error message."),
          timestamp: s.string("The ISO 8601 failure timestamp."),
        },
        { optional: ["id", "code", "timestamp"] },
      ),
    ),
    robotsBlocked: s.stringArray("The URLs blocked by robots.txt."),
  },
  { optional: ["robotsBlocked"] },
);
const cancelResultSchema = s.looseRequiredObject(
  "A Firecrawl cancel response.",
  {
    success: s.boolean("Whether the cancellation request succeeded."),
    status: s.string("The final status returned by Firecrawl."),
    message: s.string("The cancellation message returned by Firecrawl."),
  },
  { optional: ["success", "status", "message"] },
);
const previewSchema = s.requiredObject("A Firecrawl preview response.", {
  success: s.boolean("Whether the preview request succeeded."),
  data: looseObject,
});
const extractStatusSchema = s.looseRequiredObject(
  "A Firecrawl extract job status response.",
  {
    success: s.boolean("Whether the request succeeded."),
    id: s.string("The Firecrawl job ID."),
    status: s.string("The current extract job status."),
    data: looseObject,
    sources: s.array("The sources used by the extraction request.", sourceSchema),
    urlTrace: s.array("The trace of URLs visited by the extraction request.", looseObject),
    invalidURLs: s.stringArray("The invalid URLs rejected before extraction started."),
    creditsUsed: s.integer("The credits used by the extract job."),
    tokensUsed: s.integer("The LLM tokens used by the extract job."),
    expiresAt: s.string("The ISO 8601 expiry timestamp for the job data."),
    warning: s.string("A warning returned by Firecrawl."),
    error: s.string("An error returned by Firecrawl."),
  },
  {
    optional: [
      "id",
      "status",
      "data",
      "sources",
      "urlTrace",
      "invalidURLs",
      "creditsUsed",
      "tokensUsed",
      "expiresAt",
      "warning",
      "error",
    ],
  },
);
const searchSchema = s.looseRequiredObject(
  "A Firecrawl search response.",
  {
    success: s.boolean("Whether the search request succeeded."),
    id: s.string("The Firecrawl search job ID."),
    data: looseObject,
    creditsUsed: s.integer("The credits used by the search request."),
    warning: s.string("A warning returned by Firecrawl."),
  },
  { optional: ["id", "creditsUsed", "warning"] },
);
const mapSchema = s.looseRequiredObject(
  "A Firecrawl map response.",
  {
    success: s.boolean("Whether the map request succeeded."),
    links: s.stringArray("The URLs discovered by the map request."),
    warning: s.string("A warning returned by Firecrawl."),
  },
  { optional: ["warning"] },
);
const agentStatusSchema = s.looseRequiredObject(
  "A Firecrawl agent status response.",
  {
    success: s.boolean("Whether the request succeeded."),
    status: s.string("The current agent job status."),
    data: looseObject,
    creditsUsed: s.integer("The credits used by the agent job."),
    expiresAt: s.string("The ISO 8601 expiry timestamp for the job data."),
    model: s.string("The model used by the agent job."),
    error: s.string("An error returned by Firecrawl."),
  },
  { optional: ["data", "creditsUsed", "expiresAt", "model", "error"] },
);
const deepResearchStatusSchema = s.looseRequiredObject(
  "A Firecrawl deep research status response.",
  {
    success: s.boolean("Whether the request succeeded."),
    id: s.string("The Firecrawl job ID."),
    status: s.string("The current deep research status."),
    currentDepth: s.integer("The current research depth."),
    maxDepth: s.integer("The configured maximum research depth."),
    totalUrls: s.integer("The total URLs processed by the job."),
    expiresAt: s.string("The ISO 8601 expiry timestamp for the job data."),
    data: looseObject,
    sources: s.array("The sources gathered during deep research.", sourceSchema),
    activities: s.array("The deep research activity timeline.", activitySchema),
  },
  { optional: ["id", "status", "currentDepth", "maxDepth", "totalUrls", "expiresAt", "data", "sources", "activities"] },
);
const llmsTxtStatusSchema = s.looseRequiredObject(
  "A Firecrawl LLMs.txt status response.",
  {
    success: s.boolean("Whether the request succeeded."),
    status: s.string("The current LLMs.txt generation status."),
    expiresAt: s.string("The ISO 8601 expiry timestamp for the job data."),
    data: s.looseRequiredObject(
      "The generated LLMs.txt payload.",
      {
        llmstxt: s.string("The generated llms.txt content."),
        llmsfulltxt: s.string("The generated llms-full.txt content."),
      },
      { optional: ["llmstxt", "llmsfulltxt"] },
    ),
    error: s.string("An error returned by Firecrawl."),
  },
  { optional: ["status", "expiresAt", "data", "error"] },
);
const queueStatusSchema = s.looseRequiredObject(
  "A Firecrawl team queue status response.",
  {
    success: s.boolean("Whether the request succeeded."),
    activeJobsInQueue: s.integer("The number of active jobs in the queue."),
    waitingJobsInQueue: s.integer("The number of waiting jobs in the queue."),
    jobsInQueue: s.integer("The total jobs in the queue."),
    maxConcurrency: s.integer("The queue concurrency limit."),
    mostRecentSuccess: s.unknown("The most recent successful queue record."),
  },
  { optional: ["activeJobsInQueue", "waitingJobsInQueue", "jobsInQueue", "maxConcurrency", "mostRecentSuccess"] },
);
const usageSchema = s.requiredObject("A Firecrawl usage response.", {
  success: s.boolean("Whether the request succeeded."),
  data: looseObject,
});
const historicalUsageSchema = s.requiredObject("A Firecrawl historical usage response.", {
  success: s.boolean("Whether the request succeeded."),
  periods: s.array(
    "The historical usage periods returned by Firecrawl.",
    s.looseRequiredObject(
      "A historical usage period returned by Firecrawl.",
      {
        startDate: s.string("The billing period start timestamp."),
        endDate: s.string("The billing period end timestamp."),
        creditsUsed: s.integer("The credits used in the period."),
        tokensUsed: s.integer("The tokens used in the period."),
        apiKey: s.string("The API key identifier for the period."),
      },
      { optional: ["creditsUsed", "tokensUsed", "apiKey"] },
    ),
  ),
});

const idInput = s.requiredObject("The input payload for this action.", {
  id: s.nonEmptyString("The Firecrawl job ID."),
});
const scrapeInput = s.looseRequiredObject(
  "The input payload for this action.",
  {
    url: s.nonEmptyString("The URL to scrape."),
    actions: s.array("The browser actions to run before scraping.", browserActionSchema),
    formats: s.array("The output formats to return.", formatSchema),
    headers: headersSchema,
    location: locationSchema,
    jsonOptions: jsonOptionsSchema,
    timeout: s.integer("The request timeout in milliseconds."),
    waitFor: s.integer("The delay before scraping starts."),
    maxAge: s.integer("The cache max age in milliseconds."),
    onlyMainContent: s.boolean("Whether to keep only the main content of the page."),
    includeTags: s.stringArray("The HTML tags that should be prioritized in the extracted content."),
    excludeTags: s.stringArray("The HTML tags that should be removed from the output."),
    mobile: s.boolean("Whether to emulate a mobile device."),
    proxy: s.stringEnum("The proxy mode to use for the request.", ["basic", "stealth", "auto"]),
    parsers: s.stringArray("The parser plugins to enable for the request."),
    blockAds: s.boolean("Whether ad resources should be blocked."),
    storeInCache: s.boolean("Whether Firecrawl should store the result in cache."),
    removeBase64Images: s.boolean("Whether base64-encoded images should be removed from the output."),
    skipTlsVerification: s.boolean("Whether TLS verification should be skipped."),
    zeroDataRetention: s.boolean("Whether the request should opt into zero data retention."),
  },
  {
    optional: [
      "actions",
      "formats",
      "headers",
      "location",
      "jsonOptions",
      "timeout",
      "waitFor",
      "maxAge",
      "onlyMainContent",
      "includeTags",
      "excludeTags",
      "mobile",
      "proxy",
      "parsers",
      "blockAds",
      "storeInCache",
      "removeBase64Images",
      "skipTlsVerification",
      "zeroDataRetention",
    ],
  },
);
const crawlInput = s.looseRequiredObject(
  "The input payload for this action.",
  {
    url: s.nonEmptyString("The seed URL for the crawl."),
    prompt: s.string("A natural-language prompt that guides crawl option generation."),
    includePaths: s.stringArray("The path patterns that the crawl should include."),
    excludePaths: s.stringArray("The path patterns that the crawl should exclude."),
    maxDepth: s.integer("The maximum traversal depth."),
    maxDiscoveryDepth: s.integer("The maximum depth for link discovery."),
    limit: s.integer("The maximum number of pages to crawl."),
    delay: s.integer("The delay between crawl requests in milliseconds."),
    maxConcurrency: s.integer("The maximum concurrency for the crawl job."),
    allowBackwardLinks: s.boolean("Whether backward links should be followed for compatibility."),
    allowExternalLinks: s.boolean("Whether external links should be followed."),
    allowSubdomains: s.boolean("Whether subdomains should be followed."),
    crawlEntireDomain: s.boolean("Whether the entire domain should be crawled."),
    ignoreSitemap: s.boolean("Whether the sitemap should be ignored."),
    ignoreQueryParameters: s.boolean("Whether query parameters should be ignored when deduplicating pages."),
    sitemap: s.boolean("Whether sitemap discovery should be enabled."),
    webhook: webhookSchema,
    scrapeOptions: scrapeOptionsSchema,
    scrapeOptions_actions: s.array("Compatibility browser actions for nested scrape options.", browserActionSchema),
    scrapeOptions_formats: s.array("Compatibility formats for nested scrape options.", formatSchema),
    scrapeOptions_headers: headersSchema,
    scrapeOptions_location: locationSchema,
    scrapeOptions_jsonOptions: jsonOptionsSchema,
    scrapeOptions_timeout: s.integer("Compatibility timeout for nested scrape options."),
    scrapeOptions_waitFor: s.integer("Compatibility delay for nested scrape options."),
    scrapeOptions_maxAge: s.integer("Compatibility cache max age for nested scrape options."),
    scrapeOptions_onlyMainContent: s.boolean("Compatibility main-content flag for nested scrape options."),
    scrapeOptions_mobile: s.boolean("Compatibility mobile emulation flag for nested scrape options."),
    scrapeOptions_includeTags: s.stringArray("Compatibility includeTags for nested scrape options."),
    scrapeOptions_excludeTags: s.stringArray("Compatibility excludeTags for nested scrape options."),
    scrapeOptions_proxy: s.stringEnum("Compatibility proxy mode for nested scrape options.", [
      "basic",
      "stealth",
      "auto",
    ]),
    scrapeOptions_parsers: s.stringArray("Compatibility parser plugins for nested scrape options."),
    scrapeOptions_parsePDF: s.boolean("Compatibility PDF parsing flag for nested scrape options."),
    scrapeOptions_blockAds: s.boolean("Compatibility ad-blocking flag for nested scrape options."),
    scrapeOptions_storeInCache: s.boolean("Compatibility cache storage flag for nested scrape options."),
    scrapeOptions_removeBase64Images: s.boolean("Compatibility base64 image removal flag for nested scrape options."),
    scrapeOptions_skipTlsVerification: s.boolean("Compatibility TLS verification flag for nested scrape options."),
    scrapeOptions_changeTrackingOptions: looseObject,
    zeroDataRetention: s.boolean("Whether the request should opt into zero data retention."),
  },
  {
    optional: [
      "prompt",
      "includePaths",
      "excludePaths",
      "maxDepth",
      "maxDiscoveryDepth",
      "limit",
      "delay",
      "maxConcurrency",
      "allowBackwardLinks",
      "allowExternalLinks",
      "allowSubdomains",
      "crawlEntireDomain",
      "ignoreSitemap",
      "ignoreQueryParameters",
      "sitemap",
      "webhook",
      "scrapeOptions",
      "scrapeOptions_actions",
      "scrapeOptions_formats",
      "scrapeOptions_headers",
      "scrapeOptions_location",
      "scrapeOptions_jsonOptions",
      "scrapeOptions_timeout",
      "scrapeOptions_waitFor",
      "scrapeOptions_maxAge",
      "scrapeOptions_onlyMainContent",
      "scrapeOptions_mobile",
      "scrapeOptions_includeTags",
      "scrapeOptions_excludeTags",
      "scrapeOptions_proxy",
      "scrapeOptions_parsers",
      "scrapeOptions_parsePDF",
      "scrapeOptions_blockAds",
      "scrapeOptions_storeInCache",
      "scrapeOptions_removeBase64Images",
      "scrapeOptions_skipTlsVerification",
      "scrapeOptions_changeTrackingOptions",
      "zeroDataRetention",
    ],
  },
);

export const firecrawlActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "scrape",
    description: "Scrape a single URL with Firecrawl and return the extracted page content in the requested formats.",
    inputSchema: scrapeInput,
    outputSchema: scrapeResultSchema,
  }),
  defineProviderAction(service, {
    name: "batch_scrape",
    description: "Start a Firecrawl batch scrape job for multiple URLs and return the async job ID.",
    inputSchema: s.looseRequiredObject(
      "The input payload for this action.",
      {
        urls: s.stringArray("The URLs to scrape in batch."),
        actions: s.array("The browser actions to run before each scrape.", browserActionSchema),
        formats: s.array("The output formats to return.", formatSchema),
        headers: headersSchema,
        location: locationSchema,
        webhook: webhookSchema,
        timeout: s.integer("The request timeout in milliseconds."),
        waitFor: s.integer("The delay before scraping starts."),
        maxAge: s.integer("The cache max age in milliseconds."),
        maxConcurrency: s.integer("The maximum concurrency for the batch job."),
        onlyMainContent: s.boolean("Whether to keep only the main content of each page."),
        includeTags: s.stringArray("The HTML tags that should be prioritized in the extracted content."),
        excludeTags: s.stringArray("The HTML tags that should be removed from the output."),
        mobile: s.boolean("Whether to emulate a mobile device."),
        proxy: s.stringEnum("The proxy mode to use for the request.", ["basic", "stealth", "auto"]),
        ignoreInvalidURLs: s.boolean("Whether invalid URLs should be ignored instead of failing the job."),
        blockAds: s.boolean("Whether ad resources should be blocked."),
        storeInCache: s.boolean("Whether Firecrawl should store the result in cache."),
        removeBase64Images: s.boolean("Whether base64-encoded images should be removed from the output."),
        skipTlsVerification: s.boolean("Whether TLS verification should be skipped."),
        zeroDataRetention: s.boolean("Whether the request should opt into zero data retention."),
      },
      {
        optional: [
          "actions",
          "formats",
          "headers",
          "location",
          "webhook",
          "timeout",
          "waitFor",
          "maxAge",
          "maxConcurrency",
          "onlyMainContent",
          "includeTags",
          "excludeTags",
          "mobile",
          "proxy",
          "ignoreInvalidURLs",
          "blockAds",
          "storeInCache",
          "removeBase64Images",
          "skipTlsVerification",
          "zeroDataRetention",
        ],
      },
    ),
    outputSchema: jobStartSchema,
  }),
  defineProviderAction(service, {
    name: "batch_scrape_get",
    description: "Get the current status and paged results of a Firecrawl batch scrape job by job ID.",
    inputSchema: idInput,
    outputSchema: pagedJobStatusSchema,
  }),
  defineProviderAction(service, {
    name: "batch_scrape_get_errors",
    description: "Get the failed URLs and robots.txt blocks from a Firecrawl batch scrape job.",
    inputSchema: idInput,
    outputSchema: errorsSchema,
  }),
  defineProviderAction(service, {
    name: "batch_scrape_cancel",
    description: "Cancel a running Firecrawl batch scrape job by job ID.",
    inputSchema: idInput,
    outputSchema: cancelResultSchema,
  }),
  defineProviderAction(service, {
    name: "crawl",
    description: "Start a Firecrawl crawl job with compatibility fields accepted from the Composio crawl action.",
    inputSchema: crawlInput,
    outputSchema: jobStartSchema,
  }),
  defineProviderAction(service, {
    name: "crawl_v2",
    description: "Start a Firecrawl crawl job with the official v2 crawl fields.",
    inputSchema: crawlInput,
    outputSchema: jobStartSchema,
  }),
  defineProviderAction(service, {
    name: "crawl_get",
    description: "Get the current status and paged results of a Firecrawl crawl job by job ID.",
    inputSchema: idInput,
    outputSchema: pagedJobStatusSchema,
  }),
  defineProviderAction(service, {
    name: "get_the_status_of_a_crawl_job",
    description: "Compatibility alias of crawl_get for the Composio crawl status action.",
    inputSchema: idInput,
    outputSchema: pagedJobStatusSchema,
  }),
  defineProviderAction(service, {
    name: "crawl_get_errors",
    description: "Get the failed URLs and robots.txt blocks from a Firecrawl crawl job.",
    inputSchema: idInput,
    outputSchema: errorsSchema,
  }),
  defineProviderAction(service, {
    name: "crawl_cancel",
    description: "Cancel a running Firecrawl crawl job by job ID.",
    inputSchema: idInput,
    outputSchema: cancelResultSchema,
  }),
  defineProviderAction(service, {
    name: "crawl_delete",
    description: "Compatibility alias of crawl_cancel for the Composio crawl delete action.",
    inputSchema: idInput,
    outputSchema: cancelResultSchema,
  }),
  defineProviderAction(service, {
    name: "crawl_list_active",
    description: "List the currently active Firecrawl crawl jobs for the authenticated team.",
    inputSchema: s.looseObject({}, { description: "The input payload for this action." }),
    outputSchema: s.requiredObject("The output payload for this action.", {
      success: s.boolean("Whether the request succeeded."),
      crawls: s.array("The active crawl jobs returned by Firecrawl.", looseObject),
    }),
  }),
  defineProviderAction(service, {
    name: "crawl_params_preview",
    description: "Preview the crawl parameters that Firecrawl would infer from a URL and prompt.",
    inputSchema: s.requiredObject("The input payload for this action.", {
      url: s.nonEmptyString("The seed URL for the crawl preview."),
      prompt: s.nonEmptyString("The natural-language prompt used for preview generation."),
    }),
    outputSchema: previewSchema,
  }),
  defineProviderAction(service, {
    name: "extract",
    description: "Start a Firecrawl extract job that returns structured data for one or more URLs.",
    inputSchema: s.looseRequiredObject(
      "The input payload for this action.",
      {
        urls: s.stringArray("The URLs to extract structured data from."),
        prompt: s.string("The extraction prompt."),
        schema: looseObject,
        scrapeOptions: scrapeOptionsSchema,
        enableWebSearch: s.boolean("Whether web search should be enabled for the extraction."),
        ignoreSitemap: s.boolean("Whether sitemap discovery should be ignored."),
        includeSubdomains: s.boolean("Whether subdomains should be considered for the extraction."),
        ignoreInvalidURLs: s.boolean("Whether invalid URLs should be ignored instead of failing the request."),
        showSources: s.boolean("Whether cited sources should be returned."),
      },
      {
        optional: [
          "prompt",
          "schema",
          "scrapeOptions",
          "enableWebSearch",
          "ignoreSitemap",
          "includeSubdomains",
          "ignoreInvalidURLs",
          "showSources",
        ],
      },
    ),
    outputSchema: extractStatusSchema,
  }),
  defineProviderAction(service, {
    name: "extract_get",
    description: "Get the current status and output of a Firecrawl extract job by job ID.",
    inputSchema: idInput,
    outputSchema: extractStatusSchema,
  }),
  defineProviderAction(service, {
    name: "search",
    description: "Search the web with Firecrawl and optionally scrape the top results in the requested formats.",
    inputSchema: s.looseRequiredObject(
      "The input payload for this action.",
      {
        query: s.nonEmptyString("The search query text."),
        limit: s.integer("The maximum number of search results to return."),
        country: s.string("The country code used to localize search results."),
        lang: s.string("The language code used to localize search results."),
        timeout: s.integer("The request timeout in milliseconds."),
        formats: s.array("The scrape formats to apply to each search result.", formatSchema),
        scrapeOptions: scrapeOptionsSchema,
      },
      { optional: ["limit", "country", "lang", "timeout", "formats", "scrapeOptions"] },
    ),
    outputSchema: searchSchema,
  }),
  defineProviderAction(service, {
    name: "map_multiple_urls_based_on_options",
    description:
      "Discover URLs from a website with Firecrawl's map endpoint using the Composio-compatible action name.",
    inputSchema: s.looseRequiredObject(
      "The input payload for this action.",
      {
        url: s.nonEmptyString("The root URL to map."),
        limit: s.integer("The maximum number of links to return."),
        search: s.string("A search term used to filter discovered links."),
        timeout: s.integer("The request timeout in milliseconds."),
        ignoreCache: s.boolean("Whether Firecrawl cache should be bypassed."),
        ignoreQueryParameters: s.boolean("Whether query parameters should be ignored when deduplicating links."),
        includeSubdomains: s.boolean("Whether subdomains should be included."),
        sitemap: s.boolean("Whether sitemap discovery should be enabled."),
        location: locationSchema,
      },
      {
        optional: [
          "limit",
          "search",
          "timeout",
          "ignoreCache",
          "ignoreQueryParameters",
          "includeSubdomains",
          "sitemap",
          "location",
        ],
      },
    ),
    outputSchema: mapSchema,
  }),
  defineProviderAction(service, {
    name: "start_agent",
    description: "Start a Firecrawl agent job for multi-page autonomous browsing and extraction.",
    inputSchema: s.looseRequiredObject(
      "The input payload for this action.",
      {
        prompt: s.nonEmptyString("The natural-language task for the agent."),
        urls: s.stringArray("The URLs that constrain where the agent can start."),
        schema: looseObject,
        maxCredits: s.integer("The maximum credits the agent may spend."),
        strictConstrainToURLs: s.boolean("Whether the agent must stay strictly within the provided URLs."),
      },
      { optional: ["urls", "schema", "maxCredits", "strictConstrainToURLs"] },
    ),
    outputSchema: s.requiredObject("The output payload for this action.", {
      success: s.boolean("Whether the job was accepted successfully."),
      id: s.string("The Firecrawl agent job ID."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_agent_status",
    description: "Get the current status and output of a Firecrawl agent job by job ID.",
    inputSchema: idInput,
    outputSchema: agentStatusSchema,
  }),
  defineProviderAction(service, {
    name: "agent_cancel",
    description: "Cancel a running Firecrawl agent job by job ID.",
    inputSchema: idInput,
    outputSchema: cancelResultSchema,
  }),
  defineProviderAction(service, {
    name: "deep_research",
    description: "Start a Firecrawl deep research job.",
    inputSchema: s.looseRequiredObject(
      "The input payload for this action.",
      {
        query: s.nonEmptyString("The research question or topic."),
        formats: s.stringArray("The output formats requested from deep research."),
        jsonOptions: jsonOptionsSchema,
        maxUrls: s.integer("The maximum URLs the research job may analyze."),
        maxDepth: s.integer("The maximum research depth for the job."),
        timeLimit: s.integer("The research time limit in seconds."),
        systemPrompt: s.string("A system prompt that guides the research agent."),
        analysisPrompt: s.string("A synthesis prompt that guides the final analysis."),
      },
      { optional: ["formats", "jsonOptions", "maxUrls", "maxDepth", "timeLimit", "systemPrompt", "analysisPrompt"] },
    ),
    outputSchema: s.looseRequiredObject(
      "The output payload for this action.",
      {
        success: s.boolean("Whether the job was accepted successfully."),
        id: s.string("The Firecrawl deep research job ID."),
        status: s.string("The current deep research status."),
        currentDepth: s.integer("The current research depth."),
        maxDepth: s.integer("The configured maximum research depth."),
        expiresAt: s.string("The ISO 8601 expiry timestamp for the job data."),
        data: looseObject,
      },
      { optional: ["status", "currentDepth", "maxDepth", "expiresAt", "data"] },
    ),
  }),
  defineProviderAction(service, {
    name: "get_deep_research_status",
    description: "Get the current status and output of a Firecrawl deep research job by job ID.",
    inputSchema: idInput,
    outputSchema: deepResearchStatusSchema,
  }),
  defineProviderAction(service, {
    name: "llms_txt_generate",
    description: "Start an LLMs.txt generation job for a website.",
    inputSchema: s.looseRequiredObject(
      "The input payload for this action.",
      {
        url: s.nonEmptyString("The root URL to turn into LLMs.txt."),
        maxUrls: s.integer("The maximum URLs to analyze."),
        showFullText: s.boolean("Whether the llms-full.txt content should also be generated."),
      },
      { optional: ["maxUrls", "showFullText"] },
    ),
    outputSchema: s.requiredObject("The output payload for this action.", {
      success: s.boolean("Whether the job was accepted successfully."),
      id: s.string("The Firecrawl LLMs.txt job ID."),
    }),
  }),
  defineProviderAction(service, {
    name: "llms_txt_get",
    description: "Get the current status and generated content of an LLMs.txt job by job ID.",
    inputSchema: idInput,
    outputSchema: llmsTxtStatusSchema,
  }),
  defineProviderAction(service, {
    name: "queue_get",
    description: "Get the authenticated Firecrawl team's queue status and concurrency information.",
    inputSchema: s.looseObject({}, { description: "The input payload for this action." }),
    outputSchema: queueStatusSchema,
  }),
  defineProviderAction(service, {
    name: "credit_usage_get",
    description: "Get the authenticated Firecrawl team's current credit usage summary.",
    inputSchema: s.looseObject({}, { description: "The input payload for this action." }),
    outputSchema: usageSchema,
  }),
  defineProviderAction(service, {
    name: "credit_usage_get_historical",
    description: "Get the authenticated Firecrawl team's historical credit usage summary.",
    inputSchema: s.looseRequiredObject(
      "The input payload for this action.",
      { byApiKey: s.boolean("Whether usage should be grouped by API key.") },
      { optional: ["byApiKey"] },
    ),
    outputSchema: historicalUsageSchema,
  }),
  defineProviderAction(service, {
    name: "token_usage_get",
    description: "Get the authenticated Firecrawl team's current token usage summary.",
    inputSchema: s.looseObject({}, { description: "The input payload for this action." }),
    outputSchema: usageSchema,
  }),
  defineProviderAction(service, {
    name: "token_usage_get_historical",
    description: "Get the authenticated Firecrawl team's historical token usage summary.",
    inputSchema: s.looseRequiredObject(
      "The input payload for this action.",
      { byApiKey: s.boolean("Whether usage should be grouped by API key.") },
      { optional: ["byApiKey"] },
    ),
    outputSchema: historicalUsageSchema,
  }),
];

export type FirecrawlActionName =
  | "scrape"
  | "batch_scrape"
  | "batch_scrape_get"
  | "batch_scrape_get_errors"
  | "batch_scrape_cancel"
  | "crawl"
  | "crawl_v2"
  | "crawl_get"
  | "get_the_status_of_a_crawl_job"
  | "crawl_get_errors"
  | "crawl_cancel"
  | "crawl_delete"
  | "crawl_list_active"
  | "crawl_params_preview"
  | "extract"
  | "extract_get"
  | "search"
  | "map_multiple_urls_based_on_options"
  | "start_agent"
  | "get_agent_status"
  | "agent_cancel"
  | "deep_research"
  | "get_deep_research_status"
  | "llms_txt_generate"
  | "llms_txt_get"
  | "queue_get"
  | "credit_usage_get"
  | "credit_usage_get_historical"
  | "token_usage_get"
  | "token_usage_get_historical";
