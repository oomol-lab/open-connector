import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "scrapingbee";

const scrapingbeeJsonValueSchema = s.unknown(
  "A JSON-compatible value used in ScrapingBee extraction rules or responses.",
);
const extractRulesSchema = s.record(
  "The extraction rules object serialized into the extract_rules query parameter.",
  scrapingbeeJsonValueSchema,
);
const fetchOptionsShape = {
  renderJs: s.boolean("Whether ScrapingBee should render JavaScript before returning the page."),
  waitMs: s.integer("How many milliseconds ScrapingBee should wait before returning the page.", { minimum: 0 }),
  waitFor: s.string("The CSS selector ScrapingBee should wait for before returning the page.", { minLength: 1 }),
  device: s.stringEnum("The device preset used for the request.", ["desktop", "mobile"]),
  blockAds: s.boolean("Whether ScrapingBee should block ads on the page."),
  blockResources: s.boolean("Whether ScrapingBee should block images and CSS resources."),
  countryCode: s.string("The two-letter country code used for request geolocation.", {
    minLength: 2,
    maxLength: 2,
  }),
  premiumProxy: s.boolean("Whether ScrapingBee should use premium proxy routing."),
  stealthProxy: s.boolean("Whether ScrapingBee should use stealth proxy routing."),
  transparentStatusCode: s.boolean("Whether ScrapingBee should return the target page status code transparently."),
  retry: s.positiveInteger("How many times ScrapingBee should retry the request on failure."),
};
const fetchOptionsOptional = [
  "renderJs",
  "waitMs",
  "waitFor",
  "device",
  "blockAds",
  "blockResources",
  "countryCode",
  "premiumProxy",
  "stealthProxy",
  "transparentStatusCode",
  "retry",
] as const;
const fetchHtmlOutputSchema = s.object(
  "The output payload for fetching page HTML with ScrapingBee.",
  {
    html: s.string("The HTML content returned by ScrapingBee."),
    statusCode: s.integer("The HTTP status code returned by ScrapingBee."),
    contentType: s.string("The content type returned by ScrapingBee."),
    initialStatusCode: s.integer("The original target page status code reported by ScrapingBee."),
    resolvedUrl: s.string("The final resolved URL reported by ScrapingBee."),
    creditCost: s.number("The request credit cost reported by ScrapingBee."),
  },
  { optional: ["contentType", "initialStatusCode", "resolvedUrl", "creditCost"] },
);
const extractDataOutputSchema = s.object(
  "The output payload for extracting structured data with ScrapingBee.",
  {
    data: s.record("The structured data object returned by ScrapingBee extract_rules.", scrapingbeeJsonValueSchema),
    statusCode: s.integer("The HTTP status code returned by ScrapingBee."),
    resolvedUrl: s.string("The final resolved URL reported by ScrapingBee."),
    creditCost: s.number("The request credit cost reported by ScrapingBee."),
  },
  { optional: ["resolvedUrl", "creditCost"] },
);
const usageSchema = s.object("The current ScrapingBee usage snapshot.", {
  max_api_credit: s.integer("The maximum API credits available in the current billing period."),
  used_api_credit: s.integer("The API credits already consumed in the current billing period."),
  max_concurrency: s.integer("The maximum number of concurrent requests allowed."),
  current_concurrency: s.integer("The current number of concurrent requests in use."),
  renewal_subscription_date: s.string("The renewal timestamp for the current subscription period."),
});

export const scrapingbeeActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "fetch_html",
    description: "Fetch HTML content from one public URL with optional rendering and proxy controls.",
    inputSchema: s.object(
      "The input payload for fetching page HTML with ScrapingBee.",
      {
        url: s.url("The public URL to fetch with ScrapingBee."),
        ...fetchOptionsShape,
      },
      { optional: fetchOptionsOptional },
    ),
    outputSchema: fetchHtmlOutputSchema,
  }),
  defineProviderAction(service, {
    name: "extract_data",
    description: "Extract structured JSON data from one public URL with ScrapingBee extract_rules.",
    inputSchema: s.object(
      "The input payload for extracting structured data with ScrapingBee.",
      {
        url: s.url("The public URL to extract data from with ScrapingBee."),
        extractRules: extractRulesSchema,
        ...fetchOptionsShape,
      },
      { optional: fetchOptionsOptional },
    ),
    outputSchema: extractDataOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_usage_stats",
    description: "Retrieve the current ScrapingBee API usage and concurrency statistics.",
    inputSchema: s.object("The input payload for retrieving ScrapingBee usage statistics.", {}),
    outputSchema: s.object("The output payload for retrieving ScrapingBee usage statistics.", {
      usage: usageSchema,
    }),
  }),
];
