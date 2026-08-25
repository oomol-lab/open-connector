import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "scrape_do";

const urlSchema = s.url("The public target URL Scrape.do should request.");
const countryCodeSchema = s.string("The two-letter country code used for Scrape.do geo-targeting.", {
  minLength: 2,
  maxLength: 2,
  pattern: "^[A-Za-z]{2}$",
});
const regionalGeoCodeSchema = s.string("The continent code used for Scrape.do regional geo-targeting.", {
  minLength: 2,
});
const positiveIntegerSchema = (description: string) => s.integer(description, { minimum: 1 });
const timeoutSchema = s.integer("The maximum Scrape.do request timeout in milliseconds.", {
  minimum: 5000,
  maximum: 120000,
});
const retryTimeoutSchema = s.integer("The maximum Scrape.do retry timeout in milliseconds.", {
  minimum: 5000,
  maximum: 55000,
});
const outputFormatSchema = s.stringEnum("The Scrape.do output format for page content.", ["raw", "markdown"]);
const deviceSchema = s.stringEnum("The browser device profile Scrape.do should emulate.", [
  "desktop",
  "mobile",
  "tablet",
]);
const headersSchema = s.record(
  "The HTTP response headers returned by Scrape.do or the target website.",
  s.string("One HTTP response header value."),
);
const metadataSchema = s.object("Metadata collected from Scrape.do response headers.", {
  statusCode: s.integer("The HTTP status code returned by Scrape.do."),
  requestCost: s.nullable(s.integer("The Scrape.do credit cost reported for this request.")),
  remainingCredits: s.nullable(s.integer("The remaining Scrape.do credits reported after this request.")),
  contentType: s.nullable(s.string("The response Content-Type header when returned.")),
  finalUrl: s.nullable(s.string("The final response URL observed by the connector.")),
});

const commonScrapeInputShape = {
  url: urlSchema,
  super: s.boolean("Whether Scrape.do should use residential and mobile proxy networks."),
  geoCode: countryCodeSchema,
  regionalGeoCode: regionalGeoCodeSchema,
  sessionId: positiveIntegerSchema("The sticky Scrape.do session identifier."),
  render: s.boolean("Whether Scrape.do should render the page with a headless browser."),
  device: deviceSchema,
  width: positiveIntegerSchema("The browser viewport width in pixels."),
  height: positiveIntegerSchema("The browser viewport height in pixels."),
  blockResources: s.boolean("Whether Scrape.do should block CSS, image, and font resources while rendering."),
  timeout: timeoutSchema,
  retryTimeout: retryTimeoutSchema,
  disableRetry: s.boolean("Whether Scrape.do should disable its retry mechanism."),
  disableRedirection: s.boolean("Whether Scrape.do should disable target request redirection."),
  setCookies: s.string("The Cookie header value Scrape.do should send to the target website.", { minLength: 1 }),
  customHeaders: s.boolean("Whether Scrape.do should handle all request headers."),
  forwardHeaders: s.boolean("Whether Scrape.do should forward caller headers to the target."),
  output: outputFormatSchema,
};

const commonScrapeInputOptional = [
  "super",
  "geoCode",
  "regionalGeoCode",
  "sessionId",
  "render",
  "device",
  "width",
  "height",
  "blockResources",
  "timeout",
  "retryTimeout",
  "disableRetry",
  "disableRedirection",
  "setCookies",
  "customHeaders",
  "forwardHeaders",
  "output",
] as const;

const commonScrapeInputSchema = s.object("Common synchronous Scrape.do API parameters.", commonScrapeInputShape, {
  optional: commonScrapeInputOptional,
});

const returnJsonInputSchema = s.object(
  "The input payload for fetching a Scrape.do returnJSON response.",
  {
    ...commonScrapeInputShape,
    showFrames: s.boolean("Whether Scrape.do should include iframe content when render and returnJSON are enabled."),
    showWebsocketRequests: s.boolean(
      "Whether Scrape.do should include WebSocket requests when render and returnJSON are enabled.",
    ),
  },
  { optional: [...commonScrapeInputOptional, "showFrames", "showWebsocketRequests"] },
);

const screenshotInputSchema = s.object(
  "The input payload for taking a screenshot with Scrape.do.",
  {
    ...commonScrapeInputShape,
    fullPage: s.boolean("Whether Scrape.do should capture a full-page screenshot."),
    selector: s.string("A CSS selector for a partial screenshot area.", { minLength: 1 }),
  },
  { optional: [...commonScrapeInputOptional, "fullPage", "selector"] },
);

const responseOutputSchema = s.object("The response returned by a synchronous Scrape.do request.", {
  content: s.string("The response body returned by Scrape.do."),
  statusCode: s.integer("The HTTP status code returned by Scrape.do."),
  headers: headersSchema,
  metadata: metadataSchema,
});

const jsonOutputSchema = s.object("The JSON response returned by Scrape.do returnJSON mode.", {
  data: s.unknown("The parsed JSON payload returned by Scrape.do."),
  statusCode: s.integer("The HTTP status code returned by Scrape.do."),
  headers: headersSchema,
  metadata: metadataSchema,
});

const screenshotOutputSchema = s.object("The screenshot response returned by Scrape.do.", {
  imageBase64: s.string("The screenshot image encoded as a base64 string."),
  contentType: s.string("The screenshot response content type."),
  statusCode: s.integer("The HTTP status code returned by Scrape.do."),
  headers: headersSchema,
  metadata: metadataSchema,
});

const accountInfoSchema = s.looseRequiredObject("The account information and usage payload returned by Scrape.do.", {
  is_active: s.boolean("Whether the Scrape.do subscription is active."),
  concurrent_request: s.integer("The maximum concurrent request count for the account."),
  max_monthly_request: s.integer("The maximum monthly request count for the account."),
  remaining_concurrent_request: s.integer("The remaining concurrent request count for the account."),
  remaining_monthly_request: s.integer("The remaining monthly request count for the account."),
});

export const scrapeDoActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "fetch_html",
    description: "Fetch one public URL through Scrape.do and return the synchronous response body.",
    inputSchema: commonScrapeInputSchema,
    outputSchema: responseOutputSchema,
  }),
  defineProviderAction(service, {
    name: "fetch_json",
    description: "Fetch one public URL through Scrape.do returnJSON mode and return the parsed JSON payload.",
    inputSchema: returnJsonInputSchema,
    outputSchema: jsonOutputSchema,
  }),
  defineProviderAction(service, {
    name: "take_screenshot",
    description: "Render one public URL through Scrape.do and return a screenshot as base64.",
    inputSchema: screenshotInputSchema,
    outputSchema: screenshotOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_account_info",
    description: "Retrieve Scrape.do account information and usage counters for the API token.",
    inputSchema: s.object("The input payload for retrieving Scrape.do account information.", {}),
    outputSchema: s.object("The output payload for Scrape.do account information.", {
      account: accountInfoSchema,
    }),
  }),
];
