import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "databar_ai";
const tableUuid = s.uuid("The UUID of the Databar table.");
const genericObject = s.looseObject("The object returned by Databar.");
const genericArrayOrObject = s.anyOf("The data returned by Databar.", [
  s.array(s.unknown("One returned item."), { description: "The array returned by Databar." }),
  genericObject,
]);
const tableSchema = s.looseRequiredObject("A Databar table.", {
  identifier: s.string("The table identifier returned by Databar."),
  name: s.string("The table name."),
  created_at: s.string("The table creation timestamp."),
  updated_at: s.string("The table update timestamp."),
  workspace_identifier: s.nullableString("The workspace identifier associated with the table when present."),
  table_url: s.string("The Databar web URL for the table."),
  raw: genericObject,
});
const table = s.actionOutput({ table: tableSchema });
const task = s.looseRequiredObject("A Databar task status response.", {
  task_id: s.string("The Databar task identifier."),
  status: s.string("The current Databar task status."),
});

export const databarAiActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_user_info",
    description: "Get the current Databar account information for the API key.",
    inputSchema: s.actionInput({}),
    outputSchema: s.actionOutput({
      user: s.looseRequiredObject("The current Databar user account.", {
        email: s.email("The user's email address."),
        balance: s.number("The user's credit balance."),
        plan: s.string("The user's Databar plan."),
      }),
    }),
  }),
  defineProviderAction(service, {
    name: "list_tables",
    description: "List Databar tables in the current workspace.",
    inputSchema: s.actionInput({}),
    outputSchema: s.actionOutput({
      tables: s.array(tableSchema, { description: "The Databar tables." }),
    }),
  }),
  defineProviderAction(service, {
    name: "create_table",
    description: "Create a Databar table with optional columns and empty rows.",
    inputSchema: s.object(
      {
        name: s.nonEmptyString("The table name."),
        columns: s.stringArray("The initial human-readable column names.", { minItems: 1 }),
        rows: s.nonNegativeInteger("The number of empty rows Databar should create."),
      },
      { optional: ["name", "columns", "rows"], description: "The input payload for creating a Databar table." },
    ),
    outputSchema: table,
  }),
  defineProviderAction(service, {
    name: "get_table_columns",
    description: "List columns for a Databar table.",
    inputSchema: s.actionInput({ table_uuid: tableUuid }, ["table_uuid"]),
    outputSchema: s.actionOutput({
      columns: s.array(genericObject, { description: "The Databar table columns." }),
    }),
  }),
  defineProviderAction(service, {
    name: "get_table_rows",
    description: "Get Databar table rows with pagination and optional column filters.",
    inputSchema: s.object(
      {
        table_uuid: tableUuid,
        per_page: s.integer({ minimum: 1, maximum: 500, description: "The number of rows per page." }),
        page: s.positiveInteger("The page number to retrieve."),
        filter: s.record("Column filters keyed by human-readable column name.", genericObject),
      },
      { required: ["table_uuid"], optional: ["per_page", "page", "filter"], description: "The input payload." },
    ),
    outputSchema: s.actionOutput({ rows: genericObject }),
  }),
  defineProviderAction(service, {
    name: "insert_rows",
    description: "Insert up to 50 rows into a Databar table using human-readable column names.",
    inputSchema: s.actionInput(
      {
        table_uuid: tableUuid,
        rows: s.array(
          s.object({ fields: s.record("Row fields.", s.unknown("One row value.")) }, { required: ["fields"] }),
          {
            minItems: 1,
            maxItems: 50,
            description: "The rows to insert into Databar.",
          },
        ),
        options: genericObject,
        return_rows: s.boolean("Whether Databar should return full row_data for each inserted row."),
      },
      ["table_uuid", "rows"],
    ),
    outputSchema: s.actionOutput({
      results: s.array(genericObject, { description: "The Databar batch insert results." }),
    }),
  }),
  defineProviderAction(service, {
    name: "list_enrichments",
    description: "List Databar enrichments with optional search and pagination.",
    inputSchema: s.object(
      {
        q: s.string({ minLength: 3, description: "The search query for Databar enrichments." }),
        page: s.positiveInteger("The page number to retrieve."),
        limit: s.integer({ minimum: 1, maximum: 500, description: "The number of items to return." }),
        authorized_only: s.boolean("Whether to hide BYOK enrichments that are not connected."),
        category: s.nonEmptyString("The enrichment category name to filter by."),
      },
      { optional: ["q", "page", "limit", "authorized_only", "category"], description: "The input payload." },
    ),
    outputSchema: s.actionOutput({ result: genericArrayOrObject }),
  }),
  defineProviderAction(service, {
    name: "get_enrichment",
    description: "Get detailed Databar enrichment metadata by ID.",
    inputSchema: s.actionInput({ enrichment_id: s.positiveInteger("The numeric Databar enrichment ID.") }, [
      "enrichment_id",
    ]),
    outputSchema: s.actionOutput({ enrichment: genericObject }),
  }),
  defineProviderAction(service, {
    name: "run_enrichment",
    description: "Submit a Databar enrichment task and return the task ID for later status polling.",
    inputSchema: s.actionInput(
      {
        enrichment_id: s.positiveInteger("The numeric Databar enrichment ID."),
        params: s.record(
          "The enrichment parameters keyed by Databar parameter name.",
          s.unknown("One parameter value."),
        ),
        pagination: genericObject,
      },
      ["enrichment_id", "params"],
    ),
    outputSchema: s.actionOutput({ task }),
  }),
  defineProviderAction(service, {
    name: "get_task_status",
    description: "Get the status and result data for a Databar enrichment or waterfall task.",
    inputSchema: s.actionInput({ task_id: s.nonEmptyString("The Databar task identifier.") }, ["task_id"]),
    outputSchema: s.actionOutput({ task }),
  }),
  defineProviderAction(service, {
    name: "run_waterfall",
    description: "Submit a Databar waterfall task and return the task ID for later status polling.",
    inputSchema: s.actionInput(
      {
        waterfall_identifier: s.nonEmptyString("The Databar waterfall identifier."),
        params: s.record(
          "The waterfall parameters keyed by Databar parameter name.",
          s.unknown("One parameter value."),
        ),
        enrichments: s.array(s.positiveInteger("One enrichment ID."), {
          minItems: 1,
          description: "The enrichment IDs.",
        }),
        email_verifier: s.positiveInteger("The email verifier enrichment ID."),
      },
      ["waterfall_identifier", "params", "enrichments"],
    ),
    outputSchema: s.actionOutput({ task }),
  }),
];
