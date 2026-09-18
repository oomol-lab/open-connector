import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "infolobby" as const;

const positiveIdSchema = (description: string) => s.integer(description, { minimum: 1 });
const jsonValueSchema = s.unknown("A JSON-encodable InfoLobby field or filter value.");
const dataSchema = s.record("Record field values keyed by InfoLobby field id.", jsonValueSchema);
const rawObjectSchema = s.looseObject("The object returned by InfoLobby.");
const filterSchema = s.object(
  "One InfoLobby record query filter.",
  {
    column: s.nonEmptyString("The field id to filter."),
    field: s.nonEmptyString("An alternative field id to filter."),
    compare: s.nonEmptyString("The documented comparison operator or alias."),
    value: jsonValueSchema,
    connector: s.stringEnum("How this filter joins the preceding filter.", ["AND", "OR"]),
  },
  { optional: ["column", "field", "value", "connector"] },
);
const queryFields = {
  fields: s.array("The field ids to include in query rows.", s.nonEmptyString("One field id."), {
    minItems: 1,
  }),
  where: s.record("Simple equality or comparison filters keyed by field id.", jsonValueSchema),
  filters: s.array("The explicit filters applied to records.", filterSchema, { minItems: 1 }),
  search: s.nonEmptyString("A case-insensitive search term applied across selected fields."),
  viewId: s.integer("The saved view id, or 0 for the synthesized default view.", { minimum: 0 }),
} as const;

const listSpacesAction = defineProviderAction(service, {
  name: "list_spaces",
  operationType: "read",
  description: "List InfoLobby workspaces accessible to the connected API key.",
  inputSchema: s.requiredObject("The input for listing accessible InfoLobby workspaces.", {}),
  outputSchema: s.requiredObject("The accessible InfoLobby workspaces.", {
    spaces: s.array("The workspaces returned by InfoLobby.", rawObjectSchema),
  }),
});

const getSpaceAction = defineProviderAction(service, {
  name: "get_space",
  operationType: "read",
  description: "Get storage-oriented metadata for one InfoLobby workspace.",
  inputSchema: s.requiredObject("The input for retrieving an InfoLobby workspace.", {
    spaceId: positiveIdSchema("The InfoLobby workspace id."),
  }),
  outputSchema: s.requiredObject("The requested InfoLobby workspace.", { space: rawObjectSchema }),
});

const listTablesAction = defineProviderAction(service, {
  name: "list_tables",
  operationType: "read",
  description: "List tables in an InfoLobby workspace.",
  inputSchema: s.requiredObject("The input for listing InfoLobby tables.", {
    spaceId: positiveIdSchema("The InfoLobby workspace id."),
  }),
  outputSchema: s.requiredObject("The InfoLobby tables in the workspace.", {
    tables: s.array("The tables returned by InfoLobby.", rawObjectSchema),
  }),
});

const getTableAction = defineProviderAction(service, {
  name: "get_table",
  operationType: "read",
  description: "Get an InfoLobby table and its field schema.",
  inputSchema: s.requiredObject("The input for retrieving an InfoLobby table schema.", {
    tableId: positiveIdSchema("The InfoLobby table id."),
  }),
  outputSchema: s.requiredObject("The requested InfoLobby table and field schema.", {
    table: rawObjectSchema,
  }),
});

const createRecordAction = defineProviderAction(service, {
  name: "create_record",
  operationType: "write",
  description: "Create a record in an InfoLobby table.",
  inputSchema: s.requiredObject("The input for creating an InfoLobby record.", {
    tableId: positiveIdSchema("The InfoLobby table id."),
    data: dataSchema,
  }),
  outputSchema: s.requiredObject("The record created by InfoLobby.", { record: rawObjectSchema }),
});

const getRecordAction = defineProviderAction(service, {
  name: "get_record",
  operationType: "read",
  description: "Get one InfoLobby record with typed field values.",
  inputSchema: s.requiredObject("The input for retrieving an InfoLobby record.", {
    tableId: positiveIdSchema("The InfoLobby table id."),
    recordId: positiveIdSchema("The InfoLobby record id."),
  }),
  outputSchema: s.requiredObject("The requested InfoLobby record.", { record: rawObjectSchema }),
});

const updateRecordAction = defineProviderAction(service, {
  name: "update_record",
  operationType: "write",
  description: "Update selected fields on an InfoLobby record.",
  inputSchema: s.requiredObject("The input for updating an InfoLobby record.", {
    tableId: positiveIdSchema("The InfoLobby table id."),
    recordId: positiveIdSchema("The InfoLobby record id."),
    data: dataSchema,
  }),
  outputSchema: s.requiredObject("The record updated by InfoLobby.", { record: rawObjectSchema }),
});

const deleteRecordAction = defineProviderAction(service, {
  name: "delete_record",
  operationType: "destructive",
  description: "Delete one InfoLobby record.",
  inputSchema: s.requiredObject("The input for deleting an InfoLobby record.", {
    tableId: positiveIdSchema("The InfoLobby table id."),
    recordId: positiveIdSchema("The InfoLobby record id."),
  }),
  outputSchema: s.requiredObject("The response returned after deleting the InfoLobby record.", {
    result: s.unknown("The JSON response returned by the delete endpoint."),
  }),
});

const queryRecordsAction = defineProviderAction(service, {
  name: "query_records",
  operationType: "read",
  description: "Query and page through flat InfoLobby table rows.",
  inputSchema: s.object(
    "The input for querying InfoLobby records.",
    {
      tableId: positiveIdSchema("The InfoLobby table id."),
      ...queryFields,
      orderBy: s.nonEmptyString("The field id used to sort query rows."),
      orderDir: s.stringEnum("The InfoLobby ascending or descending sort direction.", ["A", "D"]),
      limit: s.integer("The maximum number of rows to return.", { minimum: 1, maximum: 1000 }),
      offset: s.integer("The zero-based row offset.", { minimum: 0 }),
    },
    {
      optional: ["fields", "where", "filters", "search", "viewId", "orderBy", "orderDir", "limit", "offset"],
    },
  ),
  outputSchema: s.requiredObject("The flat rows returned by InfoLobby.", {
    records: s.array("The flat stored-value rows returned by InfoLobby.", rawObjectSchema),
  }),
});

const countRecordsAction = defineProviderAction(service, {
  name: "count_records",
  operationType: "read",
  description: "Count InfoLobby records matching filters, search, or a saved view.",
  inputSchema: s.object(
    "The input for counting InfoLobby records.",
    {
      tableId: positiveIdSchema("The InfoLobby table id."),
      where: queryFields.where,
      filters: queryFields.filters,
      search: queryFields.search,
      viewId: queryFields.viewId,
    },
    { optional: ["where", "filters", "search", "viewId"] },
  ),
  outputSchema: s.requiredObject("The InfoLobby record count result.", {
    count: s.integer("The number of records matching the query."),
    total: s.integer("The total number of records in the table."),
    totalApprox: s.boolean("Whether the total is an approximate estimate."),
    restricted: s.boolean("Whether the query narrows the table."),
  }),
});

export const infolobbyActions: ActionDefinition[] = [
  listSpacesAction,
  getSpaceAction,
  listTablesAction,
  getTableAction,
  createRecordAction,
  getRecordAction,
  updateRecordAction,
  deleteRecordAction,
  queryRecordsAction,
  countRecordsAction,
];

export type InfolobbyActionName =
  | "list_spaces"
  | "get_space"
  | "list_tables"
  | "get_table"
  | "create_record"
  | "get_record"
  | "update_record"
  | "delete_record"
  | "query_records"
  | "count_records";
