import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "webscraping_ai";

const targetUrlSchema = s.string({
  description: "The target page URL WebScraping.AI should retrieve.",
  format: "uri",
  minLength: 1,
  maxLength: 2083,
});

const headersSchema = s.record(
  "HTTP headers WebScraping.AI should send to the target page.",
  s.nonEmptyString("One header value sent to the target page."),
);

const timeoutSchema = s.integer("Maximum target page retrieval time in milliseconds.", {
  minimum: 1,
  maximum: 30000,
});

const jsTimeoutSchema = s.integer("Maximum JavaScript rendering time in milliseconds.", {
  minimum: 1,
  maximum: 20000,
});

const proxySchema = s.stringEnum("The WebScraping.AI proxy pool to use for the target page.", [
  "datacenter",
  "residential",
  "stealth",
]);

const countrySchema = s.stringEnum("The proxy country code to use for the target page.", [
  "us",
  "gb",
  "de",
  "it",
  "fr",
  "ca",
  "es",
  "ru",
  "jp",
  "kr",
  "in",
  "hk",
  "tr",
]);

const deviceSchema = s.stringEnum("The browser device profile WebScraping.AI should emulate.", [
  "desktop",
  "mobile",
  "tablet",
]);

const commonScrapeInputSchemas = {
  url: targetUrlSchema,
  headers: headersSchema,
  timeout: timeoutSchema,
  js: s.boolean("Whether WebScraping.AI should execute on-page JavaScript."),
  jsTimeout: jsTimeoutSchema,
  waitFor: s.nonEmptyString("A CSS selector WebScraping.AI should wait for before returning."),
  proxy: proxySchema,
  country: countrySchema,
  device: deviceSchema,
  errorOn404: s.boolean("Whether target page HTTP 404 responses should be returned as errors."),
  errorOnRedirect: s.boolean("Whether target page redirects should be returned as errors."),
  jsScript: s.nonEmptyString("Custom JavaScript code to execute on the target page."),
} as const;

const contentOutputSchema = s.actionOutput(
  {
    content: s.string("The response body returned by WebScraping.AI."),
    statusCode: s.integer("The HTTP status code returned by WebScraping.AI."),
    contentType: s.nullableString("The response Content-Type header when returned."),
  },
  "The WebScraping.AI text response.",
);

const accountSchema = s.looseObject("The WebScraping.AI account limits payload.", {
  email: s.string("The account email returned by WebScraping.AI."),
  remaining_api_calls: s.integer("Remaining API call credits in the current billing period."),
  resets_at: s.integer("Next billing cycle start time as a UNIX timestamp."),
  remaining_concurrency: s.integer("Remaining concurrent requests for the account."),
});

export const webscrapingAiActions: readonly ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_account_info",
    description: "Retrieve WebScraping.AI account email, quota, reset, and concurrency details.",
    inputSchema: s.actionInput({}, [], "The input payload for retrieving WebScraping.AI account info."),
    outputSchema: s.actionOutput(
      {
        account: accountSchema,
      },
      "The output payload for retrieving WebScraping.AI account info.",
    ),
  }),
  defineProviderAction(service, {
    name: "fetch_html",
    description: "Fetch the rendered HTML content of one target page with WebScraping.AI.",
    inputSchema: s.actionInput(
      {
        ...commonScrapeInputSchemas,
        returnScriptResult: s.boolean("Whether to return the custom JavaScript result instead of the page HTML."),
      },
      ["url"],
      "The input payload for fetching page HTML with WebScraping.AI.",
    ),
    outputSchema: contentOutputSchema,
  }),
  defineProviderAction(service, {
    name: "extract_text",
    description: "Extract visible text from one target page with WebScraping.AI.",
    inputSchema: s.object(
      "The input payload for extracting page text with WebScraping.AI.",
      {
        ...commonScrapeInputSchemas,
        textFormat: s.stringEnum("The WebScraping.AI text response format.", ["plain", "xml", "json"]),
        returnLinks: s.boolean("Whether WebScraping.AI should include links when textFormat is json."),
      },
      { required: ["url"] },
    ),
    outputSchema: contentOutputSchema,
  }),
  defineProviderAction(service, {
    name: "select_html",
    description: "Fetch HTML for one selected target page area with WebScraping.AI.",
    inputSchema: s.object(
      "The input payload for selecting one page area with WebScraping.AI.",
      {
        ...commonScrapeInputSchemas,
        selector: s.nonEmptyString("The CSS selector for the page area to return."),
      },
      { required: ["url", "selector"] },
    ),
    outputSchema: contentOutputSchema,
  }),
  defineProviderAction(service, {
    name: "select_multiple_html",
    description: "Fetch HTML for multiple selected target page areas with WebScraping.AI.",
    inputSchema: s.object(
      "The input payload for selecting multiple page areas with WebScraping.AI.",
      {
        ...commonScrapeInputSchemas,
        selectors: s.array(
          "CSS selectors for the page areas to return.",
          s.nonEmptyString("One CSS selector for a page area."),
          {
            minItems: 1,
          },
        ),
      },
      { required: ["url", "selectors"] },
    ),
    outputSchema: s.actionOutput(
      {
        areas: s.array(
          "HTML snippets returned for each requested selector.",
          s.string("One selected HTML snippet returned by WebScraping.AI."),
        ),
        statusCode: s.integer("The HTTP status code returned by WebScraping.AI."),
        contentType: s.nullableString("The response Content-Type header when returned."),
      },
      "The WebScraping.AI selected areas response.",
    ),
  }),
] as const;
