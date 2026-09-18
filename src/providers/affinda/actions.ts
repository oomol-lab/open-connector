import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "affinda";

const identifierSchema = (description: string) => s.string({ description, minLength: 1 });
const documentStateSchema = s.stringEnum(["uploaded", "review", "validated", "archived", "rejected"], {
  description: "Filter by the Affinda document state.",
});

const organizationSchema = s.looseObject(
  {
    identifier: s.string("The Affinda organization identifier."),
    name: s.string("The Affinda organization name."),
  },
  { description: "An Affinda organization." },
);

const workspaceSchema = s.looseObject(
  {
    identifier: s.string("The Affinda workspace identifier."),
    name: s.string("The Affinda workspace name."),
  },
  { description: "An Affinda workspace." },
);

const documentTypeSchema = s.looseObject(
  {
    identifier: s.string("The Affinda document type identifier."),
    name: s.string("The Affinda document type name."),
  },
  { description: "An Affinda document type." },
);

const documentSchema = s.looseObject(
  "The Affinda document payload, including meta data and extracted data when returned.",
);
const nullablePageUrlSchema = s.nullable(s.string("A URL for another page of Affinda results, or null when absent."));

export const affindaActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_organizations",
    operationType: "read",
    description: "List Affinda organizations available to the connected API key.",
    requiredScopes: [],
    inputSchema: s.object("The empty input payload for this Affinda action.", {}),
    outputSchema: s.object("The Affinda organization list response.", {
      organizations: s.array("Organizations returned by Affinda.", organizationSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_workspaces",
    operationType: "read",
    description: "List Affinda workspaces in an organization.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters for listing Affinda workspaces.",
      {
        organization: identifierSchema("The Affinda organization identifier to list workspaces for."),
        name: identifierSchema("Only return workspaces whose name matches this value."),
      },
      { optional: ["name"] },
    ),
    outputSchema: s.object("The Affinda workspace list response.", {
      workspaces: s.array("Workspaces returned by Affinda.", workspaceSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_document_types",
    operationType: "read",
    description: "List Affinda document types available to the API key.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters for listing Affinda document types.",
      {
        organization: identifierSchema("Filter document types by Affinda organization identifier."),
        workspace: identifierSchema("Filter document types by Affinda workspace identifier."),
      },
      { optional: ["organization", "workspace"] },
    ),
    outputSchema: s.object("The Affinda document type list response.", {
      documentTypes: s.array("Document types returned by Affinda.", documentTypeSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "create_document_from_url",
    operationType: "write",
    description: "Upload a document to Affinda from a URL and optionally wait for parsing results.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for uploading a document to Affinda from a URL.",
      {
        url: s.string({
          description: "The publicly reachable document URL for Affinda to download and parse.",
          format: "uri",
          minLength: 1,
        }),
        workspace: identifierSchema("The Affinda workspace identifier to upload the document to."),
        documentType: identifierSchema("The Affinda document type identifier when the document type is already known."),
        wait: s.boolean("Whether Affinda should wait for parsing to complete before responding."),
        customIdentifier: identifierSchema("An optional user-defined identifier for tracking the document in Affinda."),
        fileName: identifierSchema("The filename Affinda should associate with this document."),
        expiryTime: s.dateTime("The ISO 8601 time when Affinda should automatically delete the document."),
        language: identifierSchema("The document language code to send to Affinda."),
        rejectDuplicates: s.boolean("Whether Affinda should reject duplicate documents without consuming credits."),
        lowPriority: s.boolean("Whether Affinda should process this document as low priority."),
        compact: s.boolean("Whether Affinda should return a compact parse result when wait is true."),
        deleteAfterParse: s.boolean(
          "Whether Affinda should delete stored data after parsing. Only use with wait true.",
        ),
        enableValidationTool: s.boolean("Whether the document should be viewable in the Affinda Validation Tool."),
        useOcr: s.boolean("Whether Affinda should force OCR for this document."),
        llmHint: identifierSchema("Optional hint inserted into Affinda's LLM prompt."),
      },
      {
        optional: [
          "documentType",
          "wait",
          "customIdentifier",
          "fileName",
          "expiryTime",
          "language",
          "rejectDuplicates",
          "lowPriority",
          "compact",
          "deleteAfterParse",
          "enableValidationTool",
          "useOcr",
          "llmHint",
        ],
      },
    ),
    outputSchema: s.object("The Affinda document response.", {
      document: documentSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_documents",
    operationType: "read",
    description: "List Affinda documents with optional workflow and pagination filters.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters and pagination controls for listing Affinda documents.",
      {
        offset: s.integer("The number of documents to skip before collecting results.", { minimum: 0 }),
        limit: s.integer("The number of documents to return.", { minimum: 1, maximum: 100 }),
        workspace: identifierSchema("Filter by Affinda workspace identifier."),
        state: documentStateSchema,
        tags: s.array("Filter by Affinda tag IDs.", s.integer("An Affinda tag ID.", { minimum: 1 }), {
          minItems: 1,
        }),
        search: identifierSchema("Match document file names or tag names case-insensitively."),
        includeData: s.boolean("Whether Affinda should include parsed data summaries in the list."),
        failed: s.boolean("Filter by failed processing status."),
        ready: s.boolean("Filter by ready processing status."),
        validatable: s.boolean("Filter to documents that can be validated."),
        customIdentifier: identifierSchema("Filter documents by the custom identifier set at upload."),
        compact: s.boolean("Whether Affinda should return compact parsed data."),
      },
      {
        optional: [
          "offset",
          "limit",
          "workspace",
          "state",
          "tags",
          "search",
          "includeData",
          "failed",
          "ready",
          "validatable",
          "customIdentifier",
          "compact",
        ],
      },
    ),
    outputSchema: s.object("The Affinda document page response.", {
      documents: s.array("Documents returned by Affinda.", documentSchema),
      count: s.integer("The number of documents in the Affinda result set.", { minimum: 0 }),
      next: nullablePageUrlSchema,
      previous: nullablePageUrlSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_document",
    operationType: "read",
    description: "Get one Affinda document by identifier.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for retrieving one Affinda document.",
      {
        identifier: identifierSchema("The Affinda document identifier."),
        compact: s.boolean("Whether Affinda should return compact parsed data."),
      },
      { optional: ["compact"] },
    ),
    outputSchema: s.object("The Affinda document response.", {
      document: documentSchema,
    }),
  }),
];
