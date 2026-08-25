import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "n8n";

const idSchema = s.nonEmptyString("An n8n resource identifier.");
const workflowIdSchema = s.nonEmptyString("The n8n workflow identifier.");
const tagIdSchema = s.nonEmptyString("The n8n tag identifier.");
const executionIdSchema = s.integer("The n8n execution identifier.");
const variableIdSchema = s.nonEmptyString("The n8n variable identifier.");
const dataTableIdSchema = s.nonEmptyString("The n8n data table identifier.");
const dataTableColumnIdSchema = s.nonEmptyString("The n8n data table column identifier.");
const cursorSchema = s.nonEmptyString("The cursor returned by a previous n8n list response.");
const limitSchema = s.integer("The maximum number of items to return.", { minimum: 1, maximum: 250 });
const dateTimeSchema = s.dateTime("An ISO 8601 timestamp returned by n8n.");
const nullableDateTimeSchema = s.nullable(dateTimeSchema);

const tagSchema = s.object(
  "An n8n tag.",
  {
    id: idSchema,
    name: s.nonEmptyString("The tag name."),
    createdAt: dateTimeSchema,
    updatedAt: dateTimeSchema,
  },
  { optional: ["id", "createdAt", "updatedAt"] },
);

const workflowSchema = s.looseRequiredObject(
  "An n8n workflow object returned by the public API.",
  {
    id: workflowIdSchema,
    name: s.nonEmptyString("The workflow name."),
    active: s.boolean("Whether the workflow is active."),
    createdAt: dateTimeSchema,
    updatedAt: dateTimeSchema,
    isArchived: s.boolean("Whether the workflow is archived."),
    versionId: s.nonEmptyString("The current workflow version identifier."),
    triggerCount: s.integer("The number of active trigger nodes in the workflow."),
    nodes: s.array("Workflow nodes returned by n8n.", s.looseObject("An n8n workflow node.")),
    connections: s.looseObject("Workflow connections keyed by node name."),
    settings: s.looseObject("Workflow settings returned by n8n."),
    tags: s.array("Tags attached to the workflow.", tagSchema),
  },
  {
    optional: ["active", "createdAt", "updatedAt", "isArchived", "versionId", "triggerCount", "tags"],
  },
);

const executionStatusSchema = s.stringEnum("An n8n execution status.", [
  "canceled",
  "crashed",
  "error",
  "new",
  "running",
  "success",
  "unknown",
  "waiting",
]);
const executionModeSchema = s.stringEnum("An n8n execution mode.", [
  "cli",
  "error",
  "integrated",
  "internal",
  "manual",
  "retry",
  "trigger",
  "webhook",
  "evaluation",
  "chat",
]);

const executionSchema = s.looseRequiredObject(
  "An n8n execution object returned by the public API.",
  {
    id: executionIdSchema,
    data: s.looseObject("Detailed execution data included when requested."),
    finished: s.boolean("Whether the execution has finished."),
    mode: executionModeSchema,
    retryOf: s.nullable(s.integer("The original execution ID when this execution is a retry.")),
    retrySuccessId: s.nullable(s.integer("The successful retry execution ID when returned by n8n.")),
    startedAt: dateTimeSchema,
    stoppedAt: nullableDateTimeSchema,
    workflowId: s.anyOf("The workflow ID associated with the execution.", [
      s.integer("A numeric workflow ID."),
      s.string("A string workflow ID."),
    ]),
    waitTill: nullableDateTimeSchema,
    customData: s.looseObject("Custom execution data returned by n8n."),
    status: executionStatusSchema,
  },
  {
    optional: [
      "data",
      "finished",
      "mode",
      "retryOf",
      "retrySuccessId",
      "startedAt",
      "stoppedAt",
      "workflowId",
      "waitTill",
      "customData",
      "status",
    ],
  },
);

const workflowListOutputSchema = s.object("A page of n8n workflows.", {
  data: s.array("Workflows returned for the requested page.", workflowSchema),
  nextCursor: s.nullable(s.string("The cursor for the next page when present.")),
});

const executionListOutputSchema = s.object("A page of n8n executions.", {
  data: s.array("Executions returned for the requested page.", executionSchema),
  nextCursor: s.nullable(s.string("The cursor for the next page when present.")),
});

const tagListOutputSchema = s.object("A page of n8n tags.", {
  data: s.array("Tags returned for the requested page.", tagSchema),
  nextCursor: s.nullable(s.string("The cursor for the next page when present.")),
});

const tagRelationOutputSchema = s.object("The tags attached to the n8n resource.", {
  tags: s.array("Tags attached to the resource after the operation.", tagSchema),
});

const variableSchema = s.looseRequiredObject(
  "An n8n variable.",
  {
    id: variableIdSchema,
    key: s.nonEmptyString("The variable key."),
    value: s.string("The variable value."),
    type: s.string("The variable type returned by n8n."),
    projectId: s.nullable(s.string("The project identifier that owns the variable.")),
    project: s.looseObject("The project that owns the variable when returned by n8n."),
  },
  { optional: ["id", "type", "projectId", "project"] },
);

const variableListOutputSchema = s.object("A page of n8n variables.", {
  data: s.array("Variables returned for the requested page.", variableSchema),
  nextCursor: s.nullable(s.string("The cursor for the next page when present.")),
});

const dataTableColumnTypeSchema = s.stringEnum("The n8n data table column type.", [
  "string",
  "number",
  "boolean",
  "date",
]);
const dataTableCreateColumnTypeSchema = s.stringEnum("The n8n data table column type accepted when creating a table.", [
  "string",
  "number",
  "boolean",
  "date",
  "json",
]);
const dataTableColumnNameSchema = s.string({
  minLength: 1,
  maxLength: 63,
  pattern: "^[a-zA-Z][a-zA-Z0-9_]*$",
  description: "The data table column name.",
});

const dataTableColumnSchema = s.looseRequiredObject("An n8n data table column.", {
  id: dataTableColumnIdSchema,
  name: s.nonEmptyString("The data table column name."),
  dataTableId: dataTableIdSchema,
  type: dataTableColumnTypeSchema,
  index: s.integer("The zero-based column position."),
});

const dataTableColumnListOutputSchema = s.array("Columns returned for the data table.", dataTableColumnSchema);

const dataTableSchema = s.looseRequiredObject("An n8n data table.", {
  id: dataTableIdSchema,
  name: s.nonEmptyString("The data table name."),
  columns: s.array("Columns in the data table.", dataTableColumnSchema),
  projectId: s.string("The project identifier that owns the data table."),
  createdAt: dateTimeSchema,
  updatedAt: dateTimeSchema,
});

const dataTableListOutputSchema = s.object("A page of n8n data tables.", {
  data: s.array("Data tables returned for the requested page.", dataTableSchema),
  nextCursor: s.nullable(s.string("The cursor for the next page when present.")),
});

const dataTableRowSchema = s.looseObject("An n8n data table row with user-defined columns.", {
  id: s.integer("The row identifier generated by n8n."),
  createdAt: dateTimeSchema,
  updatedAt: dateTimeSchema,
});
const dataTableRowListOutputSchema = s.object("A page of n8n data table rows.", {
  data: s.array("Rows returned for the requested page.", dataTableRowSchema),
  nextCursor: s.nullable(s.string("The cursor for the next page when present.")),
});
const dataTableWriteRowsOutputSchema = s.anyOf("The result returned by n8n after writing data table rows.", [
  s.requiredObject("The number of inserted rows when returnType is count.", {
    count: s.integer("The number of inserted rows."),
  }),
  dataTableRowSchema,
  s.array("Rows or row IDs returned by n8n.", s.unknown("A row object or row identifier.")),
  s.boolean("Whether the row write operation succeeded."),
]);
const dataTableDeletedOutputSchema = s.requiredObject("The deleted n8n data table identifier.", {
  id: dataTableIdSchema,
});
const dataTableColumnDeletedOutputSchema = s.requiredObject("The deleted n8n data table column identifier.", {
  id: dataTableColumnIdSchema,
});

const insightMetricSchema = s.requiredObject("An n8n insight metric value.", {
  value: s.number("The metric value."),
  deviation: s.nullable(s.number("The metric deviation compared to the previous period.")),
  unit: s.string("The metric unit returned by n8n."),
});
const insightsSummaryOutputSchema = s.looseRequiredObject("n8n insights summary metrics.", {
  total: insightMetricSchema,
  failed: insightMetricSchema,
  failureRate: insightMetricSchema,
  timeSaved: insightMetricSchema,
  averageRunTime: insightMetricSchema,
});

const workflowListInputSchema = s.object(
  "Query parameters for listing n8n workflows.",
  {
    active: s.boolean("Filter workflows by active state."),
    tags: s.array(
      "Filter workflows by a comma-separated set of tag names.",
      s.nonEmptyString("A tag name to filter by."),
      {
        minItems: 1,
      },
    ),
    name: s.nonEmptyString("Filter workflows by name."),
    projectId: idSchema,
    excludePinnedData: s.boolean("Avoid retrieving pinned data."),
    limit: limitSchema,
    cursor: cursorSchema,
  },
  { optional: ["active", "tags", "name", "projectId", "excludePinnedData", "limit", "cursor"] },
);

const workflowReadInputSchema = s.object(
  "Input for reading one n8n workflow.",
  {
    workflowId: workflowIdSchema,
    excludePinnedData: s.boolean("Avoid retrieving pinned data."),
  },
  { optional: ["excludePinnedData"] },
);

const workflowIdInputSchema = s.requiredObject("Input for a workflow operation.", {
  workflowId: workflowIdSchema,
});

const activateWorkflowInputSchema = s.object(
  "Input for activating or publishing one n8n workflow.",
  {
    workflowId: workflowIdSchema,
    versionId: s.nonEmptyString("The specific workflow version ID to activate."),
    name: s.nonEmptyString("An optional name for the workflow version."),
    description: s.nonEmptyString("An optional description for the workflow version."),
  },
  { optional: ["versionId", "name", "description"] },
);

const executionListInputSchema = s.object(
  "Query parameters for listing n8n executions.",
  {
    includeData: s.boolean("Whether to include detailed execution data."),
    redactExecutionData: s.boolean("Whether to redact execution data in the response."),
    status: executionStatusSchema,
    workflowId: idSchema,
    projectId: idSchema,
    limit: limitSchema,
    cursor: cursorSchema,
  },
  { optional: ["includeData", "redactExecutionData", "status", "workflowId", "projectId", "limit", "cursor"] },
);

const executionReadInputSchema = s.object(
  "Input for reading one n8n execution.",
  {
    executionId: executionIdSchema,
    includeData: s.boolean("Whether to include detailed execution data."),
    redactExecutionData: s.boolean("Whether to redact execution data in the response."),
  },
  { optional: ["includeData", "redactExecutionData"] },
);

const executionIdInputSchema = s.requiredObject("Input for an execution operation.", {
  executionId: executionIdSchema,
});

const retryExecutionInputSchema = s.object(
  "Input for retrying one n8n execution.",
  {
    executionId: executionIdSchema,
    loadWorkflow: s.boolean(
      "Whether to retry with the currently saved workflow instead of the workflow saved at execution time.",
    ),
  },
  { optional: ["loadWorkflow"] },
);

const tagListInputSchema = s.object(
  "Query parameters for listing n8n tags.",
  {
    limit: limitSchema,
    cursor: cursorSchema,
  },
  { optional: ["limit", "cursor"] },
);

const tagInputSchema = s.requiredObject("Input for creating an n8n tag.", {
  name: s.nonEmptyString("The tag name."),
});

const updateTagInputSchema = s.requiredObject("Input for updating an n8n tag.", {
  tagId: tagIdSchema,
  name: s.nonEmptyString("The updated tag name."),
});

const tagIdInputSchema = s.requiredObject("Input for deleting an n8n tag.", {
  tagId: tagIdSchema,
});

const workflowTagsInputSchema = s.requiredObject("Input for reading workflow tags.", {
  workflowId: workflowIdSchema,
});

const updateWorkflowTagsInputSchema = s.requiredObject("Input for replacing workflow tags.", {
  workflowId: workflowIdSchema,
  tagIds: s.array("Tag IDs to attach to the workflow.", tagIdSchema),
});

const executionTagsInputSchema = s.requiredObject("Input for reading execution tags.", {
  executionId: executionIdSchema,
});

const updateExecutionTagsInputSchema = s.requiredObject("Input for replacing execution tags.", {
  executionId: executionIdSchema,
  tagIds: s.array("Tag IDs to attach to the execution.", tagIdSchema),
});

const variableListInputSchema = s.object(
  "Query parameters for listing n8n variables.",
  {
    projectId: idSchema,
    state: s.stringEnum("Filter variables by state.", ["empty"]),
    limit: limitSchema,
    cursor: cursorSchema,
  },
  { optional: ["projectId", "state", "limit", "cursor"] },
);

const variableInputSchema = s.object(
  "Input for creating an n8n variable.",
  {
    key: s.nonEmptyString("The variable key."),
    value: s.string("The variable value."),
    projectId: idSchema,
  },
  { optional: ["projectId"] },
);

const updateVariableInputSchema = s.requiredObject("Input for updating an n8n variable.", {
  variableId: variableIdSchema,
  key: s.nonEmptyString("The variable key."),
  value: s.string("The variable value."),
});

const variableIdInputSchema = s.requiredObject("Input for deleting an n8n variable.", {
  variableId: variableIdSchema,
});

const dataTableFilterConditionSchema = s.requiredObject("A condition in an n8n data table row filter.", {
  columnName: s.nonEmptyString("The column name to filter."),
  condition: s.stringEnum("The filter comparison condition.", ["eq", "neq", "like", "ilike", "gt", "gte", "lt", "lte"]),
  value: s.unknown("The value to compare against."),
});
const dataTableFilterSchema = s.object(
  "Structured n8n data table filter conditions.",
  {
    type: s.stringEnum("Whether all filters or any filter must match.", ["and", "or"]),
    filters: s.array("Filter conditions.", dataTableFilterConditionSchema, { minItems: 1 }),
  },
  { optional: ["type"] },
);

const dataTableListInputSchema = s.object(
  "Query parameters for listing n8n data tables.",
  {
    filter: s.looseObject("Filter conditions accepted by n8n."),
    sortBy: s.nonEmptyString("Sort format such as field:asc or field:desc."),
    limit: limitSchema,
    cursor: cursorSchema,
  },
  { optional: ["filter", "sortBy", "limit", "cursor"] },
);

const dataTableColumnInputSchema = s.requiredObject("Input for a data table column definition.", {
  name: s.nonEmptyString("The data table column name."),
  type: dataTableCreateColumnTypeSchema,
});

const createDataTableInputSchema = s.object(
  "Input for creating an n8n data table.",
  {
    name: s.string({ minLength: 1, maxLength: 128, description: "The data table name." }),
    columns: s.array("Columns to create in the table.", dataTableColumnInputSchema, { minItems: 1 }),
    projectId: idSchema,
  },
  { optional: ["projectId"] },
);

const dataTableIdInputSchema = s.requiredObject("Input for a data table operation.", {
  dataTableId: dataTableIdSchema,
});

const updateDataTableInputSchema = s.requiredObject("Input for updating an n8n data table.", {
  dataTableId: dataTableIdSchema,
  name: s.string({ minLength: 1, maxLength: 128, description: "The new data table name." }),
});

const createDataTableColumnInputSchema = s.object(
  "Input for adding a column to an n8n data table.",
  {
    dataTableId: dataTableIdSchema,
    name: dataTableColumnNameSchema,
    type: dataTableColumnTypeSchema,
    index: s.nonNegativeInteger("The zero-based column position."),
  },
  { optional: ["index"] },
);

const updateDataTableColumnInputSchema = {
  ...s.object(
    "Input for updating an n8n data table column.",
    {
      dataTableId: dataTableIdSchema,
      columnId: dataTableColumnIdSchema,
      name: dataTableColumnNameSchema,
      index: s.nonNegativeInteger("The new zero-based column position."),
    },
    { optional: ["name", "index"] },
  ),
  anyOf: [{ required: ["name"] }, { required: ["index"] }],
} satisfies JsonSchema;

const dataTableColumnIdInputSchema = s.requiredObject("Input for a data table column operation.", {
  dataTableId: dataTableIdSchema,
  columnId: dataTableColumnIdSchema,
});

const dataTableRowsListInputSchema = s.object(
  "Query parameters for listing n8n data table rows.",
  {
    dataTableId: dataTableIdSchema,
    filter: dataTableFilterSchema,
    sortBy: s.nonEmptyString("Sort format such as columnName:asc or columnName:desc."),
    search: s.nonEmptyString("Search text across string columns."),
    limit: limitSchema,
    cursor: cursorSchema,
  },
  { optional: ["filter", "sortBy", "search", "limit", "cursor"] },
);

const dataTableRowDataSchema = s.looseObject("A data table row keyed by column name.");

const insertDataTableRowsInputSchema = s.object(
  "Input for inserting rows into an n8n data table.",
  {
    dataTableId: dataTableIdSchema,
    data: s.array("Rows to insert.", dataTableRowDataSchema, { minItems: 1 }),
    returnType: s.stringEnum("How much data n8n should return after insertion.", ["count", "id", "all"]),
  },
  { optional: ["returnType"] },
);

const updateDataTableRowsInputSchema = s.object(
  "Input for updating rows in an n8n data table.",
  {
    dataTableId: dataTableIdSchema,
    filter: dataTableFilterSchema,
    data: dataTableRowDataSchema,
    returnData: s.boolean("Whether n8n should return updated rows."),
    dryRun: s.boolean("Preview matching updates without persisting changes."),
  },
  { optional: ["returnData", "dryRun"] },
);

const upsertDataTableRowInputSchema = s.object(
  "Input for upserting one row in an n8n data table.",
  {
    dataTableId: dataTableIdSchema,
    filter: dataTableFilterSchema,
    data: dataTableRowDataSchema,
    returnData: s.boolean("Whether n8n should return the upserted row."),
    dryRun: s.boolean("Preview the upsert without persisting changes."),
  },
  { optional: ["returnData", "dryRun"] },
);

const insightsSummaryInputSchema = s.object(
  "Query parameters for retrieving n8n insights summary metrics.",
  {
    startDate: dateTimeSchema,
    endDate: dateTimeSchema,
    projectId: idSchema,
  },
  { optional: ["startDate", "endDate", "projectId"] },
);

export const n8nActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_workflows",
    description: "List n8n workflows with optional filters and cursor pagination.",
    inputSchema: workflowListInputSchema,
    outputSchema: workflowListOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_workflow",
    description: "Retrieve one n8n workflow by ID.",
    inputSchema: workflowReadInputSchema,
    outputSchema: workflowSchema,
  }),
  defineProviderAction(service, {
    name: "activate_workflow",
    description: "Activate or publish an n8n workflow.",
    inputSchema: activateWorkflowInputSchema,
    outputSchema: workflowSchema,
  }),
  defineProviderAction(service, {
    name: "deactivate_workflow",
    description: "Deactivate an n8n workflow.",
    inputSchema: workflowIdInputSchema,
    outputSchema: workflowSchema,
  }),
  defineProviderAction(service, {
    name: "archive_workflow",
    description: "Archive an n8n workflow.",
    inputSchema: workflowIdInputSchema,
    outputSchema: workflowSchema,
  }),
  defineProviderAction(service, {
    name: "unarchive_workflow",
    description: "Unarchive an n8n workflow.",
    inputSchema: workflowIdInputSchema,
    outputSchema: workflowSchema,
  }),
  defineProviderAction(service, {
    name: "list_executions",
    description: "List n8n executions with optional filters and cursor pagination.",
    inputSchema: executionListInputSchema,
    outputSchema: executionListOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_execution",
    description: "Retrieve one n8n execution by ID.",
    inputSchema: executionReadInputSchema,
    outputSchema: executionSchema,
  }),
  defineProviderAction(service, {
    name: "retry_execution",
    description: "Retry one n8n execution.",
    inputSchema: retryExecutionInputSchema,
    outputSchema: executionSchema,
  }),
  defineProviderAction(service, {
    name: "stop_execution",
    description: "Stop one running n8n execution.",
    inputSchema: executionIdInputSchema,
    outputSchema: executionSchema,
  }),
  defineProviderAction(service, {
    name: "list_tags",
    description: "List n8n tags with cursor pagination.",
    inputSchema: tagListInputSchema,
    outputSchema: tagListOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_tag",
    description: "Create an n8n tag.",
    inputSchema: tagInputSchema,
    outputSchema: tagSchema,
  }),
  defineProviderAction(service, {
    name: "update_tag",
    description: "Update an n8n tag.",
    inputSchema: updateTagInputSchema,
    outputSchema: tagSchema,
  }),
  defineProviderAction(service, {
    name: "delete_tag",
    description: "Delete an n8n tag.",
    inputSchema: tagIdInputSchema,
    outputSchema: tagSchema,
  }),
  defineProviderAction(service, {
    name: "get_workflow_tags",
    description: "Get tags attached to an n8n workflow.",
    inputSchema: workflowTagsInputSchema,
    outputSchema: tagRelationOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_workflow_tags",
    description: "Replace tags attached to an n8n workflow.",
    inputSchema: updateWorkflowTagsInputSchema,
    outputSchema: tagRelationOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_execution_tags",
    description: "Get annotation tags attached to an n8n execution.",
    inputSchema: executionTagsInputSchema,
    outputSchema: tagRelationOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_execution_tags",
    description: "Replace annotation tags attached to an n8n execution.",
    inputSchema: updateExecutionTagsInputSchema,
    outputSchema: tagRelationOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_variables",
    description: "List n8n variables with optional filters and cursor pagination.",
    inputSchema: variableListInputSchema,
    outputSchema: variableListOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_variable",
    description: "Create an n8n variable for workflow runtime configuration.",
    inputSchema: variableInputSchema,
    outputSchema: variableSchema,
  }),
  defineProviderAction(service, {
    name: "update_variable",
    description: "Update an n8n variable value.",
    inputSchema: updateVariableInputSchema,
    outputSchema: variableSchema,
  }),
  defineProviderAction(service, {
    name: "delete_variable",
    description: "Delete an n8n variable.",
    inputSchema: variableIdInputSchema,
    outputSchema: s.requiredObject("The deleted n8n variable identifier.", { id: variableIdSchema }),
  }),
  defineProviderAction(service, {
    name: "list_data_tables",
    description: "List n8n data tables with optional filters and cursor pagination.",
    inputSchema: dataTableListInputSchema,
    outputSchema: dataTableListOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_data_table",
    description: "Create an n8n data table with columns.",
    inputSchema: createDataTableInputSchema,
    outputSchema: dataTableSchema,
  }),
  defineProviderAction(service, {
    name: "get_data_table",
    description: "Retrieve one n8n data table by ID.",
    inputSchema: dataTableIdInputSchema,
    outputSchema: dataTableSchema,
  }),
  defineProviderAction(service, {
    name: "update_data_table",
    description: "Rename an n8n data table.",
    inputSchema: updateDataTableInputSchema,
    outputSchema: dataTableSchema,
  }),
  defineProviderAction(service, {
    name: "delete_data_table",
    description: "Delete an n8n data table.",
    inputSchema: dataTableIdInputSchema,
    outputSchema: dataTableDeletedOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_data_table_columns",
    description: "List columns in an n8n data table.",
    inputSchema: dataTableIdInputSchema,
    outputSchema: dataTableColumnListOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_data_table_column",
    description: "Add a column to an n8n data table.",
    inputSchema: createDataTableColumnInputSchema,
    outputSchema: dataTableColumnSchema,
  }),
  defineProviderAction(service, {
    name: "update_data_table_column",
    description: "Rename or reorder an n8n data table column.",
    inputSchema: updateDataTableColumnInputSchema,
    outputSchema: dataTableColumnSchema,
  }),
  defineProviderAction(service, {
    name: "delete_data_table_column",
    description: "Delete a column from an n8n data table.",
    inputSchema: dataTableColumnIdInputSchema,
    outputSchema: dataTableColumnDeletedOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_data_table_rows",
    description: "List rows in an n8n data table with filters, search, and sorting.",
    inputSchema: dataTableRowsListInputSchema,
    outputSchema: dataTableRowListOutputSchema,
  }),
  defineProviderAction(service, {
    name: "insert_data_table_rows",
    description: "Insert rows into an n8n data table.",
    inputSchema: insertDataTableRowsInputSchema,
    outputSchema: dataTableWriteRowsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_data_table_rows",
    description: "Update rows in an n8n data table by filter.",
    inputSchema: updateDataTableRowsInputSchema,
    outputSchema: dataTableWriteRowsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "upsert_data_table_row",
    description: "Upsert one row in an n8n data table by filter.",
    inputSchema: upsertDataTableRowInputSchema,
    outputSchema: dataTableWriteRowsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_insights_summary",
    description: "Retrieve n8n insights summary metrics for a time range and project.",
    inputSchema: insightsSummaryInputSchema,
    outputSchema: insightsSummaryOutputSchema,
  }),
];
