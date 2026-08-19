import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "documenso";

const nullableStringSchema = s.nullable(s.string("The string value returned by Documenso."));
const nullableIntegerSchema = s.nullable(s.integer("The integer value returned by Documenso."));
const loosePayloadSchema = s.looseObject("The raw Documenso object payload.");

const paginationSchema = s.object("Documenso pagination metadata.", {
  count: s.integer("The total number of matching records."),
  currentPage: s.integer("The current page number returned by Documenso."),
  perPage: s.integer("The number of records requested for each page."),
  totalPages: s.integer("The total number of pages returned by Documenso."),
});

const envelopeSummarySchema = s.object("A compact Documenso envelope summary.", {
  id: s.string("The envelope ID."),
  type: s.stringEnum("The envelope type.", ["DOCUMENT", "TEMPLATE"]),
  status: s.stringEnum("The current envelope status.", ["DRAFT", "PENDING", "COMPLETED", "REJECTED", "CANCELLED"]),
  source: s.stringEnum("How the envelope was created.", ["DOCUMENT", "TEMPLATE", "TEMPLATE_DIRECT_LINK"]),
  title: s.string("The envelope title."),
  externalId: nullableStringSchema,
  createdAt: s.string("The timestamp when the envelope was created."),
  updatedAt: s.string("The timestamp when the envelope was last updated."),
  completedAt: nullableStringSchema,
  deletedAt: nullableStringSchema,
  templateId: nullableIntegerSchema,
  teamId: s.integer("The Documenso team ID that owns the envelope."),
  userId: s.integer("The Documenso user ID that owns the envelope."),
  folderId: nullableStringSchema,
  recipientCount: s.integer("The number of recipients included in the upstream payload."),
});

const templateSummarySchema = s.object("A compact Documenso template summary.", {
  id: s.integer("The template ID."),
  envelopeId: s.string("The envelope ID backing this template."),
  title: s.string("The template title."),
  type: s.stringEnum("The template type.", ["PUBLIC", "PRIVATE", "ORGANISATION"]),
  visibility: s.stringEnum("Who can see the template.", ["EVERYONE", "MANAGER_AND_ABOVE", "ADMIN"]),
  externalId: nullableStringSchema,
  createdAt: s.string("The timestamp when the template was created."),
  updatedAt: s.string("The timestamp when the template was last updated."),
  folderId: nullableStringSchema,
  teamId: s.integer("The Documenso team ID that owns the template."),
  userId: s.integer("The Documenso user ID that owns the template."),
  recipientCount: s.integer("The number of recipients included in the upstream payload."),
  fieldCount: s.integer("The number of fields included in the upstream payload."),
  directLinkEnabled: s.nullable(s.boolean("Whether direct links are enabled for the template.")),
});

export const documensoActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_envelopes",
    description: "Find Documenso envelopes by query, status, type, source, template, folder, and pagination filters.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters and pagination options for finding Documenso envelopes.",
      {
        query: s.string("The search query.", { minLength: 1 }),
        page: s.integer("The pagination page number. Documenso pages start at 1.", { minimum: 1 }),
        perPage: s.integer("The number of envelopes to return per page.", {
          minimum: 1,
          maximum: 100,
        }),
        type: s.stringEnum("Filter envelopes by type.", ["DOCUMENT", "TEMPLATE"]),
        templateId: s.integer("Filter envelopes by the template ID used to create them.", { minimum: 1 }),
        source: s.stringEnum("Filter envelopes by how they were created.", [
          "DOCUMENT",
          "TEMPLATE",
          "TEMPLATE_DIRECT_LINK",
        ]),
        status: s.stringEnum("Filter envelopes by the current status.", [
          "DRAFT",
          "PENDING",
          "COMPLETED",
          "REJECTED",
          "CANCELLED",
        ]),
        folderId: s.string("Filter envelopes by folder ID.", { minLength: 1 }),
        orderByColumn: s.stringEnum("The envelope column to sort by.", ["createdAt"]),
        orderByDirection: s.stringEnum("The envelope sort direction.", ["asc", "desc"]),
      },
      {
        optional: [
          "query",
          "page",
          "perPage",
          "type",
          "templateId",
          "source",
          "status",
          "folderId",
          "orderByColumn",
          "orderByDirection",
        ],
      },
    ),
    outputSchema: s.object("The normalized Documenso envelope list.", {
      envelopes: s.array("The envelopes returned by Documenso.", envelopeSummarySchema),
      pagination: paginationSchema,
      raw: loosePayloadSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_envelope",
    description: "Retrieve one Documenso envelope by envelope ID.",
    requiredScopes: [],
    inputSchema: s.object("The input for retrieving one Documenso envelope.", {
      envelopeId: s.string("The Documenso envelope ID.", { minLength: 1 }),
    }),
    outputSchema: s.object("The normalized Documenso envelope.", {
      envelope: envelopeSummarySchema,
      raw: loosePayloadSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_templates",
    description: "Find Documenso templates by query, type, folder, and pagination filters.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters and pagination options for finding Documenso templates.",
      {
        query: s.string("The search query.", { minLength: 1 }),
        page: s.integer("The pagination page number. Documenso pages start at 1.", { minimum: 1 }),
        perPage: s.integer("The number of templates to return per page.", {
          minimum: 1,
          maximum: 100,
        }),
        type: s.stringEnum("Filter templates by type.", ["PUBLIC", "PRIVATE", "ORGANISATION"]),
        folderId: s.string("Filter templates by folder ID.", { minLength: 1 }),
      },
      { optional: ["query", "page", "perPage", "type", "folderId"] },
    ),
    outputSchema: s.object("The normalized Documenso template list.", {
      templates: s.array("The templates returned by Documenso.", templateSummarySchema),
      pagination: paginationSchema,
      raw: loosePayloadSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_template",
    description: "Retrieve one Documenso template by template ID.",
    requiredScopes: [],
    inputSchema: s.object("The input for retrieving one Documenso template.", {
      templateId: s.integer("The Documenso template ID.", { minimum: 1 }),
    }),
    outputSchema: s.object("The normalized Documenso template.", {
      template: templateSummarySchema,
      raw: loosePayloadSchema,
    }),
  }),
];
