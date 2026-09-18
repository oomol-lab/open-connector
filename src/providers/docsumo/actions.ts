import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "docsumo" as const;

function nonEmptyString(description: string) {
  return s.string(description, { minLength: 1 });
}

const createdDateStringSchema = s.string({
  minLength: 10,
  maxLength: 10,
  pattern: "^\\d{4}-\\d{2}-\\d{2}$",
  description: "A date string in YYYY-MM-DD format.",
});

const documentTypeSchema = s.object("One enabled Docsumo document type.", {
  title: nonEmptyString("The display name of the document type."),
  value: nonEmptyString("The stable document type identifier used in API requests."),
});

const uploadedDocumentSchema = s.object("Normalized Docsumo uploaded-document metadata.", {
  createdAt: s.nullable(s.string("The upstream document creation timestamp when returned.")),
  docId: nonEmptyString("The unique Docsumo document identifier."),
  docMetaData: s.nullable(s.string("The metadata string stored with the uploaded document when returned.")),
  email: s.nullable(s.string("The email address associated with the uploaded document.")),
  reviewUrl: s.nullable(s.string("The Docsumo review URL for the uploaded document.")),
  status: nonEmptyString("The current Docsumo processing status."),
  title: s.nullable(s.string("The document title returned by Docsumo.")),
  type: s.nullable(s.string("The uploaded document type identifier.")),
  userDocId: s.nullable(s.string("The caller-supplied external document identifier when returned.")),
  userId: s.nullable(s.string("The Docsumo user identifier that owns the document.")),
});

const previewImageSchema = s.object("The preview image metadata returned by Docsumo.", {
  url: nonEmptyString("The preview image URL."),
  width: s.integer("The preview image width in pixels."),
  height: s.integer("The preview image height in pixels."),
});

const uploadedBySchema = s.object("The Docsumo uploader metadata.", {
  avatarUrl: s.nullable(s.string("The uploader avatar URL when returned.")),
  email: s.nullable(s.string("The uploader email address when returned.")),
  fullName: s.nullable(s.string("The uploader full name when returned.")),
  userId: s.nullable(s.string("The uploader user identifier when returned.")),
});

const documentSummarySchema = s.object("One normalized Docsumo document summary record.", {
  approvedWithWarnings: s.nullable(s.boolean("Whether Docsumo approved the document despite validation warnings.")),
  createdAtIso: s.nullable(s.string("The ISO 8601 timestamp when the document was created.")),
  displayType: s.nullable(s.string("The Docsumo display bucket such as `files` or `folder`.")),
  docId: nonEmptyString("The unique Docsumo document identifier."),
  docMetaData: s.nullable(s.string("The metadata string stored with the document when returned.")),
  folderId: s.nullable(s.string("The folder identifier containing the document when present.")),
  folderName: s.nullable(s.string("The folder name containing the document when present.")),
  hasFeedback: s.nullable(s.boolean("Whether the document currently has review feedback.")),
  modifiedAtIso: s.nullable(s.string("The ISO 8601 timestamp when the document was last modified.")),
  previewImage: s.nullable(previewImageSchema),
  reviewUrl: s.nullable(s.string("The Docsumo review URL for the document.")),
  s3Filename: s.nullable(s.string("The upstream storage filename returned by Docsumo when present.")),
  status: s.nullable(s.string("The current Docsumo processing status.")),
  templateDocId: s.nullable(s.string("The upstream template document identifier when present.")),
  time: s.nullable(
    s.object("Processing timing metadata returned by Docsumo.", {
      processingTime: s.nullable(s.number("The document processing time in seconds when returned.")),
      totalTime: s.nullable(s.number("The total processing time in seconds when returned.")),
    }),
  ),
  title: s.nullable(s.string("The document title returned by Docsumo.")),
  type: s.nullable(s.string("The document type identifier.")),
  typeTitle: s.nullable(s.string("The display title for the document type.")),
  uploadedBy: s.nullable(uploadedBySchema),
  userDocId: s.nullable(s.string("The caller-supplied external document identifier when returned.")),
});

const documentPageSchema = s.looseObject("One document page metadata object returned by Docsumo.");

const documentDetailSchema = s.object("One normalized Docsumo document detail payload.", {
  data: s.looseObject("The upstream `document.data` payload returned by Docsumo."),
  docId: nonEmptyString("The unique Docsumo document identifier."),
  pages: s.array("The page metadata returned by Docsumo for this document.", documentPageSchema),
  previewImage: s.nullable(s.looseObject("The preview-image payload returned by Docsumo for this document.")),
  type: s.nullable(s.string("The document type identifier.")),
  typeTitle: s.nullable(s.string("The display name of the document type.")),
  uploadedBy: s.nullable(s.looseObject("The upstream uploader payload returned by Docsumo for this document.")),
  userId: s.nullable(s.string("The Docsumo user identifier associated with the document.")),
});

const summaryDocumentTypeSchema = s.object("The document-type summary object returned by Docsumo documents summary.", {
  canUpload: s.nullable(s.boolean("Whether the connected user can upload this document type.")),
  category: s.nullable(s.string("The Docsumo category label for this document type.")),
  defaultType: s.nullable(s.boolean("Whether Docsumo marks this as a default document type.")),
  counts: s.nullable(
    s.object("The Docsumo counts grouped by processing status.", {
      all: s.nullable(s.integer("The total number of documents of this type.")),
      processed: s.nullable(s.integer("The number of processed documents of this type.")),
      reviewing: s.nullable(s.integer("The number of reviewing documents of this type.")),
    }),
  ),
  docType: s.nullable(s.string("The stable document type identifier.")),
  excelType: s.nullable(s.boolean("Whether Docsumo marks the document type as Excel-based.")),
  flags: s.nullable(s.looseObject("The feature flags Docsumo returns for this document type.")),
  id: s.nullable(s.integer("The numeric upstream document-type identifier.")),
  isEditable: s.nullable(s.boolean("Whether the document type is editable in Docsumo.")),
  models: s.array("The model identifiers associated with this document type.", s.string("One model identifier.")),
  title: s.nullable(s.string("The display title of the document type.")),
  uploadEmail: s.nullable(s.string("The dedicated Docsumo upload email address for this document type.")),
  userId: s.nullable(s.string("The Docsumo user identifier associated with this type.")),
});

export type DocsumoActionName =
  | "get_account_info"
  | "upload_document_from_url"
  | "list_documents"
  | "get_document_detail"
  | "get_extracted_data"
  | "get_documents_summary";

export const docsumoActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_account_info",
    operationType: "read",
    description: "Get Docsumo account details, monthly document quota usage, and the currently enabled document types.",
    requiredScopes: [],
    inputSchema: s.object("No input parameters are required for retrieving account info.", {}),
    outputSchema: s.object("Normalized Docsumo account and document-type information.", {
      email: s.nullable(s.string("The authenticated Docsumo account email address.")),
      fullName: s.nullable(s.string("The authenticated Docsumo account full name.")),
      userId: s.nullable(s.string("The authenticated Docsumo user identifier.")),
      monthlyDocCurrent: s.nullable(s.integer("The number of documents processed in the current billing cycle.")),
      monthlyDocLimit: s.nullable(s.integer("The document-processing limit for the current billing cycle.")),
      documentTypes: s.array(
        "The currently enabled document types available to the Docsumo account.",
        documentTypeSchema,
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "upload_document_from_url",
    operationType: "write",
    description:
      "Upload one public file URL to Docsumo for a chosen document type and return the queued document metadata.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for uploading one public file URL to Docsumo.",
      {
        docType: nonEmptyString("The Docsumo document type identifier to process the file with."),
        fileUrl: s.url("The public file URL that Docsumo should download and process."),
        userDocId: s.string("An optional caller-defined document identifier for external tracking.", { minLength: 1 }),
        docMetaData: s.looseObject(
          "Optional metadata that will be JSON-stringified and attached to the uploaded document.",
        ),
        reviewToken: s.boolean("Whether Docsumo should return a temporary signed review URL for external review."),
        password: s.string("The password for the source document when it is password-protected.", {
          minLength: 1,
        }),
      },
      { optional: ["userDocId", "docMetaData", "reviewToken", "password"] },
    ),
    outputSchema: s.object("Normalized metadata returned after queueing a Docsumo URL upload.", {
      document: uploadedDocumentSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_documents",
    operationType: "read",
    description:
      "List Docsumo documents with optional folder, type, status, search, sorting, and created-date filters.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for listing Docsumo documents.",
      {
        view: s.stringEnum("How Docsumo should scope the listing: `files`, `folder`, or `all_files`.", [
          "files",
          "folder",
          "all_files",
        ]),
        folderId: nonEmptyString("The folder identifier to list documents from when `view` is `folder`."),
        limit: s.integer("The maximum number of documents to return. Official docs cap this at 20.", {
          minimum: 0,
          maximum: 20,
        }),
        offset: s.nonNegativeInteger("The number of documents to skip before returning results."),
        docType: nonEmptyString("The Docsumo document type identifier to filter by."),
        status: s.stringEnum("The Docsumo processing status to filter by.", ["reviewing", "processed", "erred"]),
        query: nonEmptyString("A partial-match search query applied to document titles."),
        sortBy: s.stringEnum("The sort order for document creation time.", ["created_date.asc", "created_date.desc"]),
        createdDateGte: createdDateStringSchema,
        createdDateLte: createdDateStringSchema,
      },
      {
        optional: [
          "view",
          "folderId",
          "limit",
          "offset",
          "docType",
          "status",
          "query",
          "sortBy",
          "createdDateGte",
          "createdDateLte",
        ],
      },
    ),
    outputSchema: s.object("Normalized Docsumo document list response.", {
      documents: s.array("The documents returned by Docsumo for this query.", documentSummarySchema),
      pagination: s.object("The pagination metadata returned by Docsumo.", {
        limit: s.nullable(s.integer("The maximum number of records returned in this response.")),
        offset: s.nullable(s.integer("The zero-based result offset returned by Docsumo.")),
        total: s.nullable(s.integer("The total number of records matching the current query.")),
      }),
    }),
  }),
  defineProviderAction(service, {
    name: "get_document_detail",
    operationType: "read",
    description:
      "Get Docsumo document detail metadata for one document, including page information and preview assets.",
    requiredScopes: [],
    inputSchema: s.object("Input parameters for retrieving one Docsumo document detail record.", {
      docId: nonEmptyString("The Docsumo document identifier to retrieve."),
    }),
    outputSchema: s.object("Normalized Docsumo document detail response.", {
      document: documentDetailSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_extracted_data",
    operationType: "read",
    description:
      "Get the simplified extracted Docsumo data for one document and preserve the dynamic section and field structure.",
    requiredScopes: [],
    inputSchema: s.object("Input parameters for retrieving simplified Docsumo extracted data.", {
      docId: nonEmptyString("The Docsumo document identifier to retrieve extracted data for."),
    }),
    outputSchema: s.object("The simplified extracted data returned by Docsumo.", {
      extractedData: s.looseObject(
        "The dynamic extracted-data payload returned by Docsumo, grouped by upstream section names.",
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "get_documents_summary",
    operationType: "read",
    description:
      "Get the Docsumo documents summary grouped by document type, including disabled types and status counts.",
    requiredScopes: [],
    inputSchema: s.object("No input parameters are required for documents summary.", {}),
    outputSchema: s.object("Normalized Docsumo documents summary response.", {
      disabledDocTypes: s.array(
        "The document type identifiers Docsumo marks as disabled for the account.",
        s.string("One disabled document type identifier."),
      ),
      documentType: s.nullable(summaryDocumentTypeSchema),
    }),
  }),
];
