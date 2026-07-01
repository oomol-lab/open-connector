import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "apiflash";

const quotaSchema = s.object(
  "Quota information returned by ApiFlash.",
  {
    limit: s.integer("The maximum number of screenshots allowed in the billing period."),
    remaining: s.integer("The number of screenshots still available in the current billing period."),
    reset: s.integer("The UTC epoch second when the screenshot quota resets."),
  },
  { optional: ["limit", "remaining", "reset"] },
);

const captureInputSchema = s.object(
  "The input payload for capturing a website screenshot with ApiFlash.",
  {
    url: s.url("The complete website URL to capture, including the protocol."),
    fresh: s.boolean("Whether ApiFlash should bypass the cache and capture a fresh screenshot."),
    ttl: s.integer({
      minimum: 0,
      maximum: 2_592_000,
      description: "The screenshot cache lifetime in seconds, from 0 to 2592000.",
    }),
    full_page: s.boolean("Whether to capture the entire scrollable page instead of only the viewport."),
    scroll_page: s.boolean("Whether ApiFlash should scroll the page before capture to trigger lazy-loaded content."),
    width: s.positiveInteger("The viewport width in pixels."),
    height: s.positiveInteger("The viewport height in pixels. This is ignored when `full_page` is true."),
    delay: s.integer({
      minimum: 0,
      maximum: 10,
      description: "The delay in seconds to wait after load before capturing the screenshot.",
    }),
    wait_for: s.nonEmptyString("A CSS selector that must match an element before the screenshot is captured."),
    wait_until: s.stringEnum("The page load condition ApiFlash should wait for before capturing.", [
      "dom_loaded",
      "page_loaded",
      "network_idle",
    ]),
    element: s.nonEmptyString("A CSS selector for capturing only the first matching element."),
    element_overlap: s.boolean("Whether to keep overlapping elements when capturing a targeted element."),
    format: s.stringEnum("The screenshot image format.", ["jpeg", "png", "webp"]),
    quality: s.integer({
      minimum: 0,
      maximum: 100,
      description: "The screenshot quality between 0 and 100 for jpeg or webp output.",
    }),
    transparent: s.boolean("Whether to capture the screenshot with transparency enabled when using png output."),
    extract_html: s.boolean("Whether ApiFlash should also return a URL for the extracted HTML."),
    extract_text: s.boolean("Whether ApiFlash should also return a URL for the extracted plain text."),
    accept_language: s.nonEmptyString("The Accept-Language header value used when rendering the target page."),
    user_agent: s.nonEmptyString("The User-Agent string used when rendering the target page."),
    headers: s.nonEmptyString("A semicolon-separated header list such as `Header1=value1;Header2=value2`."),
    cookies: s.nonEmptyString("A semicolon-separated cookie list such as `name1=value1;name2=value2`."),
    fail_on_status: s.nonEmptyString("A comma-separated list or range of HTTP status codes that should fail the capture."),
    no_ads: s.boolean("Whether ApiFlash should block popular ad networks during capture."),
    no_tracking: s.boolean("Whether ApiFlash should block common tracking scripts during capture."),
    no_cookie_banners: s.boolean("Whether ApiFlash should hide cookie banners and popups during capture."),
  },
  {
    required: ["url"],
  },
);

const captureOutputSchema = s.object(
  "The output payload for capturing a website screenshot.",
  {
    url: s.url("The URL of the captured screenshot image."),
    extracted_html: s.url("The URL of the extracted HTML file when `extract_html` is enabled."),
    extracted_text: s.url("The URL of the extracted text file when `extract_text` is enabled."),
    quota: quotaSchema,
  },
  { required: ["url"] },
);

const quotaOutputSchema = s.object("The current ApiFlash quota snapshot.", {
  limit: s.integer("The maximum number of screenshots allowed in the billing period."),
  remaining: s.integer("The number of screenshots still available in the current billing period."),
  reset: s.integer("The UTC epoch second when the screenshot quota resets."),
});

const metadataOutputSchema = s.object(
  "Metadata read from a previously generated ApiFlash screenshot URL.",
  {
    url: s.url("The screenshot URL that was inspected."),
    content_type: s.string("The Content-Type header returned by the screenshot URL."),
    content_length: s.integer("The Content-Length header returned by the screenshot URL, in bytes."),
    etag: s.string("The ETag header returned by the screenshot URL."),
    last_modified: s.string("The Last-Modified header returned by the screenshot URL."),
    cache_control: s.string("The Cache-Control header returned by the screenshot URL."),
  },
  { required: ["url"] },
);

export const apiflashActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "capture_website_screenshot",
    description: "Capture a website screenshot with ApiFlash and return the generated screenshot URL.",
    inputSchema: captureInputSchema,
    outputSchema: captureOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_quota_information",
    description: "Retrieve the current ApiFlash screenshot quota and reset time.",
    inputSchema: s.object("The input payload for retrieving the current ApiFlash quota.", {}),
    outputSchema: quotaOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_screenshot_metadata",
    description: "Read HTTP metadata for a screenshot URL previously returned by ApiFlash.",
    inputSchema: s.object(
      "The input payload for reading screenshot metadata.",
      {
        url: s.url("The screenshot URL returned by `capture_website_screenshot` for metadata lookup."),
      },
      { required: ["url"] },
    ),
    outputSchema: metadataOutputSchema,
  }),
];

export type ApiflashActionName = (typeof apiflashActions)[number]["name"];
