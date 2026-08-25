import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "skyvern";

const runStatuses = [
  "created",
  "queued",
  "running",
  "paused",
  "timed_out",
  "failed",
  "terminated",
  "completed",
  "canceled",
];

const runTypes = [
  "task_v1",
  "task_v2",
  "task_v3",
  "workflow_run",
  "openai_cua",
  "anthropic_cua",
  "ui_tars",
  "yutori_navigator",
];

const runSchema = s.looseRequiredObject(
  "A normalized Skyvern run with stable lifecycle fields and provider-defined result data.",
  {
    runId: s.string("The unique Skyvern task or workflow run identifier."),
    status: s.stringEnum("The current lifecycle status of the run.", runStatuses),
    runType: s.string("The Skyvern engine or workflow type used for this run."),
    output: s.nullable(s.unknown("The provider-defined structured or textual run output.")),
    failureReason: s.nullable(s.string("The reason the run failed or terminated.")),
    createdAt: s.dateTime("The timestamp when Skyvern created the run."),
    modifiedAt: s.dateTime("The timestamp when Skyvern last modified the run."),
    startedAt: s.nullable(s.dateTime("The timestamp when execution started.")),
    finishedAt: s.nullable(s.dateTime("The timestamp when execution finished.")),
    recordingUrl: s.nullable(s.url("The provider-hosted recording URL for the run.")),
    screenshotUrls: s.array(
      "Provider-hosted screenshot URLs in reverse chronological order.",
      s.url("A provider-hosted screenshot URL."),
    ),
    downloadedFiles: s.array(
      "Metadata and provider-hosted URLs for files downloaded during the run.",
      s.looseRequiredObject("One file downloaded during the run.", {
        url: s.url("The provider-hosted URL used to access the downloaded file."),
      }),
    ),
    appUrl: s.nullable(s.url("The Skyvern application URL for viewing this run.")),
  },
  {
    optional: [
      "output",
      "failureReason",
      "modifiedAt",
      "startedAt",
      "finishedAt",
      "recordingUrl",
      "screenshotUrls",
      "downloadedFiles",
      "appUrl",
    ],
  },
);

const runListItemSchema = s.looseRequiredObject(
  "A compact Skyvern run-history item.",
  {
    runId: s.string("The unique Skyvern run identifier."),
    status: s.string("The current lifecycle status reported by Skyvern."),
    runType: s.string("The Skyvern task or workflow run type."),
    createdAt: s.dateTime("The timestamp when Skyvern created the run."),
    title: s.nullable(s.string("The optional title of the run.")),
    startedAt: s.nullable(s.dateTime("The timestamp when execution started.")),
    finishedAt: s.nullable(s.dateTime("The timestamp when execution finished.")),
  },
  { optional: ["title", "startedAt", "finishedAt"] },
);

export const skyvernActions: readonly ActionDefinition[] = [
  defineProviderAction(service, {
    name: "run_task",
    description:
      "Start a high-level Skyvern browser automation task and return a run ID that can be polled until completion.",
    requiredScopes: [],
    asyncLifecycle: { startActionId: "skyvern.run_task", statusActionId: "skyvern.get_run" },
    inputSchema: s.object(
      "The prompt and optional browser settings for a new Skyvern task.",
      {
        prompt: s.nonWhitespaceString("The goal or task Skyvern should accomplish."),
        url: s.url("The optional starting URL for the browser task."),
        engine: s.stringEnum("The Skyvern engine that should run the task.", [
          "skyvern-1.0",
          "skyvern-2.0",
          "skyvern-3.0",
          "openai-cua",
          "anthropic-cua",
          "ui-tars",
          "yutori-navigator",
        ]),
        title: s.nonEmptyString("An optional title for identifying the task."),
        dataExtractionSchema: s.anyOf(
          "An optional JSON Schema or provider-supported extraction schema for consistent output.",
          [
            s.looseObject("A JSON object extraction schema."),
            s.array("A JSON array extraction schema.", s.unknown("One schema array item.")),
            s.string("A textual extraction schema."),
          ],
        ),
        maxSteps: s.integer("The maximum number of browser steps Skyvern may execute before failing the task."),
        webhookUrl: s.url("The optional HTTPS endpoint Skyvern should notify after completion."),
        browserSessionId: s.nonEmptyString("An existing Skyvern browser session identifier to continue using."),
        browserProfileId: s.nonEmptyString("An existing Skyvern browser profile identifier to reuse."),
        startFreshBrowser: s.boolean("Whether to start with an empty browser and ignore saved browser memory."),
      },
      {
        optional: [
          "url",
          "engine",
          "title",
          "dataExtractionSchema",
          "maxSteps",
          "webhookUrl",
          "browserSessionId",
          "browserProfileId",
          "startFreshBrowser",
        ],
      },
    ),
    outputSchema: s.object("The Skyvern run created for the task.", { run: runSchema }),
  }),
  defineProviderAction(service, {
    name: "get_run",
    description: "Get the current state, output, hosted files, screenshots, and recording URLs for one Skyvern run.",
    requiredScopes: [],
    inputSchema: s.object("The Skyvern run to retrieve.", {
      runId: s.nonWhitespaceString("The task or workflow run identifier."),
    }),
    outputSchema: s.object("The current Skyvern run details.", { run: runSchema }),
  }),
  defineProviderAction(service, {
    name: "list_runs",
    description: "List Skyvern task and workflow runs with pagination and optional status, type, or text filters.",
    requiredScopes: [],
    inputSchema: s.object(
      "Pagination and filters for Skyvern run history.",
      {
        page: s.integer("The one-based results page to retrieve.", { minimum: 1, maximum: 100 }),
        pageSize: s.integer("The number of runs to return per page.", {
          minimum: 1,
          maximum: 100,
        }),
        statuses: s.array("The run statuses to include.", s.stringEnum("A Skyvern run status.", runStatuses)),
        searchKey: s.string("A case-insensitive substring to search for.", { minLength: 3 }),
        runTypes: s.array("The task or workflow run types to include.", s.stringEnum("A Skyvern run type.", runTypes)),
      },
      { optional: ["page", "pageSize", "statuses", "searchKey", "runTypes"] },
    ),
    outputSchema: s.object("The matching Skyvern runs.", {
      runs: s.array("The runs returned for this page.", runListItemSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "cancel_run",
    description: "Cancel one active Skyvern task or workflow run.",
    requiredScopes: [],
    inputSchema: s.object("The Skyvern run to cancel.", {
      runId: s.nonWhitespaceString("The task or workflow run identifier to cancel."),
    }),
    outputSchema: s.object("Confirmation that the cancellation request succeeded.", {
      runId: s.string("The Skyvern run identifier sent for cancellation."),
      canceled: s.boolean("Whether Skyvern accepted the cancellation request."),
    }),
  }),
];
