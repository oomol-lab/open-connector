import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "pdfless";

const workspaceSchema = s.object("Normalized workspace details returned by the Pdfless API.", {
  name: s.nullableString("The workspace name."),
  active: s.boolean("Whether the workspace is currently active."),
  createdAt: s.string("The ISO 8601 timestamp when the workspace was created."),
  updatedAt: s.nullableString("The ISO 8601 timestamp when the workspace was last updated."),
  quota: s.nullableInteger("The total quota available for the workspace."),
  remainingQuota: s.nullableInteger("The remaining quota available for the workspace."),
});

const documentTemplateSchema = s.object("A document template in the current Pdfless workspace.", {
  id: s.string("The unique identifier of the document template."),
  name: s.nullableString("The template name."),
  imagePreviewUrl: s.nullableString("The preview image URL for the document template."),
  pdfPreviewUrl: s.nullableString("The preview PDF URL for the document template."),
  createdAt: s.string("The ISO 8601 timestamp when the template was created."),
  updatedAt: s.nullableString("The ISO 8601 timestamp when the template was last updated."),
});

const paginationSchema = s.object("Pagination information returned with the template list when available.", {
  page: s.integer("The current page number."),
  pageSize: s.integer("The number of items per page."),
  totalItems: s.integer("The total number of document templates."),
  totalPages: s.integer("The total number of pages."),
});

const transitFileSchema = s.object(
  "A copy of the generated PDF in local transit storage, or null when transit storage is disabled.",
  {
    fileId: s.nonEmptyString("The local transit file identifier."),
    downloadUrl: s.url("The local URL for downloading the transit file."),
    sizeBytes: s.number("The transit file size in bytes."),
    name: s.nonEmptyString("The transit file name."),
    mimeType: s.nonEmptyString("The transit file MIME type."),
  },
);

export const pdflessActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_workspace",
    operationType: "read",
    description: "Get the current Pdfless workspace details resolved by the provided API key.",
    requiredScopes: [],
    inputSchema: s.object("No input parameters are required for this action.", {}),
    outputSchema: s.object("The normalized output payload for the get_workspace action.", {
      workspace: workspaceSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_document_templates",
    operationType: "read",
    description: "List document templates in the current Pdfless workspace with optional pagination.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for listing document templates.",
      {
        page: s.positiveInteger("The 1-based page number to request."),
        pageSize: s.positiveInteger("The number of templates to return per page."),
      },
      { optional: ["page", "pageSize"] },
    ),
    outputSchema: s.object(
      "The normalized output payload for the list_document_templates action.",
      {
        templates: s.array("The document templates returned for the requested page.", documentTemplateSchema),
        pagination: paginationSchema,
      },
      { optional: ["pagination"] },
    ),
  }),
  defineProviderAction(service, {
    name: "create_pdf",
    operationType: "write",
    description:
      "Generate a PDF from a Pdfless document template with JSON data. Returns a Pdfless download URL that expires 10 minutes after generation, plus a copy in local transit storage when it is enabled. Each call consumes one PDF of the workspace quota.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for generating a PDF from a document template.",
      {
        templateId: s.nonEmptyString("The document template ID (GUID), as returned by list_document_templates."),
        payload: s.looseObject(
          "JSON data for the template placeholders. Keys must match the variable names defined in the template.",
        ),
        referenceId: s.nonEmptyString(
          "The caller's own identifier for this PDF. Pdfless stores it and returns it in the response.",
        ),
        encryptionUserPassword: s.nonEmptyString(
          "When set, the PDF is encrypted and this password is required to open it.",
        ),
        encryptionOwnerPassword: s.nonEmptyString(
          "The permission password that lifts the restrictions set by the encryptionAllow* flags.",
        ),
        encryptionAllowPrinting: s.boolean("Whether an encrypted PDF may be printed."),
        encryptionAllowModifying: s.boolean("Whether an encrypted PDF may be modified."),
        encryptionAllowModifyAnnotations: s.boolean("Whether annotations in an encrypted PDF may be modified."),
        encryptionAllowContentCopying: s.boolean("Whether content of an encrypted PDF may be copied."),
        encryptionAllowScreenreaders: s.boolean("Whether screen readers may access the content of an encrypted PDF."),
        encryptionAllowFormFilling: s.boolean("Whether forms in an encrypted PDF may be filled."),
        encryptionAllowDocumentAssembly: s.boolean(
          "Whether pages of an encrypted PDF may be inserted, rotated, or deleted.",
        ),
      },
      {
        optional: [
          "payload",
          "referenceId",
          "encryptionUserPassword",
          "encryptionOwnerPassword",
          "encryptionAllowPrinting",
          "encryptionAllowModifying",
          "encryptionAllowModifyAnnotations",
          "encryptionAllowContentCopying",
          "encryptionAllowScreenreaders",
          "encryptionAllowFormFilling",
          "encryptionAllowDocumentAssembly",
        ],
      },
    ),
    outputSchema: s.object("The normalized output payload for the create_pdf action.", {
      templateId: s.nullableString("The ID of the document template used to generate the PDF."),
      referenceId: s.nullableString("The caller's own identifier for this PDF, when one was provided."),
      downloadUrl: s.url("The Pdfless URL for downloading the PDF. It expires 10 minutes after generation."),
      expiresAt: s.nullableString("The ISO 8601 timestamp when downloadUrl expires."),
      createdAt: s.nullableString("The ISO 8601 timestamp when the PDF was created."),
      transitFile: s.nullable(transitFileSchema),
    }),
  }),
];
