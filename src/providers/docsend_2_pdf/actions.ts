import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "docsend_2_pdf" as const;

const nonEmptyString = (description: string) => s.string(description, { minLength: 1 });

const pdfOutputSchema = s.object(
  "The converted PDF delivery metadata.",
  {
    name: s.string("The PDF filename."),
    mimetype: s.string("The PDF MIME type."),
    downloadUrl: s.url("The local transit URL for downloading the converted PDF."),
    base64: s.string("The converted PDF content encoded as base64 when explicitly requested."),
  },
  { optional: ["downloadUrl", "base64"] },
);

export type Docsend2PdfActionName = "convert";

export const docsend2PdfActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "convert",
    operationType: "read",
    description: "Convert a DocSend document URL to PDF and return JSON-safe download metadata.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for converting one DocSend document to PDF.",
      {
        url: s.url("The DocSend document URL to convert."),
        email: s.email("The optional email address required by some protected DocSend links."),
        passcode: nonEmptyString("The optional passcode required by password-protected DocSend links."),
        outputName: nonEmptyString("The preferred PDF filename for the converted document."),
        returnPdfBase64: s.boolean(
          "Whether to return the PDF bytes as base64 when file transit is unavailable or not desired.",
        ),
      },
      { optional: ["email", "passcode", "outputName", "returnPdfBase64"] },
    ),
    outputSchema: s.object("The normalized Docsend2pdf conversion response.", {
      succeeded: s.boolean("Whether the conversion completed successfully."),
      contentType: s.string("The MIME type returned for the converted PDF."),
      contentLength: s.integer("The PDF size in bytes."),
      rateLimit: s.object(
        "Rate limit metadata returned by Docsend2pdf when available.",
        {
          limit: s.integer("The maximum requests allowed in the rate-limit window."),
          remaining: s.integer("The remaining requests in the current rate-limit window."),
          reset: s.integer("The timestamp when the rate-limit window resets."),
          retryAfter: s.integer("The retry delay in seconds when rate limited."),
        },
        { optional: ["limit", "remaining", "reset", "retryAfter"] },
      ),
      pdf: pdfOutputSchema,
    }),
  }),
];
