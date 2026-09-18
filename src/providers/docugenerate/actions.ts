import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "docugenerate";

const outputFormatValues = [
  ".docx",
  ".doc",
  ".odt",
  ".txt",
  ".html",
  ".png",
  ".pdf",
  ".pdf/a-1b",
  ".pdf/a-2b",
  ".pdf/a-3b",
];

const mergeDataItemSchema = s.looseObject("One JSON object whose keys match merge tags in the DocuGenerate template.");
const mergeDataSchema = s.anyOf("The JSON merge data used to generate one or more documents.", [
  mergeDataItemSchema,
  s.array("A non-empty list of JSON merge-data objects.", mergeDataItemSchema, { minItems: 1 }),
]);

const delimitersSchema = s.actionOutput(
  {
    left: s.string("The left delimiter for template tags."),
    right: s.string("The right delimiter for template tags."),
  },
  "The delimiters used to identify template tags.",
);

const tagsSchema = s.actionOutput(
  {
    valid: s.array(
      "The valid template tags, including strings or nested tag structures.",
      s.unknown("A string tag or nested tag structure returned by DocuGenerate."),
    ),
    invalid: s.array("The invalid or unclosed template tags.", s.string("An invalid template tag.")),
  },
  "The valid and invalid tags extracted from the template.",
);

const templateSchema = s.actionOutput(
  {
    id: s.string("The template ID."),
    created: s.number("The template creation time in Unix epoch milliseconds."),
    updated: s.number("The template update time in Unix epoch milliseconds."),
    name: s.string("The template name."),
    pageCount: s.number("The number of pages in the template."),
    delimiters: delimitersSchema,
    tags: tagsSchema,
    filename: s.string("The filename of the uploaded template file."),
    format: s.string("The format of the uploaded template file."),
    region: s.stringEnum("The storage region for the template and new documents.", ["us", "eu", "uk", "au"]),
    templateUrl: s.url("The download URL for the uploaded template file."),
    previewUrl: s.url("The download URL for the template PDF preview."),
    imageUrl: s.url("The download URL for the first-page template image."),
    enhancedSyntax: s.boolean("Whether enhanced template syntax is enabled."),
    versioningEnabled: s.boolean("Whether template file versioning is enabled."),
    folder: s.array(
      "The ordered template folder path from root to leaf.",
      s.string("One folder name in the template path."),
      {
        maxItems: 100,
      },
    ),
  },
  "A connector-normalized DocuGenerate template.",
);

const documentSchema = s.actionOutput(
  {
    id: s.string("The document ID."),
    templateId: s.string("The ID of the template used to generate the document."),
    created: s.number("The document creation time in Unix epoch milliseconds."),
    name: s.string("The logical document name."),
    dataLength: s.number("The number of merge-data objects used to generate the document."),
    filename: s.string("The generated document filename."),
    format: s.string("The generated document format."),
    documentUrl: s.url("The download URL for the generated document."),
  },
  "A connector-normalized DocuGenerate document.",
);

export const docugenerateActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_templates",
    operationType: "read",
    description: "List DocuGenerate templates, optionally filtered by an exact folder path.",
    inputSchema: s.actionInput(
      {
        folder: s.array("The ordered folder path from root to leaf.", s.nonEmptyString("One non-empty folder name."), {
          maxItems: 100,
        }),
      },
      [],
      "The optional folder filter for listing DocuGenerate templates.",
    ),
    outputSchema: s.actionOutput(
      {
        templates: s.array("The matching templates.", templateSchema),
      },
      "The DocuGenerate templates returned by the query.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_template",
    operationType: "read",
    description: "Retrieve one DocuGenerate template by template ID.",
    inputSchema: s.actionInput(
      {
        templateId: s.nonEmptyString("The DocuGenerate template ID."),
      },
      ["templateId"],
      "The input for retrieving one DocuGenerate template.",
    ),
    outputSchema: s.actionOutput(
      {
        template: templateSchema,
      },
      "The requested DocuGenerate template.",
    ),
  }),
  defineProviderAction(service, {
    name: "generate_document",
    operationType: "write",
    description:
      "Generate and store a DocuGenerate document from a template and JSON merge data, returning a download URL.",
    inputSchema: s.actionInput(
      {
        templateId: s.nonEmptyString("The ID of the template used to generate the document."),
        data: mergeDataSchema,
        name: s.nonEmptyString("The logical name used to identify the generated document."),
        outputName: s.nonEmptyString("The generated filename without its extension."),
        outputFormat: s.stringEnum("The generated document format.", outputFormatValues),
        outputQuality: s.integer("The output quality for PDF, PDF/A, or PNG generation, from 1 through 100.", {
          minimum: 1,
          maximum: 100,
        }),
        singleFile: s.boolean("Whether multiple merge-data objects are combined into one output file."),
        pageBreak: s.boolean("Whether to insert a page break after each merge-data object in a combined output."),
      },
      ["templateId", "data"],
      "The template, JSON merge data, and output options for generating a stored document.",
    ),
    outputSchema: s.actionOutput(
      {
        document: documentSchema,
      },
      "The stored document generated by DocuGenerate.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_documents",
    operationType: "read",
    description: "List all DocuGenerate documents generated from one template.",
    inputSchema: s.actionInput(
      {
        templateId: s.nonEmptyString("The ID of the template used to generate the documents."),
      },
      ["templateId"],
      "The template filter for listing generated documents.",
    ),
    outputSchema: s.actionOutput(
      {
        documents: s.array("The generated documents.", documentSchema),
      },
      "The documents generated from the selected template.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_document",
    operationType: "read",
    description: "Retrieve one generated DocuGenerate document by document ID.",
    inputSchema: s.actionInput(
      {
        documentId: s.nonEmptyString("The DocuGenerate document ID."),
      },
      ["documentId"],
      "The input for retrieving one generated document.",
    ),
    outputSchema: s.actionOutput(
      {
        document: documentSchema,
      },
      "The requested generated document.",
    ),
  }),
  defineProviderAction(service, {
    name: "update_document",
    operationType: "write",
    description: "Rename one generated DocuGenerate document by document ID.",
    inputSchema: s.actionInput(
      {
        documentId: s.nonEmptyString("The DocuGenerate document ID."),
        name: s.nonEmptyString("The new logical document name."),
      },
      ["documentId", "name"],
      "The document ID and replacement logical name.",
    ),
    outputSchema: s.actionOutput(
      {
        document: documentSchema,
      },
      "The renamed generated document.",
    ),
  }),
  defineProviderAction(service, {
    name: "delete_document",
    operationType: "destructive",
    description: "Permanently delete one generated DocuGenerate document by document ID.",
    inputSchema: s.actionInput(
      {
        documentId: s.nonEmptyString("The DocuGenerate document ID."),
      },
      ["documentId"],
      "The input for deleting one generated document.",
    ),
    outputSchema: s.actionOutput(
      {
        deleted: s.boolean("Whether the document was deleted."),
        documentId: s.string("The deleted DocuGenerate document ID."),
      },
      "Confirmation that DocuGenerate deleted the document.",
    ),
  }),
];
