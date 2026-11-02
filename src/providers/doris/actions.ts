import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const database = s.optional(s.nonWhitespaceString("Database to use instead of the connection's default database."));
const maxRows = s.optional(
  s.integer(
    "Maximum returned rows. An extra row is requested to detect truncation. Use SQL LIMIT to also bound query work.",
    { minimum: 1, maximum: 10000, default: 1000 },
  ),
);
const outputSchema = s.requiredObject(
  "A Doris result set. Row values follow the order of columns, preserving duplicate column names.",
  {
    columns: s.array(
      s.requiredObject("One result column.", {
        name: s.string("Column name."),
        type: s.string("Doris column type."),
      }),
    ),
    rows: s.array(s.array(s.unknown("A JSON cell value as returned by Doris; SQL NULL is null."))),
    rowCount: s.nonNegativeInteger("Number of rows returned in rows, not the total number of matches."),
    executionTimeMs: s.nonNegativeInteger("Execution time reported by Doris in milliseconds."),
    truncated: s.boolean(
      "Whether additional rows were omitted by maxRows. Narrow the query or use SQL pagination to retrieve more.",
    ),
  },
);

export const dorisActions: ActionDefinition[] = [
  defineProviderAction("doris", {
    name: "execute_query",
    operationType: "read",
    description:
      "Run one read-only SELECT, WITH, SHOW, DESC, DESCRIBE, or EXPLAIN statement against Apache Doris. Writes, INTO OUTFILE, SQL hints, and multiple statements are rejected. Responses are capped at 8 MiB.",
    requiredScopes: ["SELECT_PRIV"],
    providerPermissions: ["Use a dedicated account with only SELECT_PRIV on the target databases."],
    inputSchema: s.requiredObject("Read-only SQL query options.", {
      query: s.withExamples(
        s.nonWhitespaceString(
          "One read-only SQL statement. A trailing semicolon is allowed. Use doubled quotes instead of backslash escapes.",
        ),
        ["SELECT 1 AS ok"],
      ),
      database,
      maxRows,
    }),
    outputSchema,
  }),
  defineProviderAction("doris", {
    name: "list_databases",
    operationType: "read",
    description: "List databases visible to the connected Doris user. Each result row contains a database name.",
    inputSchema: s.requiredObject("Database listing options.", { maxRows }),
    outputSchema,
  }),
  defineProviderAction("doris", {
    name: "list_tables",
    operationType: "read",
    description:
      "List tables and views in a Doris database. Each result row contains a table or view name. Set database here or on the connection.",
    inputSchema: s.requiredObject("Table listing options.", { database, maxRows }),
    outputSchema,
  }),
  defineProviderAction("doris", {
    name: "get_table_schema",
    operationType: "read",
    description:
      "Describe a Doris table. Result rows describe fields, types, nullability, keys, defaults, and extra attributes; columns identifies each attribute. Set database here or on the connection.",
    requiredScopes: ["SELECT_PRIV"],
    inputSchema: s.requiredObject("Table schema options.", {
      database,
      table: s.withExamples(s.nonWhitespaceString("Unqualified table name; supply its database separately."), [
        "events",
      ]),
      maxRows,
    }),
    outputSchema,
  }),
];
