import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "promptlayer";

const cursorSchema = s.nonEmptyString("The pagination cursor returned by PromptLayer.");
const promptLayerOrderValues = ["asc", "desc"];
const promptTemplateStatusSchema = s.stringEnum(["active", "deleted", "all"], {
  description: "The prompt template status filter.",
  default: "active",
});
const promptTemplateOrderSchema = s.stringEnum(promptLayerOrderValues, {
  description: "The sort direction used by PromptLayer.",
  default: "desc",
});
const tableListLimitSchema = s.integer({
  description: "The maximum number of Tables to return.",
  minimum: 1,
  maximum: 100,
  default: 20,
});
const tableListOrderSchema = s.stringEnum(promptLayerOrderValues, {
  description: "The sort direction used to list PromptLayer Tables.",
  default: "desc",
});
const sheetListLimitSchema = s.integer({
  description: "The maximum number of sheets to return.",
  minimum: 1,
  maximum: 100,
  default: 20,
});
const sheetListOrderSchema = s.stringEnum(promptLayerOrderValues, {
  description: "The sort direction used to list PromptLayer Table sheets.",
  default: "asc",
});
const rowListLimitSchema = s.integer({
  description: "The maximum number of rows to return.",
  minimum: 1,
  maximum: 100,
  default: 100,
});
const rowListOrderSchema = s.stringEnum(promptLayerOrderValues, {
  description: "The sort direction used to list PromptLayer Table rows.",
  default: "asc",
});
const promptTemplateSortBySchema = s.stringEnum("The prompt template sort field.", [
  "created_at",
  "updated_at",
  "name",
  "id",
]);
const promptTemplateProviderSchema = s.stringEnum(
  "The provider used when PromptLayer returns provider-specific LLM kwargs.",
  ["openai", "anthropic"],
);
const stringRecordSchema = s.record("String values keyed by PromptLayer field name.", s.string("One string value."));
const looseObjectSchema = s.looseObject("Provider-defined JSON object returned by PromptLayer.");
const rawPayloadSchema = s.looseObject("The raw JSON object returned by PromptLayer.");
const requestMetricsSchema = s.looseObject("Execution metrics for one PromptLayer Table cell.", {
  requestCount: s.nonNegativeInteger("The number of LLM requests used to produce the cell."),
  requestIds: s.array("The PromptLayer request IDs associated with the cell.", s.positiveInteger("One request ID.")),
  latencyMs: s.nullableInteger("The total end-to-end latency in milliseconds."),
  price: s.nullableNumber("The total cost in USD for all requests that produced the cell."),
  inputTokens: s.nullableInteger("The total number of input tokens across all requests."),
  outputTokens: s.nullableInteger("The total number of output tokens across all requests."),
  traceIds: s.array("The trace IDs linked to the cell.", s.nonEmptyString("One trace ID.")),
});
const cellStatusSchema = s.stringEnum("The current PromptLayer Table cell computation status.", [
  "completed",
  "stale",
  "running",
  "queued",
  "error",
  "cancelled",
]);
const tableColumnTypeSchema = s.stringEnum("The PromptLayer Table column type.", [
  "TEXT",
  "ABSOLUTE_NUMERIC_DISTANCE",
  "AI_DATA_EXTRACTION",
  "APPLY_DIFF",
  "ASSERT_VALID",
  "COALESCE",
  "CONDITION",
  "CODE_EXECUTION",
  "COMBINE_COLUMNS",
  "COMPARE",
  "COMPOSITION",
  "CONTAINS",
  "CONVERSATION_SIMULATOR",
  "COSINE_SIMILARITY",
  "COUNT",
  "ENDPOINT",
  "FOR_LOOP",
  "HUMAN",
  "JSON_PATH",
  "LLM_ASSERTION",
  "MATH_OPERATOR",
  "MCP",
  "MIN_MAX",
  "PARSE_VALUE",
  "PROMPT_TEMPLATE",
  "REGEX",
  "REGEX_EXTRACTION",
  "VARIABLE",
  "WHILE_LOOP",
  "WORKFLOW",
  "XML_PATH",
]);
const cellSchema = s.looseObject("A normalized PromptLayer Table cell.", {
  id: s.uuid("The cell UUID."),
  sheetId: s.uuid("The sheet UUID that owns the cell."),
  columnId: s.uuid("The column UUID that owns the cell."),
  rowIndex: s.integer("The row index of the cell."),
  status: cellStatusSchema,
  displayValue: s.nullableString("The display-ready cell value when returned."),
  value: s.unknown("The structured cell value, whose shape depends on the column type."),
  error: s.nullableString("The provider error associated with the cell when returned."),
  inputHash: s.nullableString("The hash used by PromptLayer for cell cache invalidation."),
  updatedAt: s.dateTime("The timestamp when the cell was last updated."),
  requestMetrics: s.nullable(requestMetricsSchema),
  executionId: s.nullable(s.uuid("The execution UUID associated with the cell.")),
  lastComputedVersion: s.nullableInteger("The sheet version at which this cell was last computed."),
  errorMessage: s.nullableString("The user-visible error message for a failed computed cell."),
});

const promptTemplateSummarySchema = s.looseRequiredObject(
  "A normalized PromptLayer prompt template.",
  {
    id: s.integer("The PromptLayer prompt template ID."),
    promptName: s.string("The prompt template name."),
    version: s.nullableInteger("The prompt template version when returned."),
    isSnippet: s.nullableBoolean("Whether this prompt template is a snippet."),
    promptTemplate: looseObjectSchema,
    metadata: s.nullable(looseObjectSchema),
    commitMessage: s.nullableString("The commit message associated with the version."),
    llmKwargs: s.nullable(looseObjectSchema),
    externalIds: s.array("The external ID mappings attached to the prompt template.", looseObjectSchema),
    raw: rawPayloadSchema,
  },
  { optional: [] },
);
const promptTemplateDetailSchema = s.looseRequiredObject(
  "A normalized PromptLayer prompt template detail.",
  {
    id: s.integer("The PromptLayer prompt template ID."),
    promptName: s.string("The prompt template name."),
    version: s.nullableInteger("The prompt template version when returned."),
    promptTemplate: looseObjectSchema,
    metadata: s.nullable(looseObjectSchema),
    commitMessage: s.nullableString("The commit message associated with the version."),
    llmKwargs: s.nullable(looseObjectSchema),
    raw: rawPayloadSchema,
  },
  { optional: [] },
);
const requestLogSchema = s.looseRequiredObject(
  "A normalized PromptLayer request log detail.",
  {
    success: s.boolean("Whether PromptLayer returned the request successfully."),
    requestId: s.integer("The PromptLayer request ID."),
    provider: s.nullableString("The LLM provider recorded for the request."),
    model: s.nullableString("The LLM model recorded for the request."),
    inputTokens: s.nullableInteger("The input token count when returned."),
    outputTokens: s.nullableInteger("The output token count when returned."),
    tokens: s.nullableInteger("The total token count when returned."),
    price: s.nullableNumber("The request price in USD when returned."),
    requestStartTime: s.nullable(s.dateTime("The request start timestamp when returned.")),
    requestEndTime: s.nullable(s.dateTime("The request end timestamp when returned.")),
    latencyMs: s.nullableNumber("The request latency in milliseconds when returned."),
    traceId: s.nullableString("The associated trace ID when returned."),
    promptBlueprint: looseObjectSchema,
    raw: rawPayloadSchema,
  },
  { optional: [] },
);
const tableSchema = s.looseRequiredObject(
  "A normalized PromptLayer Table.",
  {
    id: s.uuid("The PromptLayer Table UUID."),
    workspaceId: s.nullableInteger("The workspace ID that owns the table."),
    title: s.nullableString("The table title."),
    folderId: s.nullableInteger("The folder ID that contains the table."),
    sheetCount: s.nullableInteger("The number of active sheets in the table."),
    createdAt: s.nullable(s.dateTime("The table creation timestamp.")),
    updatedAt: s.nullable(s.dateTime("The table update timestamp.")),
    raw: rawPayloadSchema,
  },
  { optional: [] },
);
const sheetSchema = s.looseRequiredObject(
  "A normalized PromptLayer Table sheet.",
  {
    id: s.uuid("The PromptLayer sheet UUID."),
    tableId: s.uuid("The PromptLayer Table UUID that owns the sheet."),
    workspaceId: s.nullableInteger("The workspace ID that owns the sheet."),
    title: s.nullableString("The sheet title."),
    index: s.nullableInteger("The zero-based display order of the sheet."),
    rowCount: s.nullableInteger("The number of rows in the sheet."),
    versionCount: s.nullableInteger("The current sheet version count."),
    createdAt: s.nullable(s.dateTime("The sheet creation timestamp.")),
    updatedAt: s.nullable(s.dateTime("The sheet update timestamp.")),
    raw: rawPayloadSchema,
  },
  { optional: [] },
);
const columnSchema = s.looseRequiredObject(
  "A PromptLayer Table column returned with rows.",
  {
    id: s.uuid("The column UUID."),
    sheetId: s.nullable(s.uuid("The sheet UUID that owns the column.")),
    workspaceId: s.nullableInteger("The workspace ID that owns the column."),
    title: s.nullableString("The column display title."),
    type: s.nullable(tableColumnTypeSchema),
    config: s.nullable(looseObjectSchema),
    positionRank: s.nullableNumber("The fractional position rank used to order the column."),
    isOutputColumn: s.nullableBoolean("Whether PromptLayer treats this column as an output column."),
    raw: rawPayloadSchema,
  },
  { optional: [] },
);
const rowSchema = s.looseRequiredObject(
  "A PromptLayer Table row.",
  {
    rowIndex: s.integer("The row index in the sheet."),
    cells: s.record("Normalized cells keyed by column UUID.", cellSchema),
    raw: rawPayloadSchema,
  },
  { optional: [] },
);

const listPromptTemplatesInputSchema: JsonSchema = {
  ...s.object(
    "The input payload for listing PromptLayer prompt templates.",
    {
      page: s.positiveInteger("The page number to retrieve."),
      perPage: s.integer("The number of prompt templates per page.", { minimum: 1, maximum: 100 }),
      label: s.nonEmptyString("Filter prompt templates by release label."),
      name: s.nonEmptyString("Filter prompt templates by case-insensitive partial name."),
      tags: s.stringArray("Tags that returned prompt templates must contain.", {
        minItems: 1,
        itemDescription: "One PromptLayer tag.",
      }),
      status: promptTemplateStatusSchema,
      externalSource: s.nonEmptyString("External ID source to filter by."),
      externalId: s.nonEmptyString("External ID value to filter by."),
      createdByEmail: s.email("Filter prompt templates by creator email address."),
      createdAfter: s.dateTime("Filter resources created at or after this timestamp."),
      createdBefore: s.dateTime("Filter resources created at or before this timestamp."),
      updatedAfter: s.dateTime("Filter resources updated at or after this timestamp."),
      updatedBefore: s.dateTime("Filter resources updated at or before this timestamp."),
      sortBy: promptTemplateSortBySchema,
      sortOrder: promptTemplateOrderSchema,
      isSnippet: s.boolean("When true, return snippets only. When false, exclude snippets."),
    },
    {
      optional: [
        "page",
        "perPage",
        "label",
        "name",
        "tags",
        "status",
        "externalSource",
        "externalId",
        "createdByEmail",
        "createdAfter",
        "createdBefore",
        "updatedAfter",
        "updatedBefore",
        "sortBy",
        "sortOrder",
        "isSnippet",
      ],
    },
  ),
  dependentRequired: {
    externalSource: ["externalId"],
    externalId: ["externalSource"],
  },
};
const getPromptTemplateInputSchema: JsonSchema = {
  ...s.object(
    "The input payload for retrieving a PromptLayer prompt template.",
    {
      identifier: s.nonEmptyString("The prompt name or prompt ID to retrieve."),
      version: s.positiveInteger("The prompt template version to retrieve."),
      workspaceId: s.integer("The PromptLayer workspace ID to use for prompt retrieval."),
      label: s.nonEmptyString("The release label to retrieve, such as prod or dev."),
      provider: promptTemplateProviderSchema,
      inputVariables: stringRecordSchema,
      metadataFilters: stringRecordSchema,
      model: s.nonEmptyString("The model name used for provider-specific defaults."),
      modelParameterOverrides: s.looseObject("Model parameter overrides passed to PromptLayer."),
    },
    {
      optional: [
        "version",
        "workspaceId",
        "label",
        "provider",
        "inputVariables",
        "metadataFilters",
        "model",
        "modelParameterOverrides",
      ],
    },
  ),
  not: { required: ["version", "label"] },
};

export const promptLayerActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_request",
    operationType: "read",
    description: "Retrieve a logged PromptLayer request by request ID.",
    inputSchema: s.actionInput(
      { requestId: s.positiveInteger("The PromptLayer request ID to retrieve.") },
      ["requestId"],
      "The input payload for retrieving a PromptLayer request.",
    ),
    outputSchema: s.requiredObject("The response returned when retrieving a PromptLayer request.", {
      request: requestLogSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_prompt_templates",
    operationType: "read",
    description: "List PromptLayer prompt templates in the authenticated workspace.",
    inputSchema: listPromptTemplatesInputSchema,
    outputSchema: s.requiredObject("The response returned when listing PromptLayer prompt templates.", {
      items: s.array("The prompt templates returned by PromptLayer.", promptTemplateSummarySchema),
      page: s.integer("The current page number."),
      pages: s.integer("The total number of pages."),
      total: s.integer("The total number of matching prompt templates."),
      hasNext: s.boolean("Whether a next page exists."),
      hasPrev: s.boolean("Whether a previous page exists."),
      nextNum: s.integer("The next page number."),
      prevNum: s.integer("The previous page number."),
      raw: rawPayloadSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_prompt_template",
    operationType: "read",
    description: "Retrieve a PromptLayer prompt template by name or ID.",
    inputSchema: getPromptTemplateInputSchema,
    outputSchema: s.requiredObject("The response returned when retrieving a PromptLayer prompt template.", {
      promptTemplate: promptTemplateDetailSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_tables",
    operationType: "read",
    description: "List PromptLayer Tables in the authenticated workspace.",
    inputSchema: s.object(
      "The input payload for listing PromptLayer Tables.",
      {
        folderId: s.positiveInteger("Filter tables by folder ID."),
        name: s.nonEmptyString("Filter tables by title using a case-insensitive contains match."),
        cursor: cursorSchema,
        limit: tableListLimitSchema,
        order: tableListOrderSchema,
        promptId: s.positiveInteger("Filter tables containing a column for this prompt ID."),
        promptVersionId: s.positiveInteger("Filter tables by prompt version ID."),
        promptLabelId: s.positiveInteger("Filter tables by prompt label ID."),
      },
      {
        optional: ["folderId", "name", "cursor", "limit", "order", "promptId", "promptVersionId", "promptLabelId"],
      },
    ),
    outputSchema: s.requiredObject("The response returned when listing PromptLayer Tables.", {
      tables: s.array("The Tables returned by PromptLayer.", tableSchema),
      nextCursor: s.nullableString("The cursor for the next page."),
      hasMore: s.boolean("Whether more results are available."),
      raw: rawPayloadSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_table_sheets",
    operationType: "read",
    description: "List sheets for a PromptLayer Table.",
    inputSchema: s.object(
      "The input payload for listing PromptLayer Table sheets.",
      {
        tableId: s.uuid("The PromptLayer Table UUID."),
        cursor: cursorSchema,
        limit: sheetListLimitSchema,
        order: sheetListOrderSchema,
        promptId: s.positiveInteger("Filter sheets containing a column for this prompt ID."),
        promptVersionId: s.positiveInteger("Filter sheets by prompt version ID."),
        promptLabelId: s.positiveInteger("Filter sheets by prompt label ID."),
      },
      { optional: ["cursor", "limit", "order", "promptId", "promptVersionId", "promptLabelId"] },
    ),
    outputSchema: s.requiredObject("The response returned when listing PromptLayer Table sheets.", {
      sheets: s.array("The sheets returned by PromptLayer.", sheetSchema),
      nextCursor: s.nullableString("The cursor for the next page."),
      hasMore: s.boolean("Whether more results are available."),
      raw: rawPayloadSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_table_sheet_rows",
    operationType: "read",
    description: "List rows for a PromptLayer Table sheet.",
    inputSchema: s.object(
      "The input payload for listing PromptLayer Table sheet rows.",
      {
        tableId: s.uuid("The PromptLayer Table UUID."),
        sheetId: s.uuid("The PromptLayer sheet UUID."),
        includeSystemColumns: s.boolean({
          description: "Whether to include system-managed metadata columns.",
          default: false,
        }),
        includeExecutionMetadataAggregates: s.boolean({
          description: "Whether to include sheet-level and per-column execution metric aggregates.",
          default: false,
        }),
        cursor: cursorSchema,
        limit: rowListLimitSchema,
        order: rowListOrderSchema,
        includeColumns: s.boolean(
          "Whether to include column metadata in the response. PromptLayer defaults this to true on the first page.",
        ),
        includeRowCount: s.boolean({
          description: "Whether to include the row count in the response.",
          default: true,
        }),
      },
      {
        optional: [
          "includeSystemColumns",
          "includeExecutionMetadataAggregates",
          "cursor",
          "limit",
          "order",
          "includeColumns",
          "includeRowCount",
        ],
      },
    ),
    outputSchema: s.requiredObject("The response returned when listing PromptLayer Table sheet rows.", {
      rows: s.array("The rows returned by PromptLayer.", rowSchema),
      columns: s.array("The columns returned by PromptLayer when requested.", columnSchema),
      nextCursor: s.nullableString("The cursor for the next page."),
      hasMore: s.boolean("Whether more results are available."),
      rowCount: s.nullableInteger("The sheet row count when returned."),
      version: s.nullableInteger("The sheet version count for this response."),
      executionMetadataAggregates: s.nullable(s.looseObject("Execution metric aggregates returned by PromptLayer.")),
      raw: rawPayloadSchema,
    }),
  }),
];
