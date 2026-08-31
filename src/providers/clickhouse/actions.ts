import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "clickhouse";

const trimmedString = (description: string) => s.string({ description, minLength: 1, pattern: "\\S" });

const optionalDatabaseField = {
  database: trimmedString(
    "The ClickHouse database to use for this request. Defaults to the database configured on the connection.",
  ),
};

const clickhouseSettingValueSchema = s.union(
  [s.string("A string setting value."), s.number("A numeric setting value."), s.boolean("A boolean setting value.")],
  { description: "One ClickHouse setting value." },
);

const queryInputSchema = s.object(
  "The input payload for executing a ClickHouse SQL query.",
  {
    query: trimmedString("The SQL query to execute against ClickHouse."),
    ...optionalDatabaseField,
    maxExecutionTime: s.integer("The maximum query execution time in seconds.", { minimum: 1 }),
    settings: s.record("Additional ClickHouse settings to send with the query.", clickhouseSettingValueSchema),
  },
  { optional: ["database", "maxExecutionTime", "settings"] },
);

const queryMetaSchema = s.object("One ClickHouse result column.", {
  name: s.string("The column name."),
  type: s.string("The ClickHouse column type."),
});

const queryStatisticsSchema = s.object(
  "ClickHouse query execution statistics.",
  {
    elapsed: s.nullableNumber("The query execution time in seconds."),
    rowsRead: s.nullableInteger("The number of rows read while executing the query."),
    bytesRead: s.nullableInteger("The number of bytes read while executing the query."),
  },
  { optional: ["elapsed", "rowsRead", "bytesRead"] },
);

const queryOutputSchema = s.object("The normalized output payload for a ClickHouse query.", {
  rows: s.array("The rows returned by ClickHouse.", s.looseObject("One ClickHouse result row.")),
  rowCount: s.integer("The number of rows returned in this response."),
  columns: s.array("The result column metadata returned by ClickHouse.", queryMetaSchema),
  statistics: queryStatisticsSchema,
  raw: s.looseObject("The raw ClickHouse JSON response payload."),
});

const databaseSchema = s.object("One ClickHouse database.", {
  name: s.string("The database name."),
  engine: s.nullableString("The database engine, if returned by ClickHouse."),
  uuid: s.nullableString("The database UUID, if returned by ClickHouse."),
  tables: s.array("The table names in this database when requested.", s.string("One table name.")),
  raw: s.looseObject("The raw ClickHouse database row."),
});

const tableSchema = s.object("One ClickHouse table or view.", {
  database: s.string("The database containing the table."),
  name: s.string("The table or view name."),
  engine: s.nullableString("The table engine, if returned by ClickHouse."),
  isTemporary: s.boolean("Whether the table is temporary."),
  primaryKey: s.nullableString("The primary key expression when requested or returned."),
  sortingKey: s.nullableString("The sorting key expression when requested or returned."),
  partitionKey: s.nullableString("The partition key expression when requested or returned."),
  columns: s.array("The table column names when requested.", s.string("One column name.")),
  totalRows: s.nullableInteger("The approximate total number of rows, if returned."),
  totalBytes: s.nullableInteger("The approximate total number of bytes, if returned."),
  raw: s.looseObject("The raw ClickHouse table row."),
});

const columnSchema = s.object("One ClickHouse table column.", {
  name: s.string("The column name."),
  type: s.string("The ClickHouse column type."),
  defaultKind: s.nullableString("The default expression kind, if any."),
  defaultExpression: s.nullableString("The default expression, if any."),
  comment: s.nullableString("The column comment, if any."),
  compressionCodec: s.nullableString("The column compression codec, if specified."),
  isInPrimaryKey: s.boolean("Whether the column is part of the primary key expression."),
  isInSortingKey: s.boolean("Whether the column is part of the sorting key expression."),
  raw: s.looseObject("The raw ClickHouse column row."),
});

const executeQueryAction = defineProviderAction(service, {
  name: "execute_query",
  description: "Execute a SQL query against a ClickHouse instance and return JSON rows.",
  inputSchema: queryInputSchema,
  outputSchema: queryOutputSchema,
});

const listDatabasesAction = defineProviderAction(service, {
  name: "list_databases",
  description: "List databases available in the connected ClickHouse instance.",
  inputSchema: s.object(
    "The input payload for listing ClickHouse databases.",
    {
      pattern: trimmedString("An optional SQL LIKE pattern used to filter database names."),
      includeTables: s.boolean("Whether to include table names for each returned database."),
    },
    { optional: ["pattern", "includeTables"] },
  ),
  outputSchema: s.object("The normalized output payload for listing ClickHouse databases.", {
    databases: s.array("The databases returned by ClickHouse.", databaseSchema),
    total: s.integer("The number of databases returned."),
    raw: s.looseObject("The raw ClickHouse JSON response payload."),
  }),
});

const listTablesAction = defineProviderAction(service, {
  name: "list_tables",
  description: "List tables or views in ClickHouse databases.",
  inputSchema: s.object(
    "The input payload for listing ClickHouse tables.",
    {
      database: trimmedString(
        "The ClickHouse database to list tables from. If omitted, tables from all databases are returned.",
      ),
      pattern: trimmedString("An optional SQL LIKE pattern used to filter table names."),
      includeViews: s.boolean({
        description: "Whether to include ClickHouse views in the returned tables.",
        default: true,
      }),
      includeColumns: s.boolean({
        description: "Whether to include column names for each returned table.",
        default: false,
      }),
      includePrimaryKey: s.boolean({
        description: "Whether to include primary, sorting, and partition key expressions.",
        default: false,
      }),
    },
    { optional: ["database", "pattern", "includeViews", "includeColumns", "includePrimaryKey"] },
  ),
  outputSchema: s.object("The normalized output payload for listing ClickHouse tables.", {
    tables: s.array("The tables returned by ClickHouse.", tableSchema),
    total: s.integer("The number of tables returned."),
    raw: s.looseObject("The raw ClickHouse JSON response payload."),
  }),
});

const getTableSchemaAction = defineProviderAction(service, {
  name: "get_table_schema",
  description: "Get column metadata for one ClickHouse table.",
  inputSchema: s.object(
    "The input payload for fetching a ClickHouse table schema.",
    {
      ...optionalDatabaseField,
      table: trimmedString("The ClickHouse table name."),
      includeSampleData: s.boolean({
        description: "Whether to include sample rows from the table.",
        default: false,
      }),
      sampleRows: s.integer({
        description: "The number of sample rows to return when includeSampleData is true.",
        minimum: 1,
        maximum: 25,
        default: 5,
      }),
    },
    { optional: ["database", "includeSampleData", "sampleRows"] },
  ),
  outputSchema: s.object("The normalized output payload for a ClickHouse table schema.", {
    database: s.string("The database containing the table."),
    table: s.string("The table whose schema was returned."),
    engine: s.nullableString("The table engine, if returned by ClickHouse."),
    primaryKey: s.nullableString("The primary key expression, if returned by ClickHouse."),
    sortingKey: s.nullableString("The sorting key expression, if returned by ClickHouse."),
    partitionKey: s.nullableString("The partition key expression, if returned by ClickHouse."),
    totalRows: s.nullableInteger("The approximate total number of rows, if returned."),
    totalBytes: s.nullableInteger("The approximate total number of bytes, if returned."),
    columns: s.array("The columns returned by ClickHouse.", columnSchema),
    sampleData: s.array("Sample rows returned from the table when requested.", s.looseObject("One sample row.")),
    raw: s.looseObject("The raw ClickHouse JSON response payload."),
  }),
});

const getDatabaseSchemaAction = defineProviderAction(service, {
  name: "get_database_schema",
  description: "Get an overview of one ClickHouse database with tables and optional column name lists.",
  inputSchema: s.object(
    "The input payload for fetching a ClickHouse database schema.",
    {
      ...optionalDatabaseField,
      includeTableSchemas: s.boolean({
        description: "Whether to include column names for every returned table.",
        default: false,
      }),
    },
    { optional: ["database", "includeTableSchemas"] },
  ),
  outputSchema: s.object("The normalized output payload for a ClickHouse database schema.", {
    database: s.string("The database whose schema was returned."),
    tables: s.array("The tables in the database.", tableSchema),
    totalTables: s.integer("The number of tables returned."),
    totalRows: s.nullableInteger("The approximate total rows across returned tables, or null when unknown."),
    totalBytes: s.nullableInteger("The approximate total bytes across returned tables, or null when unknown."),
    raw: s.looseObject("The raw ClickHouse JSON response payload."),
  }),
});

export const clickhouseActions: ActionDefinition[] = [
  executeQueryAction,
  listDatabasesAction,
  listTablesAction,
  getTableSchemaAction,
  getDatabaseSchemaAction,
];
