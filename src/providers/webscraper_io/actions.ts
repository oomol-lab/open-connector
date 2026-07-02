import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "webscraper_io";

const nonEmptyString = (description: string): JsonSchema => s.nonEmptyString(description);
const positiveInteger = (description: string): JsonSchema => s.positiveInteger(description);
const nonNegativeInteger = (description: string): JsonSchema => s.nonNegativeInteger(description);
const paginationInputSchema: Record<string, JsonSchema> = {
  page: positiveInteger("The one-based page number to request."),
  tag: nonEmptyString("The sitemap or scraping job tag used to filter results."),
};
const paginationOutputSchema: Record<string, JsonSchema> = {
  current_page: positiveInteger("The current result page returned by Web Scraper Cloud."),
  last_page: positiveInteger("The last available result page returned by Web Scraper Cloud."),
  total: nonNegativeInteger("The total number of records available for the query."),
  per_page: nonNegativeInteger("The number of records returned per result page."),
};
const sitemapJsonSchema = s.object(
  "The sitemap JSON document sent to or returned by Web Scraper Cloud.",
  {
    _id: nonEmptyString("The sitemap identifier inside the sitemap JSON."),
    startUrl: s.array("The sitemap start URLs used by Web Scraper Cloud.", nonEmptyString("One sitemap start URL."), {
      minItems: 1,
    }),
    selectors: s.array(
      "The selector definitions included in the sitemap JSON.",
      s.looseObject("One selector object from the sitemap JSON."),
      {
        minItems: 1,
      },
    ),
  },
  { additionalProperties: true, required: ["_id", "startUrl", "selectors"] },
);
const sitemapSummarySchema = s.object("A minimal sitemap summary returned by Web Scraper Cloud.", {
  id: positiveInteger("The numeric sitemap ID."),
  name: nonEmptyString("The sitemap name."),
});
const scrapingJobSchema = s.object("A normalized scraping job record returned by Web Scraper Cloud.", {
  id: positiveInteger("The numeric scraping job ID."),
  custom_id: s.nullable(s.string("The custom scraping job identifier when provided.")),
  sitemap_name: s.nullable(s.string("The sitemap name associated with the scraping job.")),
  status: s.nullable(s.string("The scraping job status returned by Web Scraper Cloud.")),
  sitemap_id: s.nullable(s.integer("The numeric sitemap ID associated with the scraping job.")),
  test_run: s.nullable(s.integer("Whether the scraping job was created as a test run.")),
  jobs_scheduled: s.nullable(s.integer("The number of jobs scheduled for the scraping run.")),
  jobs_executed: s.nullable(s.integer("The number of jobs executed for the scraping run.")),
  jobs_failed: s.nullable(s.integer("The number of failed jobs in the scraping run.")),
  jobs_empty: s.nullable(s.integer("The number of empty-result jobs in the scraping run.")),
  jobs_no_value: s.nullable(s.integer("The number of no-value-result jobs in the scraping run.")),
  stored_record_count: s.nullable(s.integer("The number of stored records produced by the scraping run.")),
  request_interval: s.nullable(s.integer("The configured request interval in milliseconds for the scraping run.")),
  page_load_delay: s.nullable(s.integer("The configured page load delay in milliseconds for the scraping run.")),
  driver: s.nullable(s.string("The scraping driver returned by Web Scraper Cloud.")),
  scheduled: s.nullable(s.integer("Whether the scraping job was started by the sitemap scheduler.")),
  time_created: s.nullable(s.integer("The Unix timestamp when the scraping job was created.")),
  scraping_duration: s.nullable(s.integer("The scraping duration in seconds when the run has completed.")),
  raw: s.looseObject("The raw scraping job object returned by Web Scraper Cloud."),
});

export const webscraperIoActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_account_info",
    description: "Get the current Web Scraper Cloud account profile for the connected API token.",
    requiredScopes: [],
    inputSchema: s.actionInput({}, [], "The input payload for getting Web Scraper Cloud account info."),
    outputSchema: s.actionOutput(
      {
        email: s.nullable(s.string("The account email address.")),
        firstname: s.nullable(s.string("The account first name.")),
        lastname: s.nullable(s.string("The account last name.")),
        page_credits: s.nullable(s.integer("The remaining Web Scraper Cloud page credits.")),
        raw: s.looseObject("The raw account object returned by Web Scraper Cloud."),
      },
      "The response returned for Web Scraper Cloud account info.",
    ),
  }),
  defineProviderAction(service, {
    name: "create_sitemap",
    description: "Create a new Web Scraper Cloud sitemap from a sitemap JSON document.",
    requiredScopes: [],
    inputSchema: sitemapJsonSchema,
    outputSchema: s.actionOutput(
      { id: positiveInteger("The numeric sitemap ID created by Web Scraper Cloud.") },
      "The response returned after creating a Web Scraper Cloud sitemap.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_sitemap",
    description: "Get one Web Scraper Cloud sitemap by numeric sitemap ID.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      { sitemap_id: positiveInteger("The numeric sitemap ID to fetch.") },
      ["sitemap_id"],
      "The input payload for getting one Web Scraper Cloud sitemap.",
    ),
    outputSchema: s.actionOutput(
      {
        id: positiveInteger("The numeric sitemap ID."),
        name: nonEmptyString("The sitemap name."),
        sitemap: sitemapJsonSchema,
        sitemap_json: nonEmptyString("The raw sitemap JSON string returned by Web Scraper Cloud."),
      },
      "The response returned for one Web Scraper Cloud sitemap.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_sitemaps",
    description: "List Web Scraper Cloud sitemaps with optional page and tag filters.",
    requiredScopes: [],
    inputSchema: s.actionInput(paginationInputSchema, [], "The input payload for listing Web Scraper Cloud sitemaps."),
    outputSchema: s.actionOutput(
      {
        items: s.array("The sitemap summaries returned by Web Scraper Cloud.", sitemapSummarySchema),
        ...paginationOutputSchema,
      },
      "The response returned when listing Web Scraper Cloud sitemaps.",
    ),
  }),
  defineProviderAction(service, {
    name: "update_sitemap",
    description: "Update an existing Web Scraper Cloud sitemap by numeric sitemap ID.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for updating one Web Scraper Cloud sitemap.",
      {
        sitemap_id: positiveInteger("The numeric sitemap ID to update."),
        _id: nonEmptyString("The sitemap identifier inside the sitemap JSON."),
        startUrl: s.array(
          "The sitemap start URLs used by Web Scraper Cloud.",
          nonEmptyString("One sitemap start URL."),
          {
            minItems: 1,
          },
        ),
        selectors: s.array(
          "The selector definitions included in the sitemap JSON.",
          s.looseObject("One selector object from the sitemap JSON."),
          {
            minItems: 1,
          },
        ),
      },
      { additionalProperties: true, required: ["sitemap_id", "_id", "startUrl", "selectors"] },
    ),
    outputSchema: s.actionOutput(
      { ok: s.boolean("Whether Web Scraper Cloud confirmed the sitemap update.") },
      "The response returned after updating a Web Scraper Cloud sitemap.",
    ),
  }),
  defineProviderAction(service, {
    name: "delete_sitemap",
    description: "Delete a Web Scraper Cloud sitemap by numeric sitemap ID.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      { sitemap_id: positiveInteger("The numeric sitemap ID to delete.") },
      ["sitemap_id"],
      "The input payload for deleting one Web Scraper Cloud sitemap.",
    ),
    outputSchema: s.actionOutput(
      { ok: s.boolean("Whether Web Scraper Cloud confirmed the sitemap deletion.") },
      "The response returned after deleting a Web Scraper Cloud sitemap.",
    ),
  }),
  defineProviderAction(service, {
    name: "create_scraping_job",
    description: "Create a Web Scraper Cloud scraping job for one sitemap.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        sitemap_id: positiveInteger("The numeric sitemap ID to scrape."),
        driver: s.stringEnum("The scraping driver to use for the job.", ["fast", "fulljs"]),
        page_load_delay: nonNegativeInteger("The page load delay in milliseconds for the scraping job."),
        request_interval: nonNegativeInteger("The request interval in milliseconds for the scraping job."),
        proxy: nonEmptyString("The proxy value such as datacenter-us or residential-us for the scraping job."),
        start_urls: s.array(
          "The optional start URLs that override the sitemap start URLs for this job.",
          nonEmptyString("One start URL override."),
          {
            minItems: 1,
          },
        ),
        custom_id: nonEmptyString("The optional custom scraping job identifier included in webhook notifications."),
      },
      ["sitemap_id"],
      "The input payload for creating one Web Scraper Cloud scraping job.",
    ),
    outputSchema: s.actionOutput(
      {
        id: positiveInteger("The numeric scraping job ID created by Web Scraper Cloud."),
        custom_id: s.nullable(s.string("The custom scraping job identifier when provided.")),
      },
      "The response returned after creating one Web Scraper Cloud scraping job.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_scraping_job",
    description: "Get one Web Scraper Cloud scraping job by numeric scraping job ID.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      { scraping_job_id: positiveInteger("The numeric scraping job ID to fetch.") },
      ["scraping_job_id"],
      "The input payload for getting one Web Scraper Cloud scraping job.",
    ),
    outputSchema: scrapingJobSchema,
  }),
  defineProviderAction(service, {
    name: "list_scraping_jobs",
    description: "List Web Scraper Cloud scraping jobs with optional page, sitemap, and tag filters.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        page: positiveInteger("The one-based page number to request."),
        sitemap_id: positiveInteger("The optional numeric sitemap ID used to filter jobs."),
        tag: nonEmptyString("The optional scraping job tag used to filter results."),
      },
      [],
      "The input payload for listing Web Scraper Cloud scraping jobs.",
    ),
    outputSchema: s.actionOutput(
      {
        items: s.array("The scraping job records returned by Web Scraper Cloud.", scrapingJobSchema),
        ...paginationOutputSchema,
      },
      "The response returned when listing Web Scraper Cloud scraping jobs.",
    ),
  }),
  defineProviderAction(service, {
    name: "delete_scraping_job",
    description: "Delete a Web Scraper Cloud scraping job by numeric scraping job ID.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      { scraping_job_id: positiveInteger("The numeric scraping job ID to delete.") },
      ["scraping_job_id"],
      "The input payload for deleting one Web Scraper Cloud scraping job.",
    ),
    outputSchema: s.actionOutput(
      { ok: s.boolean("Whether Web Scraper Cloud confirmed the scraping job deletion.") },
      "The response returned after deleting one Web Scraper Cloud scraping job.",
    ),
  }),
  defineProviderAction(service, {
    name: "download_scraping_job_json",
    description: "Download one Web Scraper Cloud scraping job result in JSON Lines format.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      { scraping_job_id: positiveInteger("The numeric scraping job ID to download.") },
      ["scraping_job_id"],
      "The input payload for downloading one Web Scraper Cloud scraping job result in JSON Lines format.",
    ),
    outputSchema: s.actionOutput(
      {
        rows: s.array(
          "The parsed JSON objects returned from the JSON Lines export.",
          s.looseObject("One parsed JSON Lines row returned by Web Scraper Cloud."),
        ),
        row_count: nonNegativeInteger("The number of parsed JSON rows returned by the export."),
      },
      "The response returned after downloading one Web Scraper Cloud scraping job result in JSON Lines format.",
    ),
  }),
];

export type WebscraperIoActionName =
  | "get_account_info"
  | "create_sitemap"
  | "get_sitemap"
  | "list_sitemaps"
  | "update_sitemap"
  | "delete_sitemap"
  | "create_scraping_job"
  | "get_scraping_job"
  | "list_scraping_jobs"
  | "delete_scraping_job"
  | "download_scraping_job_json";
