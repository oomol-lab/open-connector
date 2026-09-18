import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "formstack_documents";

const documentTypeSchema = s.stringEnum("Document template source type.", ["html", "pdf", "docx", "xlsx", "pptx"]);

const documentOutputSchema = s.stringEnum("Output format produced when the document is merged.", [
  "pdf",
  "docx",
  "xlsx",
  "pptx",
  "email",
]);

const documentSchema = s.looseObject("A Formstack Documents template.", {
  id: s.string("Unique document identifier."),
  key: s.string("Secret merge key associated with the document."),
  type: s.string("Document template source type."),
  name: s.string("Document name."),
  output: s.string("Output format produced by merges."),
  output_name: s.string("Custom output filename template."),
  folder: s.string("Folder containing the document."),
  size: s.string("Provider-defined document size value."),
  size_width: s.string("Document width in inches as returned by Formstack Documents."),
  size_height: s.string("Document height in inches as returned by Formstack Documents."),
  active: s.string("Whether the document is active, represented by the upstream string flag."),
  url: s.url("Merge URL for the document."),
  html: s.string("HTML source when this is an HTML document."),
  fields: s.array("Merge fields found in the document.", s.looseObject("A document merge field.")),
});

const documentIdInputSchema = s.object("A Formstack Documents document identifier.", {
  document_id: s.nonEmptyString("Unique document identifier."),
});

const createDocumentInputSchema = s.object(
  "Parameters for creating a Formstack Documents template from HTML or a public file URL.",
  {
    name: s.nonEmptyString("Document name."),
    type: documentTypeSchema,
    output: documentOutputSchema,
    output_name: s.nonEmptyString("Custom filename template used for merged output."),
    folder: s.nonEmptyString("Folder name. Formstack Documents creates it when necessary."),
    html: s.nonEmptyString("HTML template source. Required when type is html."),
    file_url: s.url("Public URL of the template file. Required for non-HTML document types."),
    size_width: s.number("Document width in inches for an HTML template."),
    size_height: s.number("Document height in inches for an HTML template."),
  },
  { optional: ["output_name", "folder", "html", "file_url", "size_width", "size_height"] },
);

const updateDocumentInputSchema = s.object(
  "Fields to update on an existing Formstack Documents template.",
  {
    document_id: s.nonEmptyString("Unique document identifier."),
    name: s.nonEmptyString("New document name."),
    output: documentOutputSchema,
    output_name: s.nonEmptyString("New filename template used for merged output."),
    folder: s.nonEmptyString("New folder name."),
    html: s.nonEmptyString("New HTML template source for an HTML document."),
    file_url: s.url("Public URL of the replacement template file."),
    size_width: s.number("New document width in inches for an HTML template."),
    size_height: s.number("New document height in inches for an HTML template."),
  },
  {
    optional: ["name", "output", "output_name", "folder", "html", "file_url", "size_width", "size_height"],
  },
);

export const formstackDocumentsActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_documents",
    operationType: "read",
    description: "List Formstack Documents templates, optionally filtered by search text or folder.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters for listing Formstack Documents templates.",
      {
        search: s.nonEmptyString("Search term matched against documents."),
        folder: s.nonEmptyString("Folder name used to filter documents."),
      },
      { optional: ["search", "folder"] },
    ),
    outputSchema: s.object("A list of Formstack Documents templates.", {
      documents: s.array("Matching document templates.", documentSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_document",
    operationType: "read",
    description: "Get one Formstack Documents template by its document ID.",
    requiredScopes: [],
    inputSchema: documentIdInputSchema,
    outputSchema: s.object("A Formstack Documents template result.", { document: documentSchema }),
  }),
  defineProviderAction(service, {
    name: "get_document_fields",
    operationType: "read",
    description: "List merge fields detected in a Formstack Documents template.",
    requiredScopes: [],
    inputSchema: s.object(
      "Parameters for listing document merge fields.",
      {
        document_id: s.nonEmptyString("Unique document identifier."),
        attributes: s.boolean("Whether to include all available field attributes."),
      },
      { optional: ["attributes"] },
    ),
    outputSchema: s.object("Merge fields for a Formstack Documents template.", {
      fields: s.array("Document merge fields.", s.looseObject("A document merge field.")),
    }),
  }),
  defineProviderAction(service, {
    name: "create_document",
    operationType: "write",
    description: "Create a Formstack Documents template from HTML or a public file URL.",
    requiredScopes: [],
    inputSchema: createDocumentInputSchema,
    outputSchema: s.object("The created Formstack Documents template.", {
      document: documentSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "update_document",
    operationType: "write",
    description: "Update mutable fields or source content for a Formstack Documents template.",
    requiredScopes: [],
    inputSchema: updateDocumentInputSchema,
    outputSchema: s.object("The updated Formstack Documents template.", {
      document: documentSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "copy_document",
    operationType: "write",
    description: "Create a named copy of a Formstack Documents template.",
    requiredScopes: [],
    inputSchema: s.object("Parameters for copying a Formstack Documents template.", {
      document_id: s.nonEmptyString("Unique source document identifier."),
      name: s.nonEmptyString("Name for the copied document."),
    }),
    outputSchema: s.object("The copied Formstack Documents template.", {
      document: documentSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "delete_document",
    operationType: "destructive",
    description: "Delete a Formstack Documents template by its document ID.",
    requiredScopes: [],
    inputSchema: documentIdInputSchema,
    outputSchema: s.object("Deletion acknowledgement.", {
      deleted: s.boolean("Whether Formstack Documents confirmed deletion."),
      document_id: s.string("Identifier of the deleted document."),
    }),
  }),
];
