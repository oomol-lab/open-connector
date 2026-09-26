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
    "Up to 10 steps, with at most 15 seconds of waiting in total, to run before the capture, separated by semicolons: click:<css>, type:<css>=<text>, waitfor:<css>, wait:<ms> or scroll:<px>. Example: click:#accept;waitfor:.pricing",
    { maxLength: 1000 },
  ),
};

const optionalCaptureOptions = Object.keys(captureOptionSchemas).filter((key) => key !== "url");

const screenshotInputSchema = s.object(
  "The input payload for capturing a web page with Framejet.",
  {
    ...captureOptionSchemas,
    goal: s.nonEmptyString(
      "A plain-language description of the page state to reach before the capture, ending with when to stop. Any text typed into the page must come from values. Example: switch the pricing table to yearly billing and stop when the yearly prices are shown",
      { maxLength: 300 },
    ),
    values: s.array(
      "Exact strings goal mode may type into the page. Framejet never invents text, so a goal that fills a field fails with values_required unless a fitting value is listed. Joined with | separators, the list may total at most 1000 characters.",
      s.nonEmptyString(
        "One exact string of at most 200 characters. It cannot contain |, which Framejet uses to separate values.",
        { pattern: "^[^|]+$", maxLength: 200 },
      ),
      { maxItems: 10 },
    ),
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
    file: s.requiredObject("The captured image stored in local transit storage.", {
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
      "A capture URL that works in an img src, a CMS or a spreadsheet without exposing the API key. The first load spends one screenshot. Framejet serves later loads from its cache for seven days, then captures again, so a URL that keeps being viewed costs at most about one screenshot a week.",
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
