import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "scraperapi";

const targetUrlSchema = s.string({
  description: "The public target URL ScraperAPI should request.",
  format: "uri",
  minLength: 1,
  maxLength: 2083,
});

const countryCodeSchema = s.string({
  description: "The two-letter country code used for request geolocation.",
  minLength: 2,
  maxLength: 2,
});
const submitBodyMaxLength = 1_000_000;

const customHeadersSchema = s.record(
  "Custom HTTP headers ScraperAPI should forward to the target URL when keepHeaders is true.",
  s.string("One custom HTTP header value."),
);

const commonScrapeProperties = {
  url: targetUrlSchema,
  render: s.boolean("Whether ScraperAPI should render JavaScript before returning the response."),
  waitForSelector: s.nonEmptyString(
    "The CSS selector ScraperAPI should wait for before returning the response. This requires render to be true.",
  ),
  countryCode: countryCodeSchema,
  premium: s.boolean("Whether ScraperAPI should use premium residential or mobile proxies."),
  ultraPremium: s.boolean("Whether ScraperAPI should use advanced bypass mechanisms."),
  sessionNumber: s.positiveInteger("The sticky session number used to reuse the same proxy across related requests."),
  keepHeaders: s.boolean("Whether ScraperAPI should forward provided custom headers to the target URL."),
  deviceType: s.stringEnum("The device type ScraperAPI should emulate.", ["desktop", "mobile"]),
  outputFormat: s.stringEnum("The text-oriented output format ScraperAPI should return.", ["text", "markdown"]),
  followRedirect: s.boolean("Whether ScraperAPI should follow target website redirects."),
  customHeaders: customHeadersSchema,
};

const commonRequiredFields = ["url"];

const responseHeadersSchema = s.record(
  "Response headers returned by ScraperAPI or the target website.",
  s.string("One response header value."),
);

const scrapeMetadataSchema = s.actionOutput(
  {
    statusCode: s.integer("The HTTP status code returned by ScraperAPI."),
    contentType: s.nullableString("The response content type returned by ScraperAPI."),
  },
  "Metadata collected from the ScraperAPI response.",
);

const scrapeResponseSchema = s.actionOutput(
  {
    body: s.string("The response body returned by ScraperAPI."),
    metadata: scrapeMetadataSchema,
    headers: responseHeadersSchema,
  },
  "The response returned by a ScraperAPI synchronous request.",
);

const accountUsageSchema = s.looseObject("Usage and account details returned by ScraperAPI.");

export const scraperapiActions: readonly ActionDefinition[] = [
  defineProviderAction(service, {
    name: "scrape_url",
    description:
      "Fetch one public URL through ScraperAPI with optional rendering, geotargeting, and text output controls.",
    inputSchema: s.actionInput(
      commonScrapeProperties,
      commonRequiredFields,
      "The input payload for scraping one URL with ScraperAPI.",
    ),
    outputSchema: scrapeResponseSchema,
  }),
  defineProviderAction(service, {
    name: "submit_url",
    description: "Send a POST or PUT request to one public URL through ScraperAPI.",
    inputSchema: s.actionInput(
      {
        ...commonScrapeProperties,
        method: s.stringEnum("The HTTP method ScraperAPI should send to the target URL.", ["POST", "PUT"]),
        body: s.string("The request body to send to the target URL.", { maxLength: submitBodyMaxLength }),
        contentType: s.string({
          description: "The Content-Type header for the submitted request body.",
          minLength: 1,
        }),
      },
      ["url", "method", "body"],
      "The input payload for submitting a request through ScraperAPI.",
    ),
    outputSchema: scrapeResponseSchema,
  }),
  defineProviderAction(service, {
    name: "get_account_usage",
    description: "Retrieve current ScraperAPI account usage and limits.",
    inputSchema: s.actionInput({}, [], "The input payload for retrieving ScraperAPI account usage."),
    outputSchema: s.actionOutput(
      {
        usage: accountUsageSchema,
      },
      "The response returned when retrieving ScraperAPI account usage.",
    ),
  }),
];
