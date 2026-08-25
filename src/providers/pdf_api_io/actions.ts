import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "pdf_api_io";

const variableSchema = s.object("One template variable entry returned by PDF-API.io.", {
  name: s.nonEmptyString("The placeholder or variable name used in the template."),
  type: s.nonEmptyString("The upstream variable type reported by PDF-API.io."),
});

const metaSchema = s.nullable(s.looseObject("Template metadata returned by PDF-API.io when available."));

const templateSummarySchema = s.object("A PDF-API.io template summary.", {
  id: s.nonEmptyString("The template identifier."),
  name: s.nonEmptyString("The template display name."),
  type: s.nonEmptyString("The upstream template type such as editor or html."),
  createdAt: s.nonEmptyString("The ISO 8601 timestamp when the template was created."),
  meta: metaSchema,
  variables: s.array("The variables that can be substituted when rendering the template.", variableSchema),
});

const templateDetailSchema = s.object("A detailed PDF-API.io template payload.", {
  ...(templateSummarySchema.properties as Record<string, unknown>),
  teamName: s.nonEmptyString("The team name that owns the template."),
  teamId: s.nonEmptyString("The team identifier that owns the template."),
});

const transitFileSchema = s.object("A copy of a provider-generated file stored in local transit storage.", {
  fileId: s.nonEmptyString("The local transit file identifier."),
  downloadUrl: s.url("The local URL for downloading the transit file."),
  sizeBytes: s.number("The transit file size in bytes."),
  name: s.nonEmptyString("The transit file name."),
  mimeType: s.nonEmptyString("The transit file MIME type."),
});

export const pdfApiIoActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_templates",
    description: "List the PDF-API.io templates accessible to the provided API token.",
    requiredScopes: [],
    inputSchema: s.object("No input parameters are required for this action.", {}),
    outputSchema: s.object("The normalized output payload for the list_templates action.", {
      templates: s.array("The templates returned by PDF-API.io for the current account.", templateSummarySchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_template",
    description: "Get one PDF-API.io template by template ID, including team and variable details.",
    requiredScopes: [],
    inputSchema: s.object("Input parameters for retrieving one PDF-API.io template.", {
      templateId: s.nonEmptyString("The template identifier to retrieve."),
    }),
    outputSchema: s.object("The normalized output payload for the get_template action.", {
      template: templateDetailSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "render_pdf",
    description: "Render one PDF-API.io template with JSON data and return the temporary hosted PDF URL.",
    requiredScopes: [],
    inputSchema: s.object("Input parameters for rendering a PDF-API.io template to a hosted PDF URL.", {
      templateId: s.nonEmptyString("The template identifier used to generate the PDF."),
      data: s.looseObject("The key-value payload used to replace placeholders in the template."),
    }),
    outputSchema: s.object("The normalized output payload for the render_pdf action.", {
      fileUrl: s.nonEmptyString("The temporary PDF download URL returned by PDF-API.io."),
      transitFile: s.nullable(transitFileSchema),
    }),
  }),
];
