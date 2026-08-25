import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "formaloo";
const providerObjectSchema = s.looseObject("A Formaloo object with provider-defined fields.");
const fieldValuesSchema = s.record(
  "Form field values keyed by Formaloo field slug or alias.",
  s.unknown("A JSON-compatible field value accepted by the configured Formaloo field."),
);

const paginationInputProperties = {
  page: s.integer("Page number to request.", { minimum: 1 }),
  pageSize: s.integer("Number of results to return per page.", { minimum: 1 }),
};

const paginatedOutputProperties = {
  count: s.integer("Total number of matching records."),
  next: s.nullableString("URL of the next page, or null when this is the last page."),
  previous: s.nullableString("URL of the previous page, or null when this is the first page."),
  pageSize: s.integer("Number of records requested per page."),
  pageCount: s.integer("Total number of pages."),
  currentPage: s.integer("Current page number."),
};

const updateRowInputSchema = {
  ...s.object(
    "Row identifier and values to update.",
    {
      rowSlug: s.nonEmptyString("Unique slug of the submitted row."),
      values: fieldValuesSchema,
      rowTags: s.array("Replacement row tag slugs.", s.nonEmptyString("Row tag slug.")),
      status: s.string("Formaloo row status value."),
    },
    { optional: ["values", "rowTags", "status"] },
  ),
  minProperties: 2,
};

export const formalooActions: readonly ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_forms",
    description: "List forms created by or shared with the current Formaloo account.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters and pagination for listing Formaloo forms.",
      {
        ...paginationInputProperties,
        search: s.string("Search text matched against form titles and slugs."),
        category: s.string("Category slug used to filter forms."),
        tag: s.string("Tag slug used to filter forms."),
        sortBy: s.string("Comma-separated sort fields; prefix a field with a minus sign for descending order."),
      },
      { optional: ["page", "pageSize", "search", "category", "tag", "sortBy"] },
    ),
    outputSchema: s.object("A page of Formaloo forms.", {
      ...paginatedOutputProperties,
      forms: s.array("Forms returned for this page.", providerObjectSchema),
    }),
    followUpActions: ["formaloo.get_form"],
  }),
  defineProviderAction(service, {
    name: "get_form",
    description: "Retrieve Formaloo form settings, metadata, and field definitions by slug.",
    requiredScopes: [],
    inputSchema: s.object("The Formaloo form to retrieve.", {
      formSlug: s.nonEmptyString("Unique slug of the Formaloo form."),
    }),
    outputSchema: s.object("The requested Formaloo form.", { form: providerObjectSchema }),
    followUpActions: ["formaloo.list_rows", "formaloo.create_row"],
  }),
  defineProviderAction(service, {
    name: "list_rows",
    description: "List submitted rows for a Formaloo form with filters and pagination.",
    requiredScopes: [],
    inputSchema: s.object(
      "Form identifier, filters, and pagination for listing submitted rows.",
      {
        formSlug: s.nonEmptyString("Unique slug of the Formaloo form."),
        ...paginationInputProperties,
        search: s.string("Search text matched against searchable row data and row slug."),
        createdAt: s.string("Creation date filter in YYYY-MM-DD format.", { format: "date" }),
        updatedAt: s.string("Update date filter in YYYY-MM-DD format.", { format: "date" }),
        submitNumber: s.string("Submission number used to filter rows."),
        tags: s.string("Comma-separated row tag slugs used to filter rows."),
        trackingCode: s.string("Tracking code used to filter rows."),
        sortBy: s.string("Comma-separated sort fields; prefix a field with a minus sign for descending order."),
      },
      {
        optional: [
          "page",
          "pageSize",
          "search",
          "createdAt",
          "updatedAt",
          "submitNumber",
          "tags",
          "trackingCode",
          "sortBy",
        ],
      },
    ),
    outputSchema: s.object("A page of Formaloo rows.", {
      ...paginatedOutputProperties,
      rows: s.array("Rows returned for this page.", providerObjectSchema),
    }),
    followUpActions: ["formaloo.get_row"],
  }),
  defineProviderAction(service, {
    name: "get_row",
    description: "Retrieve one submitted Formaloo row by slug.",
    requiredScopes: [],
    inputSchema: s.object("The Formaloo row to retrieve.", {
      rowSlug: s.nonEmptyString("Unique slug of the submitted row."),
    }),
    outputSchema: s.object("The requested Formaloo row.", { row: providerObjectSchema }),
  }),
  defineProviderAction(service, {
    name: "create_row",
    description: "Submit JSON field values as a new row on a Formaloo form.",
    requiredScopes: [],
    inputSchema: s.object(
      "Form identifier and field values for a new submission.",
      {
        formSlug: s.nonEmptyString("Unique slug of the Formaloo form."),
        values: fieldValuesSchema,
        rowTags: s.array("Row tag slugs to attach to the submission.", s.nonEmptyString("Row tag slug.")),
        submitByAlias: s.boolean("Whether keys in values are field aliases instead of field slugs."),
        language: s.string("Language slug to associate with the submission."),
      },
      { optional: ["rowTags", "submitByAlias", "language"] },
    ),
    outputSchema: s.object("The newly submitted Formaloo row.", { row: providerObjectSchema }),
    followUpActions: ["formaloo.get_row"],
  }),
  defineProviderAction(service, {
    name: "update_row",
    description: "Update JSON field values or tags on an existing Formaloo row.",
    requiredScopes: [],
    inputSchema: updateRowInputSchema,
    outputSchema: s.object("The updated Formaloo row.", { row: providerObjectSchema }),
  }),
  defineProviderAction(service, {
    name: "delete_row",
    description: "Permanently delete a submitted Formaloo row.",
    requiredScopes: [],
    inputSchema: s.object("The Formaloo row to delete.", {
      rowSlug: s.nonEmptyString("Unique slug of the submitted row."),
    }),
    outputSchema: s.object("Formaloo deletion acknowledgement.", {
      status: s.integer("Status code returned in the Formaloo deletion response."),
      errors: s.looseObject("Error details returned by Formaloo, empty after a successful deletion."),
    }),
  }),
];
