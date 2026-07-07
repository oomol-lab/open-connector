import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "tinybird";

const primitiveParameterSchema = s.anyOf("A URL query parameter value.", [
  s.string("A string parameter value."),
  s.number("A numeric parameter value."),
  s.boolean("A boolean parameter value."),
]);

const parameterRecordSchema = s.record(
  "Custom query or template parameters sent to Tinybird.",
  primitiveParameterSchema,
);

const rawPayloadSchema = s.unknown("Raw JSON payload returned by Tinybird.");

const runSqlQueryInputSchema = s.object(
  "Input for running a Tinybird SQL query through the Query API.",
  {
    q: s.nonEmptyString("SQL query to execute with Tinybird."),
    parameters: s.looseObject("Optional custom parameters merged into the JSON request body."),
    pipeline: s.nonEmptyString("Optional Pipe name used by Tinybird as the `_` placeholder."),
    explain: s.boolean("Whether Tinybird should return EXPLAIN output instead of executing."),
  },
  { optional: ["parameters", "pipeline", "explain"] },
);

const runSqlQueryOutputSchema = s.actionOutput(
  {
    payload: rawPayloadSchema,
  },
  "Tinybird SQL query result.",
);

const runPipeEndpointInputSchema = s.object(
  "Input for querying a published Tinybird Pipe endpoint.",
  {
    pipeName: s.nonEmptyString("Published Pipe endpoint name."),
    parameters: parameterRecordSchema,
  },
  { optional: ["parameters"] },
);

const runPipeEndpointOutputSchema = s.actionOutput(
  {
    payload: rawPayloadSchema,
  },
  "Tinybird Pipe endpoint result.",
);

const listDataSourcesInputSchema = s.object(
  "Input for listing Tinybird Data Sources visible to the token.",
  {
    attrs: s.nonEmptyString("Comma-separated Data Source attributes to include in the response."),
  },
  { optional: ["attrs"] },
);

const dataSourceSchema = s.looseObject("A Tinybird Data Source object.");

const listDataSourcesOutputSchema = s.actionOutput(
  {
    dataSources: s.array("Data Sources returned by Tinybird.", dataSourceSchema),
    payload: rawPayloadSchema,
  },
  "Tinybird Data Source list result.",
);

const getDataSourceInputSchema = s.object(
  "Input for reading one Tinybird Data Source.",
  {
    name: s.nonEmptyString("Data Source name or ID."),
    attrs: s.nonEmptyString("Comma-separated Data Source attributes to include in the response."),
  },
  { optional: ["attrs"] },
);

const getDataSourceOutputSchema = s.actionOutput(
  {
    dataSource: dataSourceSchema,
  },
  "Tinybird Data Source result.",
);

export const tinybirdActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "run_sql_query",
    description: "Run a SQL query against Tinybird through the synchronous Query API.",
    followUpActions: ["tinybird.run_pipe_endpoint"],
    inputSchema: runSqlQueryInputSchema,
    outputSchema: runSqlQueryOutputSchema,
  }),
  defineProviderAction(service, {
    name: "run_pipe_endpoint",
    description: "Query a published Tinybird Pipe endpoint and return its JSON response.",
    followUpActions: ["tinybird.run_sql_query"],
    inputSchema: runPipeEndpointInputSchema,
    outputSchema: runPipeEndpointOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_data_sources",
    description: "List Tinybird Data Sources visible to the authenticated token.",
    followUpActions: ["tinybird.get_data_source"],
    inputSchema: listDataSourcesInputSchema,
    outputSchema: listDataSourcesOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_data_source",
    description: "Read metadata and stats for one Tinybird Data Source.",
    inputSchema: getDataSourceInputSchema,
    outputSchema: getDataSourceOutputSchema,
  }),
];

export type TinybirdActionName = "run_sql_query" | "run_pipe_endpoint" | "list_data_sources" | "get_data_source";
