import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "zenrows";

const urlSchema = s.string({
  description: "The public URL ZenRows should request.",
  format: "uri",
  minLength: 1,
  maxLength: 2083,
});
const waitSchema = s.integer("The time in milliseconds ZenRows should wait after page load before returning content.", {
  minimum: 1,
  maximum: 30000,
});
const waitForSchema = s.nonEmptyString("The CSS selector ZenRows should wait for before returning content.");
const jsRenderSchema = s.boolean("Whether ZenRows should render JavaScript before returning the response.");
const premiumProxySchema = s.boolean("Whether ZenRows should use premium proxies for the request.");
const proxyCountrySchema = s.string({
  description:
    "The ISO 3166-1 alpha-2 country code for proxy geolocation. ZenRows requires premium_proxy when this is set.",
  pattern: "^[A-Za-z]{2}$",
});
const sessionIdSchema = s.nonEmptyString(
  "The ZenRows session identifier used to keep the same IP across related requests.",
);
const customHeadersSchema = s.record(
  "Custom HTTP headers ZenRows should send to the target website.",
  s.string("A custom header value sent to the target website."),
);

const commonScrapeProperties = {
  url: urlSchema,
  js_render: jsRenderSchema,
  wait: waitSchema,
  wait_for: waitForSchema,
  premium_proxy: premiumProxySchema,
  proxy_country: proxyCountrySchema,
  session_id: sessionIdSchema,
  custom_headers: customHeadersSchema,
};

const optionalScrapeFields = [
  "js_render",
  "wait",
  "wait_for",
  "premium_proxy",
  "proxy_country",
  "session_id",
  "custom_headers",
];

const responseHeadersSchema = s.record(
  "Response headers returned by ZenRows or the target website.",
  s.string("One response header value."),
);

const responseMetadataSchema = s.object("Metadata collected from ZenRows response headers.", {
  status_code: s.integer("The HTTP status code returned by ZenRows."),
  content_type: s.nullable(s.string("The response content type returned by ZenRows.")),
  original_status_code: s.nullable(s.integer("The original target website status code reported by ZenRows.")),
  final_url: s.nullable(s.string("The final URL reported by ZenRows after redirects.")),
  request_id: s.nullable(s.string("The ZenRows request identifier when returned.")),
  concurrency_limit: s.nullable(s.integer("The maximum concurrent requests allowed for the API key when returned.")),
  concurrency_remaining: s.nullable(s.integer("The remaining concurrent request slots when returned.")),
});

const cssSelectorsSchema = s.record(
  "CSS selectors ZenRows should extract, keyed by output field name.",
  s.string("A CSS selector expression accepted by ZenRows."),
);

const extractedDataSchema = s.record(
  "The CSS extraction result returned by ZenRows.",
  s.unknown("A value extracted by ZenRows for one selector."),
);

const usageSchema = s.looseRequiredObject("The ZenRows API usage details.", {
  status: s.string("The current subscription status returned by ZenRows."),
  period_starts_at: s.string("The start date of the current usage period."),
  period_ends_at: s.string("The end date of the current usage period."),
  usage: s.number("The current usage value."),
  usage_percent: s.integer("The usage percentage for the current period."),
  plan: s.looseObject("The plan object returned by ZenRows usage details."),
  top_ups: s.array(
    "Top-ups applied to the account.",
    s.looseObject("One top-up entry returned by ZenRows usage details."),
  ),
});

export const zenrowsActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "fetch_html",
    description: "Fetch raw HTML from one public URL with optional JavaScript rendering and proxy controls.",
    inputSchema: s.object(
      "The input payload for fetching raw HTML with ZenRows.",
      {
        ...commonScrapeProperties,
        original_status: s.boolean("Whether ZenRows should expose the original target website status code."),
      },
      {
        optional: [...optionalScrapeFields, "original_status"],
      },
    ),
    outputSchema: s.object("The response returned when fetching raw HTML with ZenRows.", {
      html: s.string("The raw HTML content returned by ZenRows."),
      metadata: responseMetadataSchema,
      headers: responseHeadersSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "fetch_plaintext",
    description: "Fetch plain text extracted from one public URL with ZenRows.",
    inputSchema: s.object("The input payload for fetching plain text with ZenRows.", commonScrapeProperties, {
      optional: optionalScrapeFields,
    }),
    outputSchema: s.object("The response returned when fetching plain text with ZenRows.", {
      text: s.string("The plain text content returned by ZenRows."),
      metadata: responseMetadataSchema,
      headers: responseHeadersSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "extract_css",
    description: "Extract structured values from one public URL with ZenRows CSS selectors.",
    inputSchema: s.object(
      "The input payload for extracting CSS selector values with ZenRows.",
      {
        ...commonScrapeProperties,
        css_selectors: cssSelectorsSchema,
      },
      {
        optional: optionalScrapeFields,
      },
    ),
    outputSchema: s.object("The response returned when extracting CSS selector values with ZenRows.", {
      data: extractedDataSchema,
      metadata: responseMetadataSchema,
      headers: responseHeadersSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_usage",
    description: "Retrieve usage and plan details for the connected ZenRows API key.",
    inputSchema: s.object("The input payload for retrieving ZenRows usage details.", {}),
    outputSchema: s.object("The response returned when retrieving ZenRows usage details.", {
      usage: usageSchema,
    }),
  }),
];
