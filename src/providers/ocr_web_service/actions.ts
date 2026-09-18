import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "ocr_web_service";

const ocrZoneSchema = s.requiredObject("A rectangular OCR zone in pixel coordinates.", {
  top: s.nonNegativeInteger("The top coordinate in pixels from the upper-left corner."),
  left: s.nonNegativeInteger("The left coordinate in pixels from the upper-left corner."),
  height: s.positiveInteger("The zone height in pixels."),
  width: s.positiveInteger("The zone width in pixels."),
});

const outputFormatSchema = s.stringEnum("An OCR Web Service output document format.", [
  "pdf",
  "doc",
  "xls",
  "rtf",
  "txt",
]);

const accountInformationOutputSchema = s.object(
  "The normalized OCR Web Service account information.",
  {
    availablePages: s.integer("The remaining available pages for the current subscription plan."),
    maxPages: s.integer("The maximum pages for the current subscription plan."),
    lastProcessingTime: s.nullableString("The last processing time returned by OCR Web Service."),
    subscriptionPlan: s.nullableString("The current subscription plan name."),
    expirationDate: s.nullableString("The license expiration date returned by OCR Web Service."),
  },
  { optional: ["availablePages", "maxPages"] },
);

const processDocumentInputSchema = s.object(
  "Input parameters for OCR Web Service document processing.",
  {
    fileUrl: s.url("The public HTTP or HTTPS URL of the image or PDF file to process."),
    languages: s.array(
      "Recognition languages to send to OCR Web Service.",
      s.nonEmptyString("One OCR Web Service recognition language, such as english or german."),
      { minItems: 1 },
    ),
    pageRange: s.nonEmptyString("Page numbers or ranges separated by commas, such as 1,3,5-12 or allpages."),
    toBlackAndWhite: s.boolean("Whether OCR Web Service should convert the image to black and white."),
    zones: s.array("OCR zones to process on each page.", ocrZoneSchema, { minItems: 1 }),
    outputFormats: s.array(
      "Output file formats to generate. OCR Web Service accepts up to two formats.",
      outputFormatSchema,
      { minItems: 1, maxItems: 2 },
    ),
    returnText: s.boolean("Whether OCR Web Service should return extracted text in the response."),
    returnWords: s.boolean("Whether OCR Web Service should return recognized word coordinates."),
    newline: s.boolean("Whether returned extracted text should preserve newline characters."),
    description: s.nonEmptyString("A task description that OCR Web Service returns in the response."),
  },
  {
    optional: [
      "languages",
      "pageRange",
      "toBlackAndWhite",
      "zones",
      "outputFormats",
      "returnText",
      "returnWords",
      "newline",
      "description",
    ],
  },
);

const processDocumentOutputSchema = s.object(
  "The normalized OCR Web Service document processing result.",
  {
    text: s.string("The extracted OCR text concatenated from all zones and pages."),
    ocrText: s.array(
      "The raw OCR text matrix returned by OCR Web Service as zones by pages.",
      s.array("The OCR text values for one zone.", s.string("The OCR text for one page.")),
    ),
    availablePages: s.integer("The remaining available pages after this task."),
    processedPages: s.integer("The number of pages processed for this task."),
    outputFileUrl: s.nullableString("The OCR Web Service output file URL when an output format was requested."),
    taskDescription: s.nullableString("The task description echoed by OCR Web Service."),
  },
  { optional: ["availablePages", "processedPages"] },
);

export const ocrWebServiceActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_account_information",
    operationType: "read",
    description: "Get OCR Web Service account limits, remaining pages, subscription plan, and expiration metadata.",
    inputSchema: s.object("Input parameters for getting OCR Web Service account information.", {}),
    outputSchema: accountInformationOutputSchema,
  }),
  defineProviderAction(service, {
    name: "process_document_from_url",
    operationType: "read",
    description:
      "Download a public image or PDF URL through the connector SSRF guard, upload it to OCR Web Service, and return extracted text or output file metadata.",
    inputSchema: processDocumentInputSchema,
    outputSchema: processDocumentOutputSchema,
  }),
];
