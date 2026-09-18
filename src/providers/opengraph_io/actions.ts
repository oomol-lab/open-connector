import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "opengraph_io";

const rawObjectSchema = s.looseObject("A loose JSON object returned by OpenGraph.io.");

const requestInfoSchema = s.looseObject("Information about the upstream request performed by OpenGraph.io.", {
  host: s.string("The host that responded to the request."),
  redirects: s.integer("The number of redirects followed while fetching the URL."),
  responseCode: s.integer("The HTTP response code returned upstream."),
  responseContentType: s.string("The upstream response Content-Type header when available."),
});

const siteOutputSchema = s.looseObject("The normalized metadata payload returned by the OpenGraph.io Site endpoint.", {
  hybridGraph: rawObjectSchema,
  openGraph: rawObjectSchema,
  twitterCard: rawObjectSchema,
  htmlInferred: rawObjectSchema,
  oEmbed: rawObjectSchema,
  requestUrl: s.string("The final URL that OpenGraph.io resolved after redirects."),
  requestInfo: requestInfoSchema,
  cached: s.boolean("Whether the result came from cache."),
  createdAt: s.nullableString("The ISO 8601 timestamp when the cached result was created."),
  retryInfo: rawObjectSchema,
  aiSafety: rawObjectSchema,
  domain: s.string("The domain extracted from the requested URL."),
  tags: s.array("Additional tag-level extraction results when returned by the API.", rawObjectSchema),
});

const scrapeUrlOutputSchema = s.looseObject(
  "The normalized output payload returned by the OpenGraph.io Scrape endpoint.",
  {
    htmlContent: s.string("The raw HTML content returned for the page."),
    requestInfo: requestInfoSchema,
    retryInfo: rawObjectSchema,
  },
);

const screenshotDimensionsSchema = s.object("The dimensions of the captured screenshot.", {
  width: s.integer("The screenshot width in pixels."),
  height: s.integer("The screenshot height in pixels."),
});

const screenshotOutputSchema = s.looseObject(
  "The normalized output payload returned by the OpenGraph.io Screenshot endpoint.",
  {
    screenshotUrl: s.url("The URL of the generated screenshot image."),
    dimensions: screenshotDimensionsSchema,
    requestInfo: requestInfoSchema,
  },
);

const siteInputFields = {
  site: s.url("The site URL to inspect."),
  cacheOk: s.boolean("Whether cached results may be returned when available."),
  fullRender: s.boolean("Whether the page should be rendered in a browser before extraction."),
  useProxy: s.boolean("Whether a proxy should be used for the request."),
  usePremium: s.boolean("Whether a residential proxy should be used when available."),
  useSuperior: s.boolean("Whether a mobile-grade proxy should be used when available."),
  useAi: s.boolean("Whether AI-enhanced metadata extraction should be enabled."),
  maxCacheAge: s.nonNegativeInteger("The maximum accepted cache age in seconds."),
  acceptLang: s.nonEmptyString("The Accept-Language header value sent to the target site."),
  autoProxy: s.boolean("Whether OpenGraph.io may automatically decide whether to use a proxy."),
  autoRender: s.boolean("Whether OpenGraph.io may automatically decide whether full rendering is needed."),
  retry: s.boolean("Whether OpenGraph.io should retry with fallback transport strategies."),
  maxRetries: s.nonNegativeInteger("The maximum number of retry attempts."),
  retryEscalate: s.boolean("Whether retries may escalate to more expensive fallback strategies."),
  proxyCountry: s.nonEmptyString("The ISO 3166-1 alpha-2 country code to use for proxy egress."),
};

const siteInputOptionalFields = [
  "cacheOk",
  "fullRender",
  "useProxy",
  "usePremium",
  "useSuperior",
  "useAi",
  "maxCacheAge",
  "acceptLang",
  "autoProxy",
  "autoRender",
  "retry",
  "maxRetries",
  "retryEscalate",
  "proxyCountry",
];

const scrapeUrlInputSchema = s.object(
  "The input payload for scraping a URL with OpenGraph.io.",
  {
    url: s.url("The page URL to scrape for raw HTML."),
    cacheOk: s.boolean("Whether cached results may be returned when available."),
    fullRender: s.boolean("Whether the page should be rendered in a browser before scraping."),
    useProxy: s.boolean("Whether a proxy should be used for the request."),
    usePremium: s.boolean("Whether a residential proxy should be used when available."),
    useSuperior: s.boolean("Whether a mobile-grade proxy should be used when available."),
    acceptLang: s.nonEmptyString("The Accept-Language header value sent to the target site."),
    autoProxy: s.boolean("Whether OpenGraph.io may automatically decide whether to use a proxy."),
    autoRender: s.boolean("Whether OpenGraph.io may automatically decide whether full rendering is needed."),
    retry: s.boolean("Whether OpenGraph.io should retry with fallback transport strategies."),
  },
  {
    optional: [
      "cacheOk",
      "fullRender",
      "useProxy",
      "usePremium",
      "useSuperior",
      "acceptLang",
      "autoProxy",
      "autoRender",
      "retry",
    ],
  },
);

const screenshotInputSchema = s.object(
  "The input payload for capturing a screenshot with OpenGraph.io.",
  {
    url: s.url("The page URL to capture as an image."),
    format: s.stringEnum("The output image format.", ["jpeg", "png", "webp"]),
    quality: s.integer("The image quality from 10 to 80.", { minimum: 10, maximum: 80 }),
    cacheOk: s.boolean("Whether cached screenshots may be returned when available."),
    selector: s.nonEmptyString("An optional CSS selector that limits the capture to a specific element."),
    darkMode: s.boolean("Whether the page should be rendered with a dark color-scheme preference."),
    fullPage: s.boolean("Whether the entire scrollable page should be captured."),
    useProxy: s.boolean("Whether a proxy should be used for the request."),
    dimensions: s.stringEnum("A viewport size preset.", ["xs", "sm", "md", "lg"]),
    captureDelay: s.integer("The delay in milliseconds before taking the screenshot.", {
      minimum: 0,
      maximum: 10000,
    }),
    excludeSelectors: s.nonEmptyString("Comma-separated CSS selectors for elements that should be hidden."),
    navigationTimeout: s.integer("The navigation timeout in milliseconds.", {
      minimum: 1000,
      maximum: 60000,
    }),
    blockCookieBanner: s.boolean("Whether known cookie consent banners should be blocked."),
  },
  {
    optional: [
      "format",
      "quality",
      "cacheOk",
      "selector",
      "darkMode",
      "fullPage",
      "useProxy",
      "dimensions",
      "captureDelay",
      "excludeSelectors",
      "navigationTimeout",
      "blockCookieBanner",
    ],
  },
);

export const opengraphIoActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "extract_site",
    operationType: "read",
    description:
      "Extract Open Graph, Twitter Card, oEmbed, and inferred metadata for a site through the OpenGraph.io Site endpoint.",
    inputSchema: s.object("The input payload for extracting OpenGraph.io site metadata.", siteInputFields, {
      optional: siteInputOptionalFields,
    }),
    outputSchema: siteOutputSchema,
  }),
  defineProviderAction(service, {
    name: "scrape_site",
    operationType: "read",
    description:
      "Retrieve a site's metadata through the OpenGraph.io Site endpoint with cache, proxy, render, and retry controls.",
    inputSchema: s.object(
      "The input payload for retrieving OpenGraph.io site metadata.",
      {
        ...siteInputFields,
        scrape: s.boolean(
          "A reserved compatibility flag. The current official Site endpoint does not expose a separate scrape mode, so this value is ignored.",
        ),
      },
      {
        optional: [...siteInputOptionalFields, "scrape"],
      },
    ),
    outputSchema: siteOutputSchema,
  }),
  defineProviderAction(service, {
    name: "scrape_url",
    operationType: "read",
    description:
      "Fetch the raw HTML for a page through the OpenGraph.io Scrape endpoint with optional render and proxy controls.",
    inputSchema: scrapeUrlInputSchema,
    outputSchema: scrapeUrlOutputSchema,
  }),
  defineProviderAction(service, {
    name: "capture_screenshot",
    operationType: "read",
    description:
      "Capture a webpage screenshot through the OpenGraph.io Screenshot endpoint with configurable viewport, delay, and element selection.",
    inputSchema: screenshotInputSchema,
    outputSchema: screenshotOutputSchema,
  }),
];
