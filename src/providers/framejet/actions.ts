import type { ProviderActionDefinition } from "../../core/provider-definition.ts";
import type { JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "framejet";

const captureOptionSchemas: Record<string, JsonSchema> = {
  url: s.url("The public http or https page to capture."),
  format: s.stringEnum("The image format. Defaults to png.", ["png", "jpeg"]),
  full_page: s.boolean("Whether to capture the whole scrollable page instead of the viewport."),
  width: s.integer("The viewport width in pixels. Defaults to 1280.", { minimum: 320, maximum: 3840 }),
  height: s.integer("The viewport height in pixels. Defaults to 800.", { minimum: 200, maximum: 4320 }),
  dpr: s.integer("The device pixel ratio. Defaults to 1.", { minimum: 1, maximum: 3 }),
  clean: s.boolean(
    "Whether to remove cookie banners, consent walls and chat widgets before the capture. Defaults to true.",
  ),
  delay: s.integer("An extra wait in milliseconds after the page loads.", { minimum: 0, maximum: 10000 }),
  actions: s.nonEmptyString(
    "Up to 10 steps to run before the capture, separated by semicolons: click:<css>, type:<css>=<text>, waitfor:<css>, wait:<ms> or scroll:<px>. Example: click:#accept;waitfor:.pricing",
  ),
};

const optionalCaptureOptions = Object.keys(captureOptionSchemas).filter((key) => key !== "url");

const screenshotInputSchema = s.object(
  "The input payload for capturing a web page with Framejet.",
  {
    ...captureOptionSchemas,
    goal: s.nonEmptyString(
      "A plain-language description of the page state to reach before the capture. Example: the pricing table with yearly billing selected",
      { maxLength: 300 },
    ),
    values: s.stringArray("Exact strings goal mode may type into the page.", { maxItems: 10 }),
    cache: s.boolean(
      "Whether an identical earlier capture may be returned without spending a screenshot. Defaults to true.",
    ),
  },
  { optional: [...optionalCaptureOptions, "goal", "values", "cache"] },
);

const signedUrlInputSchema = s.object(
  "The input payload for building a signed Framejet capture URL.",
  {
    ...captureOptionSchemas,
    expires_in: s.integer("Seconds until the URL stops working. Omit it for a URL that never expires.", {
      minimum: 1,
    }),
  },
  { optional: [...optionalCaptureOptions, "expires_in"] },
);

const screenshotOutputSchema = s.actionOutput(
  {
    file: s.object("The captured image stored in local transit storage.", {
      fileId: s.nonEmptyString("The local transit file identifier."),
      downloadUrl: s.url("The local transit URL for downloading the image."),
      sizeBytes: s.integer("The image size in bytes."),
      name: s.nonEmptyString("The image file name."),
      mimeType: s.nonEmptyString("The image MIME type."),
    }),
    cache: s.stringEnum("Whether Framejet served an earlier identical capture.", ["HIT", "MISS"]),
    remaining: s.nullableInteger("Screenshots left in the current month, or null when Framejet does not report it."),
  },
  "The output payload for a Framejet capture.",
);

const signedUrlOutputSchema = s.actionOutput(
  {
    signed_url: s.url(
      "A capture URL that works in an img src, a CMS or a spreadsheet without exposing the API key. The first load spends one screenshot; later loads are cached.",
    ),
  },
  "The output payload for a signed Framejet capture URL.",
);

export const framejetActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "take_screenshot",
    operationType: "read",
    description:
      "Capture a public web page as a PNG or JPEG with cookie banners and chat widgets removed, optionally after running page steps or reaching a state described in plain language.",
    inputSchema: screenshotInputSchema,
    outputSchema: screenshotOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_signed_url",
    operationType: "read",
    description:
      "Build a signed capture URL that can be embedded where the API key must stay secret. Nothing is captured until the URL is loaded.",
    inputSchema: signedUrlInputSchema,
    outputSchema: signedUrlOutputSchema,
  }),
];
