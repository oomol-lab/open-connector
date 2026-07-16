import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "dune" as const;

const queryId = s.positiveInteger("Unique numeric ID of a Dune query.");
const executionId = s.nonEmptyString("Unique ID of a Dune query execution.");
const state = s.stringEnum("Dune execution state.", [
  "QUERY_STATE_PENDING",
  "QUERY_STATE_EXECUTING",
  "QUERY_STATE_FAILED",
  "QUERY_STATE_COMPLETED",
  "QUERY_STATE_CANCELED",
  "QUERY_STATE_EXPIRED",
  "QUERY_STATE_COMPLETED_PARTIAL",
]);

const executionErrorSchema = s.looseObject("Dune execution error details.", {
  type: s.string("Error type returned by Dune."),
  message: s.string("Human-readable execution error message."),
  metadata: s.looseObject("Provider-specific error metadata, such as a SQL line and column."),
});

const resultMetadataSchema = s.looseObject("Dune execution result metadata.", {
  column_names: s.array("Result column names.", s.string("Column name.")),
  column_types: s.array("Dune types for result columns.", s.string("Dune column type.")),
  datapoint_count: s.nonNegativeInteger("Number of result cells used for billing."),
  execution_time_millis: s.nonNegativeInteger("Execution duration in milliseconds."),
  pending_time_millis: s.nonNegativeInteger("Time spent pending in milliseconds."),
  result_set_bytes: s.nonNegativeInteger("Size of the current result page in bytes."),
  row_count: s.nonNegativeInteger("Number of rows in the current result page."),
  total_result_set_bytes: s.nonNegativeInteger("Total result size in bytes."),
  total_row_count: s.nonNegativeInteger("Total rows in the complete result."),
});

const executionMetadataFields = {
  query_id: queryId,
  state,
  is_execution_finished: s.boolean("Whether the execution is in a terminal state."),
  submitted_at: s.dateTime("Time when Dune submitted the execution."),
  execution_started_at: s.dateTime("Time when Dune started the execution."),
  execution_ended_at: s.dateTime("Time when Dune ended the execution."),
  cancelled_at: s.dateTime("Time when the execution was canceled."),
  expires_at: s.dateTime("Time when the stored execution result expires."),
  execution_cost_credits: s.number("Credits consumed by the execution.", { minimum: 0 }),
  error: executionErrorSchema,
  result_metadata: resultMetadataSchema,
};

const optionalExecutionMetadataFields = Object.keys(executionMetadataFields);
const optionalStatusMetadataFields = optionalExecutionMetadataFields.filter((field) => field !== "state");

const resultQueryFields = {
  limit: s.integer("Maximum number of result rows to return. Cannot be combined with sampleCount.", { minimum: 1 }),
  offset: s.integer("Zero-based row offset used for pagination. Cannot be combined with sampleCount.", { minimum: 0 }),
  columns: s.nonEmptyString("Comma-separated column names to return."),
  filters: s.nonEmptyString("Dune result filter expression. Cannot be combined with sampleCount."),
  sortBy: s.nonEmptyString("Dune result ordering expression, such as `volume desc` or `project asc, volume desc`."),
  sampleCount: s.integer("Number of rows to sample uniformly. Cannot be combined with limit, offset, or filters.", {
    minimum: 1,
  }),
  allowPartialResults: s.boolean("Return a stored partial result when the full result was truncated."),
  ignoreMaxCreditsPerRequest: s.boolean(
    "Bypass Dune's configured maximum credits per request. This may increase cost.",
  ),
};

const resultSchema = s.looseRequiredObject(
  "Dune execution or latest-query result.",
  {
    execution_id: executionId,
    ...executionMetadataFields,
    result: s.looseObject("Result metadata and rows returned by Dune."),
    next_offset: s.integer("Offset for the next page of rows.", { minimum: 0 }),
    next_uri: s.url("Dune URL for the next page of rows."),
  },
  { optional: [...optionalExecutionMetadataFields, "result", "next_offset", "next_uri"] },
);

export const duneActions: readonly ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_queries",
    description: "List queries owned by the Dune account associated with the API key.",
    requiredScopes: ["Read"],
    inputSchema: s.object(
      "Pagination for listing Dune queries.",
      {
        limit: s.integer("Number of queries to return. Dune defaults to 20.", { minimum: 1 }),
        offset: s.integer("Number of queries to skip. Dune defaults to 0.", { minimum: 0 }),
      },
      { optional: ["limit", "offset"] },
    ),
    outputSchema: s.object("Paginated Dune query list.", {
      queries: s.array(
        "Queries owned by the account.",
        s.looseRequiredObject("Dune query overview.", {
          id: queryId,
          name: s.string("Query name."),
          description: s.string("Query description."),
          owner: s.string("Owner username or team handle."),
          tags: s.array("Query tags.", s.string("Tag.")),
          created_at: s.dateTime("Creation time."),
          updated_at: s.dateTime("Last update time."),
        }),
      ),
      total: s.nonNegativeInteger("Total number of queries available."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_query",
    description: "Get SQL, parameters, ownership, and state for a Dune query.",
    requiredScopes: ["Read"],
    inputSchema: s.requiredObject("Dune query lookup.", { queryId }),
    outputSchema: s.looseRequiredObject("Dune query details.", {
      query_id: queryId,
      name: s.string("Query name."),
      description: s.string("Query description."),
      owner: s.string("Owner username or team handle."),
      query_sql: s.string("SQL text of the query."),
      parameters: s.array("Parameters defined by the query.", s.looseObject("Dune query parameter.")),
      tags: s.array("Query tags.", s.string("Tag.")),
      is_private: s.boolean("Whether the query is private."),
      is_archived: s.boolean("Whether the query is archived."),
    }),
  }),
  defineProviderAction(service, {
    name: "execute_query",
    description: "Execute a saved Dune query and return an execution ID for status polling and result retrieval.",
    requiredScopes: ["Read"],
    inputSchema: s.object(
      "Saved Dune query execution request.",
      {
        queryId,
        queryParameters: s.unknownObject("Values keyed by the parameter names defined on the saved query."),
        performance: s.stringEnum("Dune execution performance tier.", ["small", "medium", "large"]),
      },
      { optional: ["queryParameters", "performance"] },
    ),
    outputSchema: s.looseRequiredObject(
      "Started Dune query execution.",
      {
        execution_id: executionId,
        state,
      },
      { optional: [] },
    ),
    followUpActions: ["dune.get_execution_status", "dune.get_execution_result"],
    asyncLifecycle: {
      startActionId: "dune.execute_query",
      statusActionId: "dune.get_execution_status",
    },
  }),
  defineProviderAction(service, {
    name: "get_latest_query_result",
    description: "Get the latest stored JSON result for a Dune query without starting a new execution.",
    requiredScopes: ["Read"],
    inputSchema: s.object(
      "Latest Dune query result request.",
      { queryId, ...resultQueryFields },
      {
        optional: Object.keys(resultQueryFields),
      },
    ),
    outputSchema: resultSchema,
  }),
  defineProviderAction(service, {
    name: "get_execution_status",
    description: "Get the current state and metadata for a Dune query execution.",
    requiredScopes: ["Read"],
    inputSchema: s.requiredObject("Dune execution status request.", { executionId }),
    outputSchema: s.looseRequiredObject(
      "Dune execution status.",
      {
        execution_id: executionId,
        ...executionMetadataFields,
        max_inflight_interactive_executions: s.nonNegativeInteger(
          "Maximum number of interactive executions allowed concurrently.",
        ),
        max_inflight_interactive_reached: s.nonNegativeInteger(
          "Number of interactive executions still in progress when the account concurrency limit is reached.",
        ),
        queue_position: s.nonNegativeInteger("Current execution queue position."),
      },
      {
        optional: [
          ...optionalStatusMetadataFields,
          "max_inflight_interactive_executions",
          "max_inflight_interactive_reached",
          "queue_position",
        ],
      },
    ),
  }),
  defineProviderAction(service, {
    name: "get_execution_result",
    description: "Get the JSON result and metadata for a Dune execution.",
    requiredScopes: ["Read"],
    inputSchema: s.object(
      "Dune execution result request.",
      { executionId, ...resultQueryFields },
      {
        optional: Object.keys(resultQueryFields),
      },
    ),
    outputSchema: resultSchema,
  }),
];
