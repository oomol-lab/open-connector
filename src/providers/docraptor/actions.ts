import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "docraptor";

const docraptorInputSchema = s.object(
  "Input parameters for creating a hosted DocRaptor document from raw HTML or a public URL.",
  {
    name: s.nonEmptyString("A name for identifying the generated document in DocRaptor."),
    documentType: s.stringEnum("The output document format.", ["pdf", "xls", "xlsx"]),
    documentContent: s.nonEmptyString("Raw HTML or XML content to convert into a document."),
    documentUrl: s.url("A public URL that DocRaptor should fetch and convert."),
    test: s.boolean("Whether DocRaptor should create a test document. Test documents may include a watermark."),
    javascript: s.boolean("Whether DocRaptor should execute JavaScript during rendering."),
    pipeline: s.nonEmptyString("A specific DocRaptor pipeline version to use."),
    referrer: s.url("The HTTP referrer DocRaptor should use when fetching document assets."),
    tag: s.nonEmptyString("An arbitrary tag stored with the document for account-side tracking."),
    strict: s.stringEnum("The DocRaptor validation mode for input HTML.", ["none", "html"]),
    hostedDownloadLimit: s.positiveInteger("The maximum number of times the hosted document can be downloaded."),
    hostedExpiresAt: s.dateTime("The ISO 8601 date-time when the hosted document should expire."),
    princeOptions: s.looseObject(
      "Advanced Prince PDF options forwarded to DocRaptor as-is using official prince_options keys.",
    ),
  },
  {
    optional: [
      "documentContent",
      "documentUrl",
      "test",
      "javascript",
      "pipeline",
      "referrer",
      "tag",
      "strict",
      "hostedDownloadLimit",
      "hostedExpiresAt",
      "princeOptions",
    ],
  },
);

const hostedDocumentOutputSchema = s.object(
  "The normalized hosted DocRaptor document result returned by the connector.",
  {
    documentUrl: s.url("The URL for downloading the hosted document."),
    documentId: s.nullableString("The hosted document identifier when DocRaptor includes one in the response."),
    numberOfPages: s.nullableInteger("The generated PDF page count when DocRaptor includes it in the response."),
  },
);

export const docraptorActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "create_hosted_document",
    description:
      "Create a hosted PDF or Excel document with DocRaptor from raw HTML or a public URL and return its download URL.",
    inputSchema: docraptorInputSchema,
    outputSchema: hostedDocumentOutputSchema,
  }),
];
