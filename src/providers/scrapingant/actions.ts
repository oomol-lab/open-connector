import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "scrapingant";

const trimmedString = (description: string) => s.string(description, { minLength: 1 });
const proxyCountrySchema = s.string("The two-letter proxy country code.", {
  minLength: 2,
  maxLength: 2,
  pattern: "^[A-Za-z]{2}$",
});
const timeoutSchema = s.integer("The maximum upstream request time in seconds.", { minimum: 5, maximum: 60 });
const httpMethodSchema = s.stringEnum("The HTTP method sent to the target site through ScrapingAnt.", [
  "GET",
  "POST",
  "PUT",
  "DELETE",
]);
const proxyTypeSchema = s.stringEnum("The proxy network to use for the request.", ["datacenter", "residential"]);
const blockResourceSchema = s.array(
  "The resource types ScrapingAnt should block while rendering.",
  s.stringEnum("One blocked resource type.", [
    "document",
    "stylesheet",
    "image",
    "media",
    "font",
    "script",
    "texttrack",
    "xhr",
    "fetch",
    "eventsource",
    "websocket",
    "manifest",
    "other",
  ]),
  { minItems: 1 },
);
const customHeadersSchema = s.record(
  "Custom request headers forwarded to the target page through Ant-* headers.",
  trimmedString("One custom header value."),
);
const bodyJsonSchema = s.looseObject(
  "A JSON object request body forwarded to the target page for POST, PUT, or DELETE requests.",
);

const commonRequestInputShape = {
  url: s.url("The absolute URL to scrape."),
  method: httpMethodSchema,
  browser: s.boolean("Whether ScrapingAnt should render the page in a headless browser."),
  timeout: timeoutSchema,
  returnPageSource: s.boolean(
    "Whether ScrapingAnt should return the raw server page source without JavaScript rendering.",
  ),
  cookies: trimmedString("The cookie string sent to the target site, for example name=value; second=value."),
  jsSnippet: trimmedString("A plain JavaScript snippet that the connector will Base64-encode for ScrapingAnt."),
  proxyType: proxyTypeSchema,
  proxyCountry: proxyCountrySchema,
  waitForSelector: trimmedString("The CSS selector ScrapingAnt should wait for before returning the result."),
  blockResource: blockResourceSchema,
  customHeaders: customHeadersSchema,
  bodyText: trimmedString("A raw text request body forwarded to the target page for POST, PUT, or DELETE requests."),
  bodyJson: bodyJsonSchema,
};
const commonRequestOptional = [
  "method",
  "browser",
  "timeout",
  "returnPageSource",
  "cookies",
  "jsSnippet",
  "proxyType",
  "proxyCountry",
  "waitForSelector",
  "blockResource",
  "customHeaders",
  "bodyText",
  "bodyJson",
] as const;
const commonRequestInputSchema = s.object(
  "The common ScrapingAnt request parameters supported by the v2 scraping endpoints.",
  commonRequestInputShape,
  { optional: commonRequestOptional },
);

const headerItemSchema = s.object("One HTTP header item returned by ScrapingAnt.", {
  name: trimmedString("The header name."),
  value: trimmedString("The header value."),
});
const xhrItemSchema = s.looseRequiredObject(
  "One XHR or fetch request captured by ScrapingAnt.",
  {
    url: s.url("The captured request URL."),
    status: s.integer("The captured response status code."),
    method: trimmedString("The captured HTTP method."),
    headers: s.array("The headers captured for the XHR request.", headerItemSchema),
    body: trimmedString("The response body captured for the XHR request."),
    request_body: trimmedString("The request body captured for the XHR request."),
  },
  { optional: ["body", "request_body"] },
);
const iframeItemSchema = s.object("One iframe captured by ScrapingAnt.", {
  src: s.url("The iframe source URL."),
  html: trimmedString("The rendered iframe HTML."),
});
const extendedOutputSchema = s.object("The extended JSON response returned by ScrapingAnt.", {
  html: trimmedString("The rendered page HTML."),
  text: trimmedString("The extracted plain text content."),
  cookies: s.string("The response cookies returned by the target page."),
  status_code: s.integer("The HTTP status code returned by the target page."),
  headers: s.array("The HTTP response headers returned by the target page.", headerItemSchema),
  xhrs: s.array("The XHR and fetch requests captured during page rendering.", xhrItemSchema),
  iframes: s.array("The iframe payloads captured during page rendering.", iframeItemSchema),
});
const markdownOutputSchema = s.object("The Markdown extraction response returned by ScrapingAnt.", {
  url: s.url("The original requested URL."),
  markdown: trimmedString("The Markdown content extracted from the target page."),
});
const aiExtractionInputSchema = s.object(
  "The input payload for ScrapingAnt AI extraction.",
  {
    ...commonRequestInputShape,
    extractProperties: trimmedString(
      "The free-form extraction description that ScrapingAnt will map into top-level JSON fields.",
    ),
  },
  { optional: commonRequestOptional },
);
const usageOutputSchema = s.object("The credits usage payload returned by ScrapingAnt.", {
  plan_name: trimmedString("The active subscription plan name."),
  start_date: trimmedString("The active subscription start date."),
  end_date: trimmedString("The active subscription end date."),
  plan_total_credits: s.integer("The total credits available for the active plan."),
  remained_credits: s.integer("The remaining credits available for the active plan."),
});

export const scrapingantActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "scrape_with_extended_json_output",
    description:
      "Scrape a page through ScrapingAnt's v2 extended endpoint and return HTML, text, cookies, headers, XHRs, and iframes.",
    inputSchema: commonRequestInputSchema,
    outputSchema: extendedOutputSchema,
  }),
  defineProviderAction(service, {
    name: "extract_content_as_markdown",
    description: "Convert a page into Markdown through ScrapingAnt's Markdown transformation endpoint.",
    inputSchema: commonRequestInputSchema,
    outputSchema: markdownOutputSchema,
  }),
  defineProviderAction(service, {
    name: "extract_data_with_ai",
    description: "Extract structured top-level JSON fields from a page through ScrapingAnt's AI extraction endpoint.",
    inputSchema: aiExtractionInputSchema,
    outputSchema: s.looseObject("The top-level JSON object returned by ScrapingAnt AI extraction."),
  }),
  defineProviderAction(service, {
    name: "get_api_credits_usage",
    description: "Read the current ScrapingAnt subscription status and remaining API credits.",
    inputSchema: s.object("The input payload for retrieving ScrapingAnt API credits usage.", {}),
    outputSchema: usageOutputSchema,
  }),
];
