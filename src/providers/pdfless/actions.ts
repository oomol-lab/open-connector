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

export const pdflessActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_workspace",
    description: "Get the current Pdfless workspace details resolved by the provided API key.",
    requiredScopes: [],
    inputSchema: s.object("No input parameters are required for this action.", {}),
    outputSchema: s.object("The normalized output payload for the get_workspace action.", {
      workspace: workspaceSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_document_templates",
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
];
