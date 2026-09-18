import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "workiom";

const idSchema = s.nonEmptyString("The Workiom UUID value.");
const rawRecordSchema = s.looseObject("The raw Workiom object.");
const expandSchema = s.array(
  "The list metadata sections to expand.",
  s.stringEnum("One metadata section accepted by Workiom.", ["Fields", "Views", "Filters"]),
  { minItems: 1 },
);
const filterValueSchema = s.anyOf("The value to compare in a Workiom record filter.", [
  s.string("The string filter value."),
  s.integer("The integer filter value."),
  s.number("The numeric filter value."),
  s.boolean("The boolean filter value."),
  s.array("The string values for In or NotIn filters.", s.string("One string filter value.")),
  s.array("The integer values for In or NotIn filters.", s.integer("One integer filter value.")),
]);
const filterSchema = s.object("One Workiom record filter.", {
  fieldId: s.integer("The numeric field ID to filter on."),
  operator: s.integer("The Workiom filter operator code such as 1 for Contains, 3 for Is, or 12 for In.", {
    minimum: 1,
    maximum: 13,
  }),
  value: filterValueSchema,
});
const appSchema = s.looseRequiredObject(
  "A Workiom app returned by the API.",
  {
    id: s.string("The Workiom app ID."),
    name: s.string("The Workiom app name."),
  },
  { optional: ["name"] },
);
const listSchema = s.looseRequiredObject(
  "A Workiom list returned by the API.",
  {
    id: s.string("The Workiom list ID."),
    name: s.string("The Workiom list name."),
    appId: s.string("The Workiom app ID that owns the list."),
  },
  { optional: ["name", "appId"] },
);
const listMetadataSchema = s.looseRequiredObject(
  "Workiom list metadata with fields, views, and filters when expanded.",
  {
    id: s.string("The Workiom list ID."),
    name: s.string("The Workiom list name."),
    appId: s.string("The Workiom app ID that owns the list."),
    fields: s.array("The fields configured on the list.", rawRecordSchema),
    views: s.array("The views configured on the list.", rawRecordSchema),
    filters: s.array("The filters configured on the list.", rawRecordSchema),
  },
  { optional: ["name", "appId", "fields", "views", "filters"] },
);

export const workiomActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_apps",
    operationType: "read",
    description: "List Workiom apps available to the connected API key.",
    inputSchema: s.actionInput({}, [], "The input payload for listing Workiom apps."),
    outputSchema: s.actionOutput(
      {
        apps: s.array("The Workiom apps returned by the API.", appSchema),
        raw: s.looseObject("The raw Workiom response payload."),
      },
      "The response returned when listing Workiom apps.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_lists",
    operationType: "read",
    description: "List Workiom lists in an app.",
    inputSchema: s.actionInput({ appId: idSchema }, ["appId"], "The input payload for listing Workiom lists."),
    outputSchema: s.actionOutput(
      {
        lists: s.array("The Workiom lists returned by the API.", listSchema),
        totalCount: s.nullableInteger("The total number of Workiom lists when present."),
        raw: s.looseObject("The raw Workiom response payload."),
      },
      "The response returned when listing Workiom lists.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_list_metadata",
    operationType: "read",
    description: "Get Workiom list metadata including fields, views, or filters.",
    inputSchema: s.actionInput(
      {
        listId: idSchema,
        expand: expandSchema,
      },
      ["listId"],
      "The input payload for retrieving Workiom list metadata.",
    ),
    outputSchema: s.actionOutput(
      {
        list: listMetadataSchema,
        raw: s.looseObject("The raw Workiom response payload."),
      },
      "The response returned when retrieving Workiom list metadata.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_records",
    operationType: "read",
    description: "List records from a Workiom list with optional filters, sorting, and pagination.",
    inputSchema: s.actionInput(
      {
        listId: idSchema,
        filters: s.array("The filters to apply to the record query.", filterSchema),
        sorting: s.nonEmptyString("The Workiom sorting expression such as '11284 ASC'."),
        skipCount: s.nonNegativeInteger("The number of records to skip for pagination."),
        maxResultCount: s.positiveInteger("The maximum number of records to return."),
      },
      ["listId"],
      "The input payload for listing Workiom records.",
    ),
    outputSchema: s.actionOutput(
      {
        records: s.array("The record objects returned by Workiom.", rawRecordSchema),
        totalCount: s.nullableInteger("The total matching record count when present."),
        summary: s.nullable(s.looseObject("The Workiom summary object when present.")),
        raw: s.looseObject("The raw Workiom response payload."),
      },
      "The response returned when listing Workiom records.",
    ),
  }),
  defineProviderAction(service, {
    name: "create_record",
    operationType: "write",
    description: "Create a record in a Workiom list from a JSON object keyed by field ID.",
    inputSchema: s.actionInput(
      {
        listId: idSchema,
        record: s.looseObject(
          "The record field values keyed by Workiom field ID, using values that match each field type.",
        ),
      },
      ["listId", "record"],
      "The input payload for creating a Workiom record.",
    ),
    outputSchema: s.actionOutput(
      {
        record: rawRecordSchema,
        raw: s.looseObject("The raw Workiom response payload."),
      },
      "The response returned after creating a Workiom record.",
    ),
  }),
];
