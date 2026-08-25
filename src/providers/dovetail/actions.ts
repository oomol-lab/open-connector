import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "dovetail";

const tokenSchema = s.object("Dovetail token metadata.", {
  id: s.nonEmptyString("Unique identifier of the current Dovetail personal API key."),
  subdomain: s.nonEmptyString("Workspace subdomain associated with the current API key."),
});

const pageInputSchema = {
  startCursor: s.nonEmptyString("Cursor returned by the previous page."),
  limit: s.integer("Maximum number of records to return, from 0 to 100.", { minimum: 0, maximum: 100 }),
  sort: s.stringEnum("Single Dovetail sort instruction.", [
    "created_at:asc",
    "created_at:desc",
    "title:asc",
    "title:desc",
  ]),
  titleContains: s.nonEmptyString("Case-insensitive substring used to filter Dovetail titles."),
};

const dataItemSchema = s.looseObject("Dovetail data payload.");
const projectSchema = s.looseObject("Dovetail project payload.");
const nullableCursorSchema = s.nullable(s.string("Cursor value for the next page."));

const dataFieldSchema = s.object("One Dovetail data field value.", {
  label: s.nonEmptyString("Field label defined in Dovetail."),
  value: s.union(
    [
      s.string("String field value."),
      s.boolean("Boolean field value."),
      s.number("Numeric field value."),
      s.array("Array field value.", s.string("String item inside the Dovetail field value array.")),
      { type: "null", description: "Null field value." },
    ],
    { description: "Supported Dovetail field value." },
  ),
});

export const dovetailActions: readonly ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_token_info",
    description: "Get metadata for the current Dovetail personal API key.",
    inputSchema: s.object("Input parameters for reading the current Dovetail token metadata.", {}),
    outputSchema: s.object("Dovetail token metadata response wrapper.", {
      token: tokenSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_projects",
    description: "List Dovetail projects with pagination and title filtering.",
    inputSchema: s.object("Input parameters for listing Dovetail projects.", pageInputSchema, {
      optional: ["startCursor", "limit", "sort", "titleContains"],
    }),
    outputSchema: s.object("Dovetail projects collection response wrapper.", {
      projects: s.array("Dovetail projects returned for the current page.", projectSchema),
      totalCount: s.number("Total number of matching Dovetail projects."),
      hasMore: s.boolean("Whether another Dovetail projects page is available."),
      nextCursor: nullableCursorSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_data",
    description: "List Dovetail data records with pagination and common filters.",
    inputSchema: s.object(
      "Input parameters for listing Dovetail data records.",
      {
        ...pageInputSchema,
        projectId: s.nonEmptyString("Project identifier used to filter Dovetail data."),
        createdAtGte: s.dateTime("ISO 8601 timestamp used to filter Dovetail records."),
        createdAtLte: s.dateTime("ISO 8601 timestamp used to filter Dovetail records."),
      },
      { optional: ["startCursor", "limit", "sort", "titleContains", "projectId", "createdAtGte", "createdAtLte"] },
    ),
    outputSchema: s.object("Dovetail data collection response wrapper.", {
      dataItems: s.array("Dovetail data records returned for the page.", dataItemSchema),
      totalCount: s.number("Total number of matching Dovetail data records."),
      hasMore: s.boolean("Whether another Dovetail data page is available."),
      nextCursor: nullableCursorSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_data",
    description: "Get one Dovetail data record by identifier.",
    inputSchema: s.object("Input parameters for reading one Dovetail data record.", {
      dataId: s.nonEmptyString("Unique identifier of the Dovetail data record."),
    }),
    outputSchema: s.object("Dovetail single data response wrapper.", {
      dataItem: dataItemSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "create_data",
    description: "Create a Dovetail data record inside a specific project.",
    inputSchema: s.object(
      "Input parameters for creating a Dovetail data record.",
      {
        projectId: s.nonEmptyString("Unique identifier of the Dovetail project that owns the data."),
        title: s.nonEmptyString("Title to assign to the new Dovetail data record."),
        content: s.nonEmptyString("Initial plain text or HTML content to store in the new Dovetail data record."),
        fields: s.array("Structured fields to attach to the data.", dataFieldSchema),
      },
      { optional: ["title", "content", "fields"] },
    ),
    outputSchema: s.object("Dovetail data creation response wrapper.", {
      dataItem: dataItemSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "update_data",
    description: "Update the title or fields of a Dovetail data record.",
    inputSchema: s.object(
      "Input parameters for updating a Dovetail data record.",
      {
        dataId: s.nonEmptyString("Unique identifier of the Dovetail data record."),
        title: s.nonEmptyString("Updated title for the Dovetail data record."),
        fields: s.array("Replacement fields for the data record.", dataFieldSchema),
      },
      { optional: ["title", "fields"] },
    ),
    outputSchema: s.object("Dovetail data update response wrapper.", {
      dataItem: dataItemSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "export_data",
    description: "Export a Dovetail data record in HTML or Markdown format.",
    inputSchema: s.object("Input parameters for exporting a Dovetail data record.", {
      dataId: s.nonEmptyString("Unique identifier of the Dovetail data record."),
      format: s.stringEnum("Export format requested from Dovetail.", ["html", "markdown"]),
    }),
    outputSchema: s.object("Dovetail data export response wrapper.", {
      exportedData: s.looseObject("Exported Dovetail data payload with either HTML or Markdown content."),
    }),
  }),
];
