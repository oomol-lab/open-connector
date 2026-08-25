import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "htmlcsstoimage";

const renderOptionShape: Record<string, JsonSchema> = {
  css: s.string("CSS to render with HTML snippets or inject into URL screenshots."),
  google_fonts: s.string("Google Fonts to load, such as Roboto or multiple font families separated by a pipe."),
  selector: s.nonEmptyString("A CSS selector for an element to crop the generated image to."),
  ms_delay: s.integer("The fixed delay in milliseconds before generating the image.", { minimum: 0 }),
  max_wait_ms: s.integer("The maximum time in milliseconds to wait before taking the screenshot.", {
    minimum: 500,
    maximum: 10000,
  }),
  device_scale: s.number("The Chrome device scale factor. Higher values increase resolution and file size.", {
    minimum: 0.1,
    maximum: 3,
  }),
  render_when_ready: s.boolean("Whether page JavaScript must call ScreenshotReady() before the image is generated."),
  full_screen: s.boolean("Whether to generate an image of the entire page height."),
  block_consent_banners: s.boolean("Whether to automatically hide common cookie consent banners and popups."),
  viewport_width: s.positiveInteger(
    "The Chrome viewport width in pixels. Set with viewport_height to disable automatic cropping.",
  ),
  viewport_height: s.positiveInteger(
    "The Chrome viewport height in pixels. Set with viewport_width to disable automatic cropping.",
  ),
  viewport_mobile: s.boolean("Whether Chrome should emulate a mobile viewport."),
  viewport_landscape: s.boolean("Whether Chrome should emulate a landscape mobile viewport."),
  viewport_touch: s.boolean("Whether Chrome should emulate touch input support."),
  color_scheme: s.stringEnum(
    "The Chrome color scheme to use while rendering websites that support prefers-color-scheme.",
    ["light", "dark"],
  ),
  timezone: s.nonEmptyString("The IANA timezone identifier used while rendering the image."),
  disable_twemoji: s.boolean("Whether to use native emoji fonts instead of Twemoji."),
  proxy_id: s.nonEmptyString("The configured HTML/CSS to Image dashboard proxy ID for outbound requests."),
};

const renderOptionOptionalFields = [
  "css",
  "google_fonts",
  "selector",
  "ms_delay",
  "max_wait_ms",
  "device_scale",
  "render_when_ready",
  "full_screen",
  "block_consent_banners",
  "viewport_width",
  "viewport_height",
  "viewport_mobile",
  "viewport_landscape",
  "viewport_touch",
  "color_scheme",
  "timezone",
  "disable_twemoji",
  "proxy_id",
];

const createdImageSchema = s.object("One image created by HTML/CSS to Image.", {
  id: s.string("The generated image identifier."),
  url: s.url("The generated image URL."),
});

const createImageInputSchema = s.object(
  "Input parameters for creating one image with HTML/CSS to Image. Provide exactly one of html or url.",
  {
    html: s.nonEmptyString("The HTML snippet or complete webpage markup to render."),
    url: s.url("The public webpage URL to screenshot. This overrides html upstream."),
    ...renderOptionShape,
  },
  { optional: ["html", "url", ...renderOptionOptionalFields] },
);

const batchVariationSchema = s.object(
  "One image variation for batch creation. Provide exactly one of html or url.",
  {
    html: s.nonEmptyString("The HTML snippet or complete webpage markup to render."),
    url: s.url("The public webpage URL to screenshot."),
    ...renderOptionShape,
  },
  { optional: ["html", "url", ...renderOptionOptionalFields] },
);

const defaultOptionsSchema = s.object(
  "Default image creation options applied to every batch variation.",
  {
    ...renderOptionShape,
  },
  { optional: renderOptionOptionalFields },
);

const usageBreakdownSchema = s.record(
  "Usage counts keyed by ISO timestamp for one rollup interval.",
  s.integer("The number of images created during this interval."),
);

const billingPeriodUsageSchema = s.object("One billing-period usage summary returned by HTML/CSS to Image.", {
  total_images: s.integer("The number of images created in this billing period."),
  start: s.string("The billing period start timestamp."),
  end: s.string("The billing period end timestamp."),
});

export const htmlcsstoimageActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "create_image",
    description: "Create an image from either raw HTML/CSS or a public webpage URL with HTML/CSS to Image.",
    inputSchema: createImageInputSchema,
    outputSchema: s.actionOutput(
      {
        id: s.string("The generated image identifier."),
        url: s.url("The generated image URL."),
      },
      "The generated image result.",
    ),
  }),
  defineProviderAction(service, {
    name: "create_batch_images",
    description:
      "Create up to 25 HTML/CSS to Image images in one batch using shared default options and per-image variations.",
    inputSchema: s.object(
      "Input parameters for creating a batch of images.",
      {
        default_options: defaultOptionsSchema,
        variations: s.array("The image variations to create, up to 25.", batchVariationSchema, {
          minItems: 1,
          maxItems: 25,
        }),
      },
      { optional: ["default_options"] },
    ),
    outputSchema: s.actionOutput(
      {
        images: s.array("The images created by the batch request.", createdImageSchema),
      },
      "The batch image creation result.",
    ),
  }),
  defineProviderAction(service, {
    name: "delete_image",
    description: "Delete one generated image from HTML/CSS to Image and clear its CDN cache.",
    inputSchema: s.actionInput(
      {
        image_id: s.nonEmptyString("The image identifier to delete."),
      },
      ["image_id"],
      "Input parameters for deleting one image.",
    ),
    outputSchema: s.actionOutput(
      {
        accepted: s.boolean("Whether HTML/CSS to Image accepted the delete request."),
        image_id: s.string("The image identifier that was deleted."),
      },
      "The delete image result.",
    ),
  }),
  defineProviderAction(service, {
    name: "delete_batch_images",
    description: "Delete multiple generated images from HTML/CSS to Image in one request.",
    inputSchema: s.actionInput(
      {
        ids: s.array("The image identifiers to delete.", s.nonEmptyString("One image identifier."), {
          minItems: 1,
          maxItems: 25,
        }),
      },
      ["ids"],
      "Input parameters for deleting multiple images.",
    ),
    outputSchema: s.actionOutput(
      {
        accepted: s.boolean("Whether HTML/CSS to Image accepted the batch delete request."),
        ids: s.array("The image identifiers submitted for deletion.", s.string("One image ID.")),
      },
      "The batch delete result.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_usage",
    description: "Retrieve HTML/CSS to Image usage counts by hour, day, month, and billing period.",
    inputSchema: s.actionInput({}, [], "Input parameters for retrieving account usage."),
    outputSchema: s.actionOutput(
      {
        data: s.object("Usage counts grouped by rollup interval.", {
          hour: usageBreakdownSchema,
          day: usageBreakdownSchema,
          month: usageBreakdownSchema,
        }),
        per_billing_period: s.array("Usage summaries for recent billing periods.", billingPeriodUsageSchema),
      },
      "The account usage returned by HTML/CSS to Image.",
    ),
  }),
];
