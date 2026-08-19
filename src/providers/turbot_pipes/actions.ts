import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "turbot_pipes";

const queryRowSchema = s.looseObject("One Turbot Pipes SQL query result row.");
const queryColumnSchema = s.looseRequiredObject("A Turbot Pipes SQL query result column.", {
  name: s.nullableString("The column name returned by Turbot Pipes."),
  type: s.nullableString("The Turbot Pipes column type when returned."),
});
const queryMetaSchema = s.looseObject("Turbot Pipes query metadata returned by the Query API.");

export const turbotPipesActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "execute_query",
    description: "Execute a SQL query with the Turbot Pipes Query API and return rows plus query metadata.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        sql: s.nonEmptyString("The SQL statement to execute in Turbot Pipes."),
      },
      ["sql"],
      "Input for executing a Turbot Pipes SQL query.",
    ),
    outputSchema: s.actionOutput(
      {
        rows: s.array("Rows returned by the query.", queryRowSchema),
        rowCount: s.nonNegativeInteger("The number of rows returned by the query."),
        columns: s.array("Columns inferred from the query response.", queryColumnSchema),
        meta: s.nullable(queryMetaSchema),
        raw: s.unknown("The raw Turbot Pipes Query API response."),
      },
      "A normalized Turbot Pipes SQL query result.",
    ),
  }),
];
