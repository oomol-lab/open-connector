import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "screenshotone";

const positiveIntegerSchema = (description: string, maximum?: number) =>
  s.integer(description, maximum === undefined ? { minimum: 1 } : { minimum: 1, maximum });
const nonNegativeIntegerSchema = (description: string, maximum?: number) =>
  s.integer(description, maximum === undefined ? { minimum: 0 } : { minimum: 0, maximum });
const looseStringRecordSchema = s.record(
  "A response body object returned by ScreenshotOne.",
  s.string("A body value."),
);

const downloadableFileSchema = s.looseObject("A downloadable file uploaded to connector transit storage.", {
  name: s.nonEmptyString("The generated filename."),
  mimetype: s.nonEmptyString("The MIME type of the generated file."),
  fileId: s.nonEmptyString("The local transit file identifier."),
  downloadUrl: s.url("The local transit download URL."),
  sizeBytes: s.integer("The generated file size in bytes."),
  mimeType: s.nonEmptyString("The MIME type of the generated file."),
});

const screenshotBinaryOutputSchema = s.object(
  "The output payload for taking a ScreenshotOne screenshot.",
  {
    file: downloadableFileSchema,
    content_type: s.nonEmptyString("The response content type returned by ScreenshotOne."),
    cache_url: s.url("The cached screenshot URL returned when ScreenshotOne responds with JSON."),
  },
  { optional: ["file", "content_type", "cache_url"] },
);

const animationOutputSchema = s.object("The output payload for taking an animated ScreenshotOne capture.", {
  file: downloadableFileSchema,
  content_type: s.nonEmptyString("The response content type returned by ScreenshotOne."),
});

const bulkExecutionResponseSchema = s.object(
  "The execution summary returned by ScreenshotOne bulk mode.",
  {
    is_successful: s.boolean("Whether ScreenshotOne executed the request successfully."),
    status: s.integer("The HTTP status code of the executed request."),
    statusText: s.string("The HTTP status text of the executed request."),
    body: looseStringRecordSchema,
  },
  { optional: ["body"] },
);

const bulkResponseItemSchema = s.object(
  "One ScreenshotOne bulk response entry.",
  {
    url: s.url("The download URL for the generated screenshot."),
    response: bulkExecutionResponseSchema,
  },
  { optional: ["response"] },
);

const deviceViewportSchema = s.object("The viewport configuration for a ScreenshotOne device preset.", {
  width: s.integer("The viewport width in pixels."),
  height: s.integer("The viewport height in pixels."),
  deviceScaleFactor: s.number("The device pixel ratio."),
  isMobile: s.boolean("Whether the device is mobile."),
  hasTouch: s.boolean("Whether the device supports touch."),
  isLandscape: s.boolean("Whether the device is in landscape orientation."),
});

const deviceSchema = s.object("A ScreenshotOne supported device preset.", {
  id: s.nonEmptyString("The device preset identifier."),
  name: s.nonEmptyString("The human-readable device preset name."),
  userAgent: s.nonEmptyString("The user agent string used by the device preset."),
  viewport: deviceViewportSchema,
});

const usageSchema = s.object("The usage snapshot returned by ScreenshotOne.", {
  total: s.integer("The total requests allowed in the current billing period."),
  available: s.integer("The remaining requests available in the current billing period."),
  used: s.integer("The number of requests already used in the current billing period."),
  concurrency: s.object("The current concurrency allowance.", {
    limit: s.integer("The total concurrent requests allowed."),
    remaining: s.integer("The remaining concurrent requests allowed."),
    reset: s.integer("The reset timestamp in nanoseconds."),
  }),
});

const screenshotInputSchema: JsonSchema = {
  ...s.object(
    "The input payload for taking a ScreenshotOne screenshot.",
    {
      url: s.url("The website URL to render. Exactly one of url, html, or markdown is required."),
      html: s.nonEmptyString("The raw HTML content to render. Exactly one of url, html, or markdown is required."),
      markdown: s.nonEmptyString("The Markdown content to render. Exactly one of url, html, or markdown is required."),
      cache: s.boolean("Whether ScreenshotOne should return or reuse a cached screenshot URL."),
      delay: nonNegativeIntegerSchema("The delay in seconds before rendering the screenshot.", 30),
      format: s.stringEnum("The output format for the screenshot.", ["png", "jpeg", "webp", "pdf", "html"]),
      response_type: s.stringEnum("The response type requested from ScreenshotOne.", ["by_format", "json", "empty"]),
      block_ads: s.boolean("Whether to block ads while rendering the screenshot."),
      block_chats: s.boolean("Whether to block chat widgets while rendering the screenshot."),
      block_cookie_banners: s.boolean("Whether to block cookie banners while rendering the screenshot."),
      dark_mode: s.boolean("Whether to enable dark mode during rendering."),
      viewport_width: positiveIntegerSchema("The viewport width in pixels."),
      viewport_height: positiveIntegerSchema("The viewport height in pixels."),
      device_scale_factor: s.number("The viewport device scale factor.", { minimum: 1, maximum: 5 }),
    },
    {
      optional: [
        "url",
        "html",
        "markdown",
        "cache",
        "delay",
        "format",
        "response_type",
        "block_ads",
        "block_chats",
        "block_cookie_banners",
        "dark_mode",
        "viewport_width",
        "viewport_height",
        "device_scale_factor",
      ],
    },
  ),
  oneOf: [{ required: ["url"] }, { required: ["html"] }, { required: ["markdown"] }],
};

const animatedScreenshotInputSchema = s.object(
  "The input payload for taking an animated ScreenshotOne capture.",
  {
    url: s.url("The website URL to capture as an animation."),
    delay: nonNegativeIntegerSchema("The delay in milliseconds before recording begins."),
    width: positiveIntegerSchema("The output width in pixels."),
    height: positiveIntegerSchema("The output height in pixels."),
    format: s.stringEnum("The animation output format.", ["mp4", "mov", "avi", "webm", "gif"]),
    duration: s.integer("The animation duration in seconds.", { minimum: 1, maximum: 30 }),
    scenario: s.stringEnum("The animation scenario.", ["default", "scroll"]),
    block_ads: s.boolean("Whether to block ads during capture."),
    full_page: s.boolean("Whether to capture the full scrollable page."),
    scroll_by: nonNegativeIntegerSchema("The pixels to scroll per step."),
    clip_x: nonNegativeIntegerSchema("The X coordinate for GIF clipping."),
    clip_y: nonNegativeIntegerSchema("The Y coordinate for GIF clipping."),
    clip_width: positiveIntegerSchema("The GIF clip width in pixels."),
    clip_height: positiveIntegerSchema("The GIF clip height in pixels."),
    scroll_back: s.boolean("Whether to scroll back to the top after scrolling."),
    aspect_ratio: s.nonEmptyString("The output aspect ratio string."),
    scroll_delay: nonNegativeIntegerSchema("The delay between scroll steps in milliseconds."),
    scroll_easing: s.stringEnum("The easing to use for scrolling animations.", [
      "linear",
      "ease_in_quad",
      "ease_out_quad",
      "ease_in_out_quad",
      "ease_in_cubic",
      "ease_out_cubic",
      "ease_in_out_cubic",
      "ease_in_quart",
      "ease_out_quart",
      "ease_in_out_quart",
      "ease_in_quint",
      "ease_out_quint",
      "ease_in_out_quint",
    ]),
    viewport_width: positiveIntegerSchema("The viewport width in pixels."),
    omit_background: s.boolean("Whether to omit the background. Only supported for MOV output."),
    scroll_complete: s.boolean("Whether to stop recording when scrolling completes."),
    scroll_duration: nonNegativeIntegerSchema("The duration of each scroll in milliseconds."),
    viewport_height: positiveIntegerSchema("The viewport height in pixels."),
    scroll_start_delay: nonNegativeIntegerSchema("The delay before scrolling begins in milliseconds."),
    device_scale_factor: s.number("The device scale factor.", { minimum: 1 }),
    scroll_to_end_after: nonNegativeIntegerSchema("Scroll to the end after the specified duration in milliseconds."),
    scroll_try_navigate: s.boolean("Whether to navigate while scrolling and record the new page."),
    block_cookie_banners: s.boolean("Whether to block cookie banners during capture."),
    scroll_till_selector: s.nonEmptyString("Scroll until the CSS selector becomes visible."),
    scroll_back_algorithm: s.stringEnum("The algorithm used when scrolling back.", ["once", "repeat"]),
    scroll_navigate_after: nonNegativeIntegerSchema("Navigate after the specified duration in milliseconds."),
    scroll_navigate_to_url: s.url("The URL to navigate to while recording the animation."),
    scroll_start_immediately: s.boolean("Whether scrolling should start immediately."),
    scroll_back_after_duration: nonNegativeIntegerSchema("Scroll back after the specified duration in milliseconds."),
    scroll_navigate_link_hints: s.stringArray("The link text hints used when selecting a navigation target."),
    scroll_stop_after_duration: nonNegativeIntegerSchema(
      "Stop scrolling after the specified duration in milliseconds.",
    ),
    scroll_till_selector_adjust_top: nonNegativeIntegerSchema("Adjust the top selector position in pixels."),
  },
  {
    optional: [
      "delay",
      "width",
      "height",
      "format",
      "duration",
      "scenario",
      "block_ads",
      "full_page",
      "scroll_by",
      "clip_x",
      "clip_y",
      "clip_width",
      "clip_height",
      "scroll_back",
      "aspect_ratio",
      "scroll_delay",
      "scroll_easing",
      "viewport_width",
      "omit_background",
      "scroll_complete",
      "scroll_duration",
      "viewport_height",
      "scroll_start_delay",
      "device_scale_factor",
      "scroll_to_end_after",
      "scroll_try_navigate",
      "block_cookie_banners",
      "scroll_till_selector",
      "scroll_back_algorithm",
      "scroll_navigate_after",
      "scroll_navigate_to_url",
      "scroll_start_immediately",
      "scroll_back_after_duration",
      "scroll_navigate_link_hints",
      "scroll_stop_after_duration",
      "scroll_till_selector_adjust_top",
    ],
  },
);

const bulkScreenshotOptionsSchema = s.looseObject("The default ScreenshotOne bulk screenshot options.");
const bulkScreenshotRequestSchema = s.looseObject("One ScreenshotOne bulk screenshot request.");
const bulkScreenshotInputSchema = s.object(
  "The input payload for taking multiple ScreenshotOne screenshots.",
  {
    execute: s.boolean("Whether ScreenshotOne should execute all requests immediately."),
    options: bulkScreenshotOptionsSchema,
    optimize: s.boolean("Whether to optimize same-site bulk execution. Requires execute=true."),
    requests: s.array("The list of individual bulk screenshot requests.", bulkScreenshotRequestSchema, {
      minItems: 1,
      maxItems: 20,
    }),
  },
  { optional: ["execute", "options", "optimize"] },
);

export const screenshotoneActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "take_screenshot",
    description: "Take a ScreenshotOne screenshot from a website URL, HTML, or Markdown source.",
    inputSchema: screenshotInputSchema,
    outputSchema: screenshotBinaryOutputSchema,
  }),
  defineProviderAction(service, {
    name: "take_animated_screenshot",
    description: "Take an animated ScreenshotOne capture as a video or GIF file.",
    inputSchema: animatedScreenshotInputSchema,
    outputSchema: animationOutputSchema,
  }),
  defineProviderAction(service, {
    name: "take_bulk_screenshots",
    description: "Submit multiple ScreenshotOne screenshot requests in a single bulk call.",
    inputSchema: bulkScreenshotInputSchema,
    outputSchema: s.object("The output payload for taking ScreenshotOne bulk screenshots.", {
      responses: s.array("The list of ScreenshotOne bulk response items.", bulkResponseItemSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_devices",
    description: "List the ScreenshotOne device presets available for viewport emulation.",
    inputSchema: s.object("The input payload for listing ScreenshotOne devices.", {}),
    outputSchema: s.object("The output payload for listing ScreenshotOne devices.", {
      devices: s.array("The available ScreenshotOne device presets.", deviceSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_usage",
    description: "Retrieve the current ScreenshotOne plan usage and concurrency information.",
    inputSchema: s.object("The input payload for reading ScreenshotOne usage.", {}),
    outputSchema: usageSchema,
  }),
];
