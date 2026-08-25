import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "docparser";

const noInputSchema = s.object("No input parameters are required for this action.", {});
const docparserLooseObject = s.looseObject("A loose JSON object.");
const parserSchema = s.object("A Document Parser linked to the current Docparser account.", {
  id: s.string("The unique identifier of the parser."),
  label: s.string("The human-readable parser label."),
});
const parserModelSchema = s.object("A model layout attached to a specific Docparser parser.", {
  id: s.string("The unique identifier of the parser model layout."),
  label: s.string("The human-readable label of the parser model layout."),
});
const documentImportResponseSchema = s.object(
  "Normalized import metadata returned after uploading a document to Docparser.",
  {
    documentId: s.string("The unique identifier of the imported document."),
    fileSize: s.nullableInteger("The imported file size in bytes when Docparser returns it."),
    quotaUsed: s.nullableInteger("The amount of account quota consumed by the import."),
    quotaLeft: s.nullableInteger("The remaining account quota after the import."),
    quotaRefill: s.nullableString("The ISO 8601 timestamp when the account quota refills."),
  },
);
const fetchedDocumentSchema = s.object("Normalized metadata returned after queuing a URL import in Docparser.", {
  documentId: s.string("The unique identifier of the fetched document."),
  parserId: s.string("The parser identifier the document was queued against."),
  remoteId: s.nullableString("The passthrough remote ID returned by Docparser."),
  message: s.string("The upstream status message, which usually contains a status URL."),
});
const documentStatusSchema = s.object("Normalized status information for a Docparser document.", {
  token: s.string("The document token returned by Docparser."),
  remoteId: s.nullableString("The passthrough remote ID linked to the document."),
  fileSource: s.nullableString("The import source reported by Docparser, such as `api`."),
  filename: s.nullableString("The original file name reported by Docparser."),
  mimeType: s.nullableString("The detected MIME type of the document."),
  pages: s.integer("The page count reported by Docparser."),
  supported: s.boolean("Whether the file type is supported by Docparser."),
  importingInProgress: s.boolean("Whether the document import is still running."),
  processingInProgress: s.boolean("Whether the parser is still processing the document."),
  webhookDispatchingInProgress: s.boolean("Whether webhook dispatch is still running."),
  uploadedAt: s.integer("The Unix timestamp in seconds when the document was uploaded."),
  importedAt: s.integer("The Unix timestamp in seconds when the document import finished."),
  ocrStartedAt: s.integer("The Unix timestamp in seconds when OCR started."),
  preprocessedAt: s.integer("The Unix timestamp in seconds when preprocessing finished."),
  preprocessingInProgressAt: s.integer("The Unix timestamp in seconds when preprocessing started."),
  processedAt: s.integer("The Unix timestamp in seconds when parsing completed."),
  firstProcessedAt: s.integer("The Unix timestamp in seconds when parsing first completed."),
  dispatchedWebhook: s.boolean("Whether a webhook was dispatched successfully."),
  dispatchedWebhookAt: s.integer("The Unix timestamp in seconds when the webhook was dispatched."),
  dispatchedWebhookProblem: s.boolean("Whether webhook dispatch encountered a problem."),
  webhooksCreated: s.integer("The number of queued webhooks created."),
  webhooksSent: s.integer("The number of webhooks successfully sent."),
  failedJobs: s.stringArray("The background jobs that failed for this document."),
  raw: docparserLooseObject,
});
const documentResultSchema = s.looseObject("A normalized parsed-document result returned by Docparser.", {
  id: s.string("The unique identifier of the parsed result."),
  documentId: s.string("The unique identifier of the source document."),
  remoteId: s.nullableString("The passthrough remote ID associated with the document."),
  fileName: s.nullableString("The original file name of the source document."),
  mediaLink: s.nullableString("The standard Docparser media link for the document."),
  mediaLinkOriginal: s.nullableString("The original-file media link for the document."),
  mediaLinkData: s.nullableString("The parsed-data media link for the document."),
  pageCount: s.nullableInteger("The page count of the parsed document."),
  uploadedAt: s.nullableString("The ISO 8601 timestamp when the document was uploaded."),
  processedAt: s.nullableString("The ISO 8601 timestamp when the document finished processing."),
  parsedData: docparserLooseObject,
  raw: docparserLooseObject,
});
const resultsFormatSchema = s.stringEnum(
  "The output format for parsed data. `object` returns nested JSON and `flat` returns flattened key/value pairs.",
  ["object", "flat"],
);
const resultsSortBySchema = s.stringEnum("The timestamp field used to sort multiple-document results.", [
  "parsed_at",
  "processed_at",
  "uploaded_at",
  "first_processed_at",
  "imported_at",
  "integrated_at",
  "dispatched_webhook_at",
  "preprocessed_at",
]);
const resultsSortOrderSchema = s.stringEnum("The sort direction used for multiple-document results.", ["ASC", "DESC"]);

export const docparserActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "ping",
    description: "Ping the Docparser API to verify that the provided API key is valid.",
    inputSchema: noInputSchema,
    outputSchema: s.object("The normalized ping response returned by Docparser.", {
      msg: s.string("The upstream confirmation message. Docparser returns `pong`."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_parsers",
    description: "List all Document Parsers linked to the current Docparser account.",
    inputSchema: noInputSchema,
    outputSchema: s.object("The normalized parser list returned by Docparser.", {
      parsers: s.array("The parsers returned by Docparser.", parserSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_parser_models",
    description: "List all model layouts for a specific Docparser parser.",
    inputSchema: s.object("Input parameters for retrieving parser model layouts.", {
      parserId: s.nonEmptyString("The parser identifier to list model layouts for."),
    }),
    outputSchema: s.object("The normalized parser model list returned by Docparser.", {
      models: s.array("The parser model layouts returned by Docparser.", parserModelSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "upload_document_by_content",
    description:
      "Upload a document to a Docparser parser by sending base64-encoded file content and an optional file name.",
    inputSchema: s.object(
      "Input parameters for uploading a document by base64 content.",
      {
        parserId: s.nonEmptyString("The parser identifier to upload the document to."),
        contentBase64: s.nonEmptyString("The base64-encoded document content to upload."),
        fileName: s.nonEmptyString("The file name to attribute to the uploaded document."),
        remoteId: s.nonEmptyString("An optional passthrough ID that is stored with the document."),
      },
      { optional: ["fileName", "remoteId"] },
    ),
    outputSchema: documentImportResponseSchema,
  }),
  defineProviderAction(service, {
    name: "fetch_document_from_url",
    description:
      "Queue a publicly accessible document URL for import into a Docparser parser and return the scheduled document metadata.",
    inputSchema: s.object(
      "Input parameters for fetching a document into Docparser from a public URL.",
      {
        parserId: s.nonEmptyString("The parser identifier to import the document into."),
        url: s.nonEmptyString("The publicly accessible document URL to fetch."),
        remoteId: s.nonEmptyString("An optional passthrough ID that is stored with the fetched document."),
      },
      { optional: ["remoteId"] },
    ),
    outputSchema: fetchedDocumentSchema,
  }),
  defineProviderAction(service, {
    name: "get_document_status",
    description: "Retrieve the import, preprocessing, parsing, and webhook-dispatch status of one Docparser document.",
    inputSchema: s.object("Input parameters for retrieving a Docparser document status.", {
      parserId: s.nonEmptyString("The parser identifier that owns the document."),
      documentId: s.nonEmptyString("The unique document identifier returned during import."),
    }),
    outputSchema: s.object("The normalized output payload for the get_document_status action.", {
      status: documentStatusSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_document_result",
    description:
      "Retrieve the parsed data of one Docparser document. When child documents exist and are included, multiple result rows may be returned.",
    inputSchema: s.object(
      "Input parameters for retrieving parsed data of one Docparser document.",
      {
        parserId: s.nonEmptyString("The parser identifier that owns the document."),
        documentId: s.nonEmptyString("The unique document identifier returned during import."),
        format: resultsFormatSchema,
        includeChildren: s.boolean("Whether parsed data of child documents should also be returned."),
      },
      { optional: ["format", "includeChildren"] },
    ),
    outputSchema: s.object("The normalized output payload for the get_document_result action.", {
      results: s.array(
        "The parsed result rows returned by Docparser for the requested document.",
        documentResultSchema,
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "get_multiple_document_results",
    description:
      "Retrieve parsed data for multiple documents of a specific parser with optional filtering, pagination, queue inclusion, and sorting.",
    inputSchema: s.object(
      "Input parameters for retrieving parsed data of multiple Docparser documents.",
      {
        parserId: s.nonEmptyString("The parser identifier to read results from."),
        format: resultsFormatSchema,
        list: s.stringEnum("The upstream result list mode used to filter which documents are returned.", [
          "last_uploaded",
          "uploaded_after",
          "processed_after",
        ]),
        limit: s.integer("The maximum number of result rows to return.", { minimum: 1, maximum: 10000 }),
        date: s.string(
          "The ISO 8601 or Unix timestamp filter used with `uploaded_after` or `processed_after` list modes.",
        ),
        remoteId: s.nonEmptyString("Restrict results to documents with this remote ID."),
        includeProcessingQueue: s.boolean("Whether in-progress documents should also be included in the result set."),
        sortBy: resultsSortBySchema,
        sortOrder: resultsSortOrderSchema,
      },
      {
        optional: ["format", "list", "limit", "date", "remoteId", "includeProcessingQueue", "sortBy", "sortOrder"],
      },
    ),
    outputSchema: s.object("The normalized output payload for the get_multiple_document_results action.", {
      results: s.array("The parsed result rows returned by Docparser.", documentResultSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "reparse_documents",
    description: "Schedule one or more Docparser documents for re-parsing using their document IDs.",
    inputSchema: s.object("Input parameters for scheduling documents for re-parsing.", {
      parserId: s.nonEmptyString("The parser identifier that owns the documents."),
      documentIds: s.stringArray("The document identifiers to schedule for re-parsing.", { minItems: 1 }),
    }),
    outputSchema: s.object("The normalized output payload for the reparse_documents action.", {
      totalReparsed: s.integer("The number of documents Docparser scheduled for re-parsing."),
      msg: s.nullableString("The upstream message returned by Docparser."),
    }),
  }),
  defineProviderAction(service, {
    name: "reintegrate_documents",
    description: "Schedule one or more Docparser documents for the integration queue using their document IDs.",
    inputSchema: s.object("Input parameters for scheduling documents for reintegration.", {
      parserId: s.nonEmptyString("The parser identifier that owns the documents."),
      documentIds: s.stringArray("The document identifiers to schedule for reintegration.", { minItems: 1 }),
    }),
    outputSchema: s.object("The normalized output payload for the reintegrate_documents action.", {
      totalReintegrate: s.integer("The number of documents Docparser scheduled for reintegration."),
      msg: s.nullableString("The upstream message returned by Docparser."),
    }),
  }),
];
