import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "hex";

const projectIdField = s.uuid("Unique ID for a Hex project.");
const runIdField = s.uuid("Unique ID for a run of a Hex project.");
const cursorField = s.nonEmptyString("Pagination cursor returned by Hex.");
const limitField = s.integer("Number of results to return.", { minimum: 1, maximum: 100 });
const projectSortBySchema = s.stringEnum("Field used to sort Hex projects.", [
  "CREATED_AT",
  "LAST_EDITED_AT",
  "LAST_PUBLISHED_AT",
]);
const sortDirectionSchema = s.stringEnum("Sort direction accepted by Hex.", ["ASC", "DESC"]);
const runStatusSchema = s.stringEnum("Hex project run status.", [
  "PENDING",
  "RUNNING",
  "ERRORED",
  "COMPLETED",
  "KILLED",
  "UNABLE_TO_ALLOCATE_KERNEL",
]);

const inputParamsSchema = s.record(
  "Input parameters for the Hex project run, keyed by project variable name.",
  s.unknown("A Hex project input value."),
);
const notificationSchema = s.object("Notification recipient for a Hex project run.", {
  type: s.nonEmptyString("Notification type, such as slack, user, or group."),
  recipient: s.nonEmptyString("Notification recipient identifier."),
});
const paginationSchema = s.looseObject("Pagination metadata returned by Hex.");
const projectSchema = s.looseObject("Hex project metadata.");
const runSchema = s.looseObject("Hex project run metadata.");

const listProjectsInputSchema = s.actionInput(
  {
    limit: limitField,
    after: cursorField,
    before: cursorField,
    sortBy: projectSortBySchema,
    sortDirection: sortDirectionSchema,
    statuses: s.array("Project statuses to include.", s.nonEmptyString("Project status name."), {
      minItems: 1,
    }),
    categories: s.array("Project categories to include.", s.nonEmptyString("Project category name."), {
      minItems: 1,
    }),
    ownerEmail: s.email("Owner email address used to filter projects."),
    creatorEmail: s.email("Creator email address used to filter projects."),
    collectionId: s.nonEmptyString("Collection ID used to filter projects."),
    includeSharing: s.boolean("Whether to include sharing information for each project."),
    includeArchived: s.boolean("Whether to include archived projects."),
    includeTrashed: s.boolean("Whether to include trashed projects."),
    includeComponents: s.boolean("Whether to include component projects."),
  },
  [],
  "Request parameters for listing Hex projects.",
);

const listProjectsOutputSchema = s.actionOutput(
  {
    values: s.array("Projects returned by Hex.", projectSchema),
    pagination: s.nullable(paginationSchema),
    raw: s.looseObject("Raw Hex response payload."),
  },
  "Hex project list response.",
);

const getProjectInputSchema = s.actionInput(
  {
    projectId: projectIdField,
    includeSharing: s.boolean("Whether to include sharing information in the response."),
  },
  ["projectId"],
  "Request parameters for getting a Hex project.",
);

const getProjectOutputSchema = s.actionOutput(
  {
    project: projectSchema,
    raw: s.looseObject("Raw Hex response payload."),
  },
  "Hex project response.",
);

const runProjectInputSchema = s.actionInput(
  {
    projectId: projectIdField,
    inputParams: inputParamsSchema,
    notifications: s.array("Notifications to send when the run completes.", notificationSchema, {
      minItems: 1,
    }),
    dryRun: s.boolean("Whether to validate run inputs without executing the project."),
    updatePublishedResults: s.boolean(
      "Whether to update the cached state of the published app after a successful run.",
    ),
    useCachedSqlResults: s.boolean("Whether to use cached SQL results when available."),
    viewId: s.uuid("Saved view ID to use for project run inputs."),
    flagConfigOverride: s.nonEmptyString("Feature flag configuration override for the run."),
  },
  ["projectId"],
  "Request parameters for running a Hex project.",
);

const runProjectOutputSchema = s.actionOutput(
  {
    runId: runIdField,
    projectId: projectIdField,
    runUrl: s.nullable(s.url("URL to view the run in Hex.")),
    runStatusUrl: s.nullable(s.url("API URL to check the run status.")),
    traceId: s.nullableString("Trace ID returned by Hex."),
    projectVersion: s.nullableInteger("Project version used by the run."),
    notifications: s.nullable(s.array("Notifications returned by Hex.", s.unknown("Notification."))),
    raw: s.looseObject("Raw Hex response payload."),
  },
  "Hex project run creation response.",
);

const listProjectRunsInputSchema = s.actionInput(
  {
    projectId: projectIdField,
    limit: limitField,
    offset: s.nonNegativeInteger("Number of runs to skip before returning results."),
    statusFilter: runStatusSchema,
  },
  ["projectId"],
  "Request parameters for listing Hex project runs.",
);

const listProjectRunsOutputSchema = s.actionOutput(
  {
    runs: s.array("Project runs returned by Hex.", runSchema),
    nextPage: s.nullableString("Next page URL or token returned by Hex."),
    previousPage: s.nullableString("Previous page URL or token returned by Hex."),
    traceId: s.nullableString("Trace ID returned by Hex."),
    raw: s.looseObject("Raw Hex response payload."),
  },
  "Hex project runs response.",
);

const getRunStatusInputSchema = s.actionInput(
  {
    projectId: projectIdField,
    runId: runIdField,
    enableExpandedStats: s.boolean("Whether to request expanded run statistics from Hex."),
  },
  ["projectId", "runId"],
  "Request parameters for getting a Hex project run status.",
);

const getRunStatusOutputSchema = s.actionOutput(
  {
    runId: runIdField,
    projectId: projectIdField,
    status: runStatusSchema,
    run: runSchema,
    raw: s.looseObject("Raw Hex response payload."),
  },
  "Hex project run status response.",
);

const cancelRunInputSchema = s.actionInput(
  {
    projectId: projectIdField,
    runId: runIdField,
  },
  ["projectId", "runId"],
  "Request parameters for cancelling a Hex project run.",
);

const cancelRunOutputSchema = s.actionOutput(
  {
    success: s.boolean("Whether the cancellation request succeeded."),
  },
  "Hex project run cancellation response.",
);

export const hexActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_projects",
    description: "List Hex projects visible to the connected token, with pagination and common project filters.",
    inputSchema: listProjectsInputSchema,
    outputSchema: listProjectsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_project",
    description: "Get metadata for a single Hex project by project ID.",
    inputSchema: getProjectInputSchema,
    outputSchema: getProjectOutputSchema,
  }),
  defineProviderAction(service, {
    name: "run_project",
    description: "Trigger a run of the latest published version of a Hex project.",
    followUpActions: ["hex.get_run_status"],
    asyncLifecycle: {
      startActionId: "hex.run_project",
      statusActionId: "hex.get_run_status",
      cancelActionId: "hex.cancel_run",
    },
    inputSchema: runProjectInputSchema,
    outputSchema: runProjectOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_project_runs",
    description: "List API-triggered runs for a Hex project, optionally filtered by status.",
    inputSchema: listProjectRunsInputSchema,
    outputSchema: listProjectRunsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_run_status",
    description: "Get the status and metadata for a specific Hex project run.",
    asyncLifecycle: {
      startActionId: "hex.run_project",
      statusActionId: "hex.get_run_status",
      cancelActionId: "hex.cancel_run",
    },
    inputSchema: getRunStatusInputSchema,
    outputSchema: getRunStatusOutputSchema,
  }),
  defineProviderAction(service, {
    name: "cancel_run",
    description: "Cancel an in-progress Hex project run.",
    inputSchema: cancelRunInputSchema,
    outputSchema: cancelRunOutputSchema,
  }),
];
