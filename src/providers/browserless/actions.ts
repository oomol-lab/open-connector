import type { ProviderActionDefinition } from "../../core/provider-definition.ts";
import type { JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "browserless";

const nonEmptyString = (description: string): JsonSchema => s.nonEmptyString(description);
const uriString = (description: string): JsonSchema => s.string({ description, format: "uri", minLength: 1 });
const positiveInteger = (description: string): JsonSchema => s.integer({ description, minimum: 1 });
const nonNegativeInteger = (description: string): JsonSchema => s.integer({ description, minimum: 0 });

const scriptOrStyleTagSchema: JsonSchema = {
  ...s.object(
    "One Browserless script or style tag injection entry.",
    {
      url: uriString("The absolute URL of the external script or stylesheet to inject."),
      content: nonEmptyString("The inline script or stylesheet content to inject."),
    },
    { optional: ["url", "content"] },
  ),
  oneOf: [{ required: ["url"] }, { required: ["content"] }],
};

const gotoOptionsSchema = s.object(
  "Navigation options forwarded to Browserless gotoOptions.",
  {
    timeout: nonNegativeInteger("The maximum navigation time in milliseconds."),
    waitUntil: s.stringEnum("When Browserless should consider navigation successful.", [
      "load",
      "domcontentloaded",
      "networkidle0",
      "networkidle2",
    ]),
  },
  { optional: ["timeout", "waitUntil"] },
);

const waitForEventSchema = s.object(
  "A Browserless waitForEvent configuration.",
  {
    event: nonEmptyString("The page event name Browserless should wait for."),
    timeout: nonNegativeInteger("The maximum time in milliseconds to wait for the event."),
  },
  { optional: ["timeout"] },
);

const waitForSelectorSchema = s.object(
  "A Browserless waitForSelector configuration.",
  {
    selector: nonEmptyString("The CSS selector Browserless should wait for."),
    timeout: nonNegativeInteger("The maximum time in milliseconds to wait for the selector."),
    visible: s.boolean("Whether the selector must become visible before continuing."),
    hidden: s.boolean("Whether the selector must become hidden before continuing."),
  },
  { optional: ["timeout", "visible", "hidden"] },
);

const sharedRequestShape = {
  bestAttempt: s.boolean("Whether Browserless should continue when asynchronous wait steps fail or time out."),
  gotoOptions: gotoOptionsSchema,
  waitForEvent: waitForEventSchema,
  waitForTimeout: nonNegativeInteger("The fixed time in milliseconds Browserless should wait before returning."),
  waitForSelector: waitForSelectorSchema,
  rejectResourceTypes: s.array(
    "The browser resource types Browserless should block during navigation.",
    nonEmptyString("One Browserless resource type to block."),
    { minItems: 1 },
  ),
  rejectRequestPattern: s.array(
    "The request URL patterns Browserless should block during navigation.",
    nonEmptyString("One request URL pattern to block."),
    { minItems: 1 },
  ),
  addScriptTag: s.array(
    "The scripts Browserless should inject before producing the final output.",
    scriptOrStyleTagSchema,
    {
      minItems: 1,
    },
  ),
  addStyleTag: s.array(
    "The stylesheets Browserless should inject before producing the final output.",
    scriptOrStyleTagSchema,
    { minItems: 1 },
  ),
};

const sharedRequestOptional = [
  "bestAttempt",
  "gotoOptions",
  "waitForEvent",
  "waitForTimeout",
  "waitForSelector",
  "rejectResourceTypes",
  "rejectRequestPattern",
  "addScriptTag",
  "addStyleTag",
];

const browserlessSourceChoice = [
  { required: ["url"], not: { required: ["html"] } },
  { required: ["html"], not: { required: ["url"] } },
];

const contentInputSchema: JsonSchema = {
  ...s.object(
    "The input payload for fetching rendered HTML content with Browserless.",
    {
      url: uriString("The public URL Browserless should navigate to."),
      html: nonEmptyString("The inline HTML Browserless should render instead of navigating to a URL."),
      ...sharedRequestShape,
    },
    { optional: ["url", "html", ...sharedRequestOptional] },
  ),
  oneOf: browserlessSourceChoice,
};

const screenshotOptionsSchema = s.object(
  "The screenshot options forwarded to Browserless.",
  {
    type: s.stringEnum("The screenshot image format.", ["png", "jpeg", "webp"]),
    fullPage: s.boolean("Whether Browserless should capture the full scrollable page."),
    quality: s.integer("The output image quality from 0 to 100.", { minimum: 0, maximum: 100 }),
    omitBackground: s.boolean("Whether Browserless should omit the page background."),
    clip: s.object("The clipping rectangle for the captured screenshot.", {
      x: nonNegativeInteger("The X coordinate in CSS pixels."),
      y: nonNegativeInteger("The Y coordinate in CSS pixels."),
      width: positiveInteger("The clip width in CSS pixels."),
      height: positiveInteger("The clip height in CSS pixels."),
    }),
  },
  { optional: ["type", "fullPage", "quality", "omitBackground", "clip"] },
);

const screenshotInputSchema: JsonSchema = {
  ...s.object(
    "The input payload for generating a screenshot with Browserless.",
    {
      url: uriString("The public URL Browserless should capture."),
      html: nonEmptyString("The inline HTML Browserless should capture instead of navigating to a URL."),
      options: screenshotOptionsSchema,
      ...sharedRequestShape,
    },
    { optional: ["url", "html", "options", ...sharedRequestOptional] },
  ),
  oneOf: browserlessSourceChoice,
};

const pdfOptionsSchema = s.object(
  "The PDF options forwarded to Browserless.",
  {
    format: s.stringEnum("The paper format Browserless should use.", [
      "Letter",
      "Legal",
      "Tabloid",
      "Ledger",
      "A0",
      "A1",
      "A2",
      "A3",
      "A4",
      "A5",
      "A6",
    ]),
    printBackground: s.boolean("Whether Browserless should print CSS backgrounds."),
    displayHeaderFooter: s.boolean("Whether Browserless should include header and footer templates."),
  },
  { optional: ["format", "printBackground", "displayHeaderFooter"] },
);

const pdfInputSchema: JsonSchema = {
  ...s.object(
    "The input payload for generating a PDF with Browserless.",
    {
      url: uriString("The public URL Browserless should render into a PDF."),
      html: nonEmptyString("The inline HTML Browserless should render into a PDF."),
      options: pdfOptionsSchema,
      ...sharedRequestShape,
    },
    { optional: ["url", "html", "options", ...sharedRequestOptional] },
  ),
  oneOf: browserlessSourceChoice,
};

const htmlOutputSchema = s.actionOutput(
  {
    html: s.string("The fully rendered HTML content returned by Browserless."),
  },
  "The output payload for a Browserless rendered HTML response.",
);

const transitFileOutputSchema = s.object("A Browserless-generated file stored in local transit storage.", {
  fileId: s.nonEmptyString("The local transit file identifier."),
  downloadUrl: s.url("The local transit URL for downloading the generated file."),
  sizeBytes: s.integer("The generated file size in bytes."),
  name: s.nonEmptyString("The generated file name."),
  mimeType: s.nonEmptyString("The generated file MIME type."),
});

const fileOutputSchema = s.actionOutput(
  {
    file: transitFileOutputSchema,
  },
  "The output payload for a Browserless-generated file.",
);

export const browserlessActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "fetch_content",
    operationType: "read",
    description: "Fetch fully rendered HTML content from Browserless.",
    inputSchema: contentInputSchema,
    outputSchema: htmlOutputSchema,
  }),
  defineProviderAction(service, {
    name: "take_screenshot",
    operationType: "read",
    description: "Generate a Browserless screenshot and store it in local transit storage.",
    inputSchema: screenshotInputSchema,
    outputSchema: fileOutputSchema,
  }),
  defineProviderAction(service, {
    name: "generate_pdf",
    operationType: "read",
    description: "Generate a Browserless PDF file and store it in local transit storage.",
    inputSchema: pdfInputSchema,
    outputSchema: fileOutputSchema,
  }),
];
