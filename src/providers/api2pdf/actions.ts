import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "api2pdf";

const chromeOptionsSchema = s.looseObject(
  "Advanced Headless Chrome PDF options forwarded to API2PDF as-is. Use the official API2PDF option keys supported by the /chrome/pdf/markdown endpoint.",
);

const markdownToPdfInputSchema = s.object(
  "Input parameters for converting raw Markdown to PDF.",
  {
    markdown: s.string("The raw Markdown content to convert to PDF.", { minLength: 1 }),
    fileName: s.string("An optional output PDF file name sent to API2PDF.", { minLength: 1 }),
    inline: s.boolean("Whether API2PDF should mark the generated PDF for inline display when possible."),
    options: chromeOptionsSchema,
  },
  { required: ["markdown"] },
);

const markdownToPdfOutputSchema = s.object(
  "The normalized markdown-to-PDF result returned by API2PDF.",
  {
    pdfUrl: s.nullable(s.string("The temporary API2PDF URL for downloading the PDF.")),
    success: s.boolean("Whether API2PDF reported the Markdown-to-PDF conversion as successful."),
    responseId: s.nullable(s.string("The API2PDF response identifier for this conversion request.")),
    cost: s.nullable(s.number("The conversion cost in USD when returned by API2PDF.")),
    mbIn: s.nullable(s.number("The input size in megabytes when returned by API2PDF.")),
    mbOut: s.nullable(s.number("The output size in megabytes when returned by API2PDF.")),
    seconds: s.nullable(s.number("The processing duration in seconds when returned by API2PDF.")),
    error: s.nullable(s.string("The upstream API2PDF error string when one was returned.")),
  },
  { required: ["pdfUrl", "success", "responseId", "cost", "mbIn", "mbOut", "seconds", "error"] },
);

export const api2pdfActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "markdown_to_pdf",
    description:
      "Convert raw Markdown to PDF with API2PDF and return the generated PDF URL plus conversion metadata.",
    inputSchema: markdownToPdfInputSchema,
    outputSchema: markdownToPdfOutputSchema,
  }),
];

export type Api2pdfActionName = (typeof api2pdfActions)[number]["name"];
