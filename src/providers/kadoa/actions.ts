import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "kadoa" as const;

const trimmedString = (description: string) => s.nonEmptyString(description);

const workflowStateSchema = s.stringEnum("The persisted Kadoa workflow state to match.", [
  "ACTIVE",
  "DRAFT",
  "PAUSED",
  "PREVIEW",
  "QUEUED",
  "SETUP",
  "COMPLIANCE_REVIEW",
  "COMPLIANCE_REJECTED",
  "NOT_SUPPORTED",
  "ERROR",
  "DELETED",
]);

const workflowDisplayStateSchema = s.stringEnum("The computed Kadoa workflow display state to match.", [
  "ACTIVE",
  "DRAFT",
  "PAUSED",
  "PREVIEW",
  "FAILED",
  "RUNNING",
  "VALIDATING",
  "PENDING_START",
  "COMPLIANCE_REVIEW",
  "COMPLIANCE_REJECTED",
]);

const workflowRunStateSchema = s.stringEnum("The latest Kadoa workflow run state to match.", [
  "FAILED",
  "FINISHED",
  "RUNNING",
]);

const workflowSummarySchema = s.looseRequiredObject("A Kadoa workflow summary.", {
  id: s.string("The unique Kadoa workflow identifier."),
  name: s.string("The workflow name."),
  description: s.string("The workflow description."),
  state: s.string("The persisted workflow lifecycle state."),
  displayState: s.string("The computed workflow state shown to users."),
  runState: s.string("The latest workflow execution state."),
  createdAt: s.dateTime("The timestamp when the workflow was created."),
  tags: s.stringArray("Tags associated with the workflow."),
  totalRecords: s.integer("The total number of records extracted by the latest run."),
});

const paginationSchema = s.requiredObject("Pagination metadata returned by Kadoa.", {
  totalCount: s.nonNegativeInteger("The total number of matching records."),
  page: s.nonNegativeInteger("The current result page."),
  totalPages: s.nonNegativeInteger("The total number of result pages."),
  limit: s.nonNegativeInteger("The page size used for the request."),
});

const workflowDataFilterSchema = s.object("A structured filter that Kadoa applies to workflow data.", {
  field: trimmedString("The workflow schema field to filter."),
  operator: trimmedString("The Kadoa comparison operator to apply."),
  value: s.unknown("The value to compare with the workflow field."),
});

const workflowDataQueryProperties = {
  workflowId: trimmedString("The unique identifier of the Kadoa workflow."),
  runId: trimmedString("The optional workflow run identifier."),
  filters: s.array("Structured filters to apply to workflow records.", workflowDataFilterSchema, {
    minItems: 1,
  }),
  sortBy: trimmedString("The workflow field used to sort records."),
  order: s.withDefault(s.stringEnum("The sort direction for workflow records.", ["asc", "desc"]), "asc"),
  rowIds: s.array("Specific workflow record identifiers to include.", trimmedString("A workflow record identifier."), {
    minItems: 1,
  }),
};

const workflowDataInputSchema = s.object(
  "The input payload for retrieving a bounded page of Kadoa workflow data.",
  {
    ...workflowDataQueryProperties,
    page: s.withDefault(s.integer("The one-based result page.", { minimum: 1 }), 1),
    limit: s.withDefault(s.integer("The positive number of records to return on this page.", { minimum: 1 }), 25),
    includeAnomalies: s.boolean("Whether Kadoa should include data-validation anomalies for each record."),
  },
  {
    optional: ["runId", "filters", "sortBy", "order", "rowIds", "page", "limit", "includeAnomalies"],
  },
);

const workflowDataOutputSchema = s.object(
  "A bounded page of extracted Kadoa workflow records.",
  {
    workflowId: s.string("The Kadoa workflow identifier."),
    runId: s.nullable(s.string("The workflow run identifier used for the result.")),
    executedAt: s.nullable(s.dateTime("The timestamp when the selected workflow run was executed.")),
    data: s.array(
      "The extracted records defined by the workflow schema.",
      s.looseObject("An extracted workflow record."),
    ),
    pagination: paginationSchema,
  },
  { optional: ["runId", "executedAt"] },
);

export const kadoaActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_workflows",
    operationType: "read",
    description: "List Kadoa workflows with pagination and optional lifecycle, execution, and scheduling filters.",
    inputSchema: s.object(
      "The input payload for listing Kadoa workflows.",
      {
        search: trimmedString("A search term matched against workflow names or identifiers."),
        skip: s.withDefault(s.nonNegativeInteger("The number of workflows to skip."), 0),
        limit: s.withDefault(s.integer("The maximum number of workflows to return.", { minimum: 1 }), 25),
        state: workflowStateSchema,
        runState: workflowRunStateSchema,
        displayState: workflowDisplayStateSchema,
        monitoring: s.boolean("Whether to return only monitored or unmonitored workflows."),
        updateInterval: s.stringEnum("The workflow update interval to match.", [
          "HOURLY",
          "DAILY",
          "WEEKLY",
          "MONTHLY",
          "REAL_TIME",
        ]),
        scheduleType: s.stringEnum("The workflow scheduling mode to match.", ["RUN_ONCE", "RECURRING"]),
        includeDeleted: s.boolean("Whether deleted workflows should be included."),
      },
      {
        optional: [
          "search",
          "skip",
          "limit",
          "state",
          "runState",
          "displayState",
          "monitoring",
          "updateInterval",
          "scheduleType",
          "includeDeleted",
        ],
      },
    ),
    outputSchema: s.requiredObject("A paginated list of Kadoa workflows.", {
      workflows: s.array("The workflows matching the request.", workflowSummarySchema),
      pagination: paginationSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_workflow",
    operationType: "read",
    description: "Get the current configuration and execution status of a Kadoa workflow.",
    inputSchema: s.requiredObject("The input payload for retrieving a Kadoa workflow.", {
      workflowId: trimmedString("The unique identifier of the Kadoa workflow."),
    }),
    outputSchema: s.looseRequiredObject("The detailed Kadoa workflow resource.", {
      id: s.string("The unique Kadoa workflow identifier."),
      name: s.string("The workflow name."),
      description: s.string("The workflow description."),
      state: s.string("The persisted workflow lifecycle state."),
      displayState: s.string("The computed workflow state shown to users."),
      runState: s.string("The latest workflow execution state."),
      createdAt: s.dateTime("The timestamp when the workflow was created."),
      totalRecords: s.integer("The total number of records extracted by the latest run."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_workflow_data",
    operationType: "read",
    description: "Retrieve a bounded JSON page of extracted records from the latest or a specific Kadoa workflow run.",
    inputSchema: workflowDataInputSchema,
    outputSchema: workflowDataOutputSchema,
  }),
  defineProviderAction(service, {
    name: "export_workflow_data",
    operationType: "read",
    description: "Materialize all matching Kadoa workflow records and return a temporary signed download URL.",
    inputSchema: s.object(
      "The input payload for exporting Kadoa workflow data.",
      {
        ...workflowDataQueryProperties,
        format: s.withDefault(
          s.stringEnum("The file format for the materialized workflow export.", ["csv", "json", "parquet"]),
          "csv",
        ),
      },
      {
        optional: ["runId", "filters", "sortBy", "order", "rowIds", "format"],
      },
    ),
    outputSchema: s.object(
      "Metadata for a materialized Kadoa workflow data export.",
      {
        workflowId: s.string("The Kadoa workflow identifier."),
        runId: s.string("The workflow run identifier exported by Kadoa."),
        executedAt: s.dateTime("The timestamp when the exported workflow run was executed."),
        format: s.stringEnum("The generated export format.", ["csv", "json", "parquet"]),
        rowCount: s.nonNegativeInteger("The number of records in the export."),
        url: s.url("The signed self-authenticating download URL."),
        expiresAt: s.dateTime("The timestamp when the signed download URL expires."),
      },
      { optional: ["executedAt"] },
    ),
  }),
];

export type KadoaActionName = "list_workflows" | "get_workflow" | "get_workflow_data" | "export_workflow_data";
