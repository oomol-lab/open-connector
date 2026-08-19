import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "knack";

const knackObjectKeySchema = s.nonEmptyString(
  "The Knack object key, such as object_1, that identifies which object to query.",
);
const knackRecordIdSchema = s.nonEmptyString(
  "The Knack record ID, such as 6838de4ef4d2453c4d1b402f, that identifies one record.",
);
const knackFormatSchema = s.stringEnum("The Knack response format query parameter forwarded to the API.", [
  "html",
  "raw",
  "both",
]);
const knackSortOrderSchema = s.stringEnum("The Knack sort order applied to the selected sort field.", ["asc", "desc"]);
const knackRecordSchema = s.looseObject(
  "A Knack record payload containing field_xx keys and any nested data returned by the API.",
);

const listRecordsInputSchema = s.object(
  "Request parameters for listing records from one Knack object.",
  {
    objectKey: knackObjectKeySchema,
    page: s.positiveInteger("The 1-based page number to request from Knack."),
    rowsPerPage: s.integer("The number of records to request per page, from 1 to 1000.", {
      minimum: 1,
      maximum: 1000,
    }),
    format: knackFormatSchema,
    sortField: s.nonEmptyString("The Knack field key used for server-side sorting, such as field_25."),
    sortOrder: knackSortOrderSchema,
    filters: s.looseObject("The Knack filters JSON object forwarded to the filters query parameter as-is."),
  },
  { optional: ["page", "rowsPerPage", "format", "sortField", "sortOrder", "filters"] },
);

const getRecordInputSchema = s.object(
  "Request parameters for reading one Knack record by object key and record ID.",
  {
    objectKey: knackObjectKeySchema,
    recordId: knackRecordIdSchema,
    format: knackFormatSchema,
  },
  { optional: ["format"] },
);

const createRecordInputSchema = s.object(
  "Request parameters for creating one Knack record in the selected object.",
  {
    objectKey: knackObjectKeySchema,
    format: knackFormatSchema,
    record: knackRecordSchema,
  },
  { optional: ["format"] },
);

const updateRecordInputSchema = s.object(
  "Request parameters for updating one Knack record in the selected object.",
  {
    objectKey: knackObjectKeySchema,
    recordId: knackRecordIdSchema,
    format: knackFormatSchema,
    record: knackRecordSchema,
  },
  { optional: ["format"] },
);

const deleteRecordInputSchema = s.object(
  "Request parameters for deleting one Knack record by object key and record ID.",
  {
    objectKey: knackObjectKeySchema,
    recordId: knackRecordIdSchema,
  },
);

const listRecordsOutputSchema = s.object("The normalized Knack record list returned by the connector.", {
  records: s.array("The records returned by the current Knack list request.", knackRecordSchema),
  currentPage: s.nullable(s.integer("The current Knack response page when the API includes pagination metadata.")),
  totalPages: s.nullable(s.integer("The total number of available Knack pages when returned by the API.")),
  totalRecords: s.nullable(s.integer("The total number of Knack records that match the current query.")),
  raw: s.looseObject("The raw Knack list response envelope returned by the API."),
});

const recordOutputSchema = s.object("The normalized Knack single-record response.", {
  record: knackRecordSchema,
});

const deleteRecordOutputSchema = s.object("The normalized Knack record deletion response.", {
  deleted: s.boolean("Whether the Knack delete request completed successfully."),
  recordId: knackRecordIdSchema,
  raw: s.nullable(s.looseObject("The raw Knack delete response payload when the API returned a JSON body.")),
});

export const knackActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_records",
    description:
      "List records from one Knack object with optional pagination, sorting, formatting, and filter query parameters.",
    requiredScopes: [],
    followUpActions: ["knack.get_record", "knack.create_record"],
    inputSchema: listRecordsInputSchema,
    outputSchema: listRecordsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_record",
    description: "Retrieve one Knack record by object key and record ID.",
    requiredScopes: [],
    followUpActions: ["knack.update_record", "knack.delete_record"],
    inputSchema: getRecordInputSchema,
    outputSchema: recordOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_record",
    description: "Create one Knack record in the selected object with a raw JSON record payload.",
    requiredScopes: [],
    followUpActions: ["knack.get_record", "knack.update_record"],
    inputSchema: createRecordInputSchema,
    outputSchema: recordOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_record",
    description: "Update one Knack record by sending a partial JSON payload for the selected object and record ID.",
    requiredScopes: [],
    followUpActions: ["knack.get_record"],
    inputSchema: updateRecordInputSchema,
    outputSchema: recordOutputSchema,
  }),
  defineProviderAction(service, {
    name: "delete_record",
    description: "Delete one Knack record by object key and record ID.",
    requiredScopes: [],
    inputSchema: deleteRecordInputSchema,
    outputSchema: deleteRecordOutputSchema,
  }),
];
