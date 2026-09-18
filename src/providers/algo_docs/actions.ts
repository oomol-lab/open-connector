import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "algo_docs";

const idSchema = s.string("The AlgoDocs resource ID.", { minLength: 1 });
const localDateTimeSchema = s.string({
  description:
    "Only return records uploaded after this AlgoDocs local ISO 8601 combined date-time, for example 2017-06-21T10:45:52.",
  minLength: 19,
  maxLength: 19,
  pattern: "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}$",
});
const folderIdSchema = s.nullable(s.string("The parent AlgoDocs folder ID, or null for root."));
const rawObjectSchema = s.looseObject({}, { description: "The raw object returned by AlgoDocs." });
const rawArraySchema = s.array("The raw array returned by AlgoDocs.", s.unknown("One raw item."));

const extractorSchema = s.looseRequiredObject("An AlgoDocs extractor.", {
  id: idSchema,
  name: s.string("The AlgoDocs extractor name."),
});

const folderSchema = s.looseRequiredObject("An AlgoDocs folder.", {
  id: idSchema,
  parentId: folderIdSchema,
  name: s.string("The AlgoDocs folder name."),
});

const documentSchema = s.looseRequiredObject("An AlgoDocs imported document.", {
  id: s.integer("The AlgoDocs document ID.", { minimum: 1 }),
  fileSize: s.integer("The uploaded document file size in bytes."),
  fileMD5CheckSum: s.string("The uploaded document MD5 checksum."),
  uploadedAt: s.string("The document upload timestamp returned by AlgoDocs."),
});

const extractedRecordSchema = s.looseRequiredObject(
  "One AlgoDocs extracted data record.",
  {
    id: idSchema,
    documentId: s.integer("The AlgoDocs document ID for this extracted record.", { minimum: 1 }),
    uploadedAt: s.string("The document upload timestamp returned by AlgoDocs."),
    processedAt: s.string("The processing timestamp returned by AlgoDocs."),
    fileName: s.string("The original uploaded file name."),
    folderId: s.string("The AlgoDocs folder ID for this record."),
    mediaOriginal: s.url("The URL for the original uploaded document."),
    mediaExcel: s.url("The URL for the Excel export when returned by AlgoDocs."),
    mediaJson: s.url("The URL for the JSON export when returned by AlgoDocs."),
    mediaXml: s.url("The URL for the XML export when returned by AlgoDocs."),
    totalPages: s.integer("The total page count returned by AlgoDocs."),
    pageNumber: s.integer("The page number represented by this record."),
    data: s.looseObject({}, { description: "The extracted fields produced by the AlgoDocs extractor." }),
  },
  {
    optional: [
      "uploadedAt",
      "processedAt",
      "fileName",
      "folderId",
      "mediaOriginal",
      "mediaExcel",
      "mediaJson",
      "mediaXml",
      "totalPages",
      "pageNumber",
      "data",
    ],
  },
);

export const algoDocsActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_me",
    operationType: "read",
    description: "Get the AlgoDocs account identity for the connected API key.",
    requiredScopes: [],
    inputSchema: s.object("Input parameters for getting the AlgoDocs account identity.", {}),
    outputSchema: s.object("The AlgoDocs account identity.", {
      fullName: s.nullable(s.string("The full name returned by AlgoDocs.")),
      email: s.nullable(s.email("The email address returned by AlgoDocs.")),
      raw: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_extractors",
    operationType: "read",
    description: "List document data extractors in the connected AlgoDocs account.",
    requiredScopes: [],
    inputSchema: s.object("Input parameters for listing AlgoDocs extractors.", {}),
    outputSchema: s.object("The AlgoDocs extractor list response.", {
      extractors: s.array("Extractors returned by AlgoDocs.", extractorSchema),
      raw: rawArraySchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_folders",
    operationType: "read",
    description: "List folders in the connected AlgoDocs file manager.",
    requiredScopes: [],
    inputSchema: s.object("Input parameters for listing AlgoDocs folders.", {}),
    outputSchema: s.object("The AlgoDocs folder list response.", {
      folders: s.array("Folders returned by AlgoDocs.", folderSchema),
      raw: rawArraySchema,
    }),
  }),
  defineProviderAction(service, {
    name: "upload_document_from_url",
    operationType: "write",
    description: "Import a publicly accessible document URL into AlgoDocs for an extractor and folder.",
    requiredScopes: [],
    inputSchema: s.object("Input parameters for importing an AlgoDocs document from URL.", {
      extractorId: idSchema,
      folderId: idSchema,
      fileUrl: s.url("The publicly accessible document URL that AlgoDocs should fetch."),
    }),
    outputSchema: s.object("The AlgoDocs imported document response.", {
      document: documentSchema,
      raw: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_extracted_data_by_document",
    operationType: "read",
    description: "Get extracted data records for one AlgoDocs document ID.",
    requiredScopes: [],
    inputSchema: s.object("Input parameters for getting extracted data by document ID.", {
      documentId: s.integer("The AlgoDocs document ID returned by document import.", { minimum: 1 }),
    }),
    outputSchema: s.object("The AlgoDocs extracted data response for one document.", {
      records: s.array("Extracted records returned by AlgoDocs.", extractedRecordSchema),
      raw: rawArraySchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_extracted_data",
    operationType: "read",
    description:
      "List extracted data records for an AlgoDocs extractor, optionally filtered by folder, limit, and upload date.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for listing AlgoDocs extracted data.",
      {
        extractorId: idSchema,
        folderId: idSchema,
        limit: s.integer("The maximum number of extracted data records to return.", {
          minimum: 1,
          maximum: 10000,
        }),
        date: localDateTimeSchema,
      },
      { optional: ["folderId", "limit", "date"] },
    ),
    outputSchema: s.object("The AlgoDocs extracted data list response.", {
      records: s.array("Extracted records returned by AlgoDocs.", extractedRecordSchema),
      raw: rawArraySchema,
    }),
  }),
];
