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

const resultQueryFields = {
  limit: s.integer("Maximum number of result rows to return.", { minimum: 1 }),
  offset: s.integer("Zero-based row offset used for pagination.", { minimum: 0 }),
  columns: s.nonEmptyString("Comma-separated column names to return."),
  filters: s.nonEmptyString("Dune result filter expression."),
  sampleCount: s.integer("Number of rows to sample uniformly.", { minimum: 1 }),
  allowPartialResults: s.boolean("Return a stored partial result when the full result was truncated."),
  ignoreMaxCreditsPerRequest: s.boolean("Bypass Dune's default maximum credits per request."),
};

const resultSchema = s.looseRequiredObject(
  "Dune execution or latest-query result.",
  {
    execution_id: executionId,
    query_id: queryId,
    state,
    is_execution_finished: s.boolean("Whether the execution is in a terminal state."),
    result: s.looseObject("Result metadata and rows returned by Dune."),
    next_offset: s.integer("Offset for the next page of rows.", { minimum: 0 }),
    next_uri: s.url("Dune URL for the next page of rows."),
  },
  { optional: ["query_id", "state", "is_execution_finished", "result", "next_offset", "next_uri"] },
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
    inputSchema: s.object("Dune query lookup.", { queryId }),
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
    inputSchema: s.object("Dune execution status request.", { executionId }),
    outputSchema: s.looseRequiredObject(
      "Dune execution status.",
      {
        execution_id: executionId,
        query_id: queryId,
        state,
        is_execution_finished: s.boolean("Whether the execution is in a terminal state."),
      },
      { optional: ["query_id", "is_execution_finished"] },
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
