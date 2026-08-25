import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "trigger_dev";

const runIdSchema = s.nonEmptyString("The Trigger.dev run ID, prefixed with run_.");
const taskIdentifierSchema = s.nonEmptyString("The Trigger.dev task identifier to execute.");
const jsonValueSchema = s.unknown("Any JSON value accepted by Trigger.dev.");
const looseObjectSchema = s.looseObject("A JSON object returned by Trigger.dev.");

const runStatusSchema = s.stringEnum("A Trigger.dev run status.", [
  "PENDING_VERSION",
  "QUEUED",
  "EXECUTING",
  "REATTEMPTING",
  "FROZEN",
  "COMPLETED",
  "CANCELED",
  "FAILED",
  "CRASHED",
  "INTERRUPTED",
  "SYSTEM_FAILURE",
]);

const listRunsInputSchema = s.object(
  "Filters and cursor pagination for listing Trigger.dev runs.",
  {
    pageSize: s.integer("Number of runs per page.", { minimum: 10, maximum: 100 }),
    pageAfter: s.nonEmptyString("Run ID to start the next page after."),
    pageBefore: s.nonEmptyString("Run ID to start the previous page before."),
    statuses: s.array("Statuses to include in the run list.", runStatusSchema, { minItems: 1 }),
    taskIdentifiers: s.array("Task identifiers to include in the run list.", taskIdentifierSchema, {
      minItems: 1,
    }),
    versions: s.array("Worker versions to include in the run list.", s.nonEmptyString("A worker version."), {
      minItems: 1,
    }),
    createdFrom: s.dateTime("Only include runs created at or after this time."),
    createdTo: s.dateTime("Only include runs created at or before this time."),
    createdPeriod: s.nonEmptyString("Relative created-at period accepted by Trigger.dev, such as 1d."),
    bulkAction: s.nonEmptyString("Bulk action ID to filter by."),
    schedule: s.nonEmptyString("Schedule ID to filter by."),
    isTest: s.boolean("Whether to include only test or non-test runs."),
  },
  {
    optional: [
      "pageSize",
      "pageAfter",
      "pageBefore",
      "statuses",
      "taskIdentifiers",
      "versions",
      "createdFrom",
      "createdTo",
      "createdPeriod",
      "bulkAction",
      "schedule",
      "isTest",
    ],
  },
);

const getRunInputSchema = s.object("Input for retrieving a Trigger.dev run.", {
  runId: runIdSchema,
});

const triggerTaskOptionsSchema = s.object(
  "Trigger.dev run options for a task trigger request.",
  {
    queue: s.object(
      "Queue options for the triggered run.",
      {
        name: s.nonEmptyString("Queue name."),
        concurrencyLimit: s.integer("Maximum concurrent executions for the queue.", {
          minimum: 0,
          maximum: 1000,
        }),
      },
      { optional: ["concurrencyLimit"] },
    ),
    concurrencyKey: s.nonEmptyString("Concurrency scope key for this run."),
    idempotencyKey: s.nonEmptyString("Idempotency key used to deduplicate triggered runs."),
    ttl: s.anyOf("Time-to-live for the queued run.", [
      s.nonEmptyString("Duration string such as 1h42m."),
      s.number("Duration in seconds.", { minimum: 1 }),
    ]),
    delay: s.nonEmptyString("Delay before the task executes, such as 1h or an ISO date-time."),
    tags: s.stringArray("Tags to attach to the run.", {
      minItems: 1,
      maxItems: 10,
      itemDescription: "A run tag.",
    }),
    machine: s.stringEnum("Machine preset to use for this run.", [
      "micro",
      "small-1x",
      "small-2x",
      "medium-1x",
      "medium-2x",
      "large-1x",
      "large-2x",
    ]),
  },
  {
    optional: ["queue", "concurrencyKey", "idempotencyKey", "ttl", "delay", "tags", "machine"],
  },
);

const triggerTaskInputSchema = s.object(
  "Input for triggering a Trigger.dev task.",
  {
    taskIdentifier: taskIdentifierSchema,
    payload: jsonValueSchema,
    context: jsonValueSchema,
    options: triggerTaskOptionsSchema,
  },
  { optional: ["payload", "context", "options"] },
);

const runIdOutputSchema = s.object("A Trigger.dev run identifier response.", {
  id: runIdSchema,
});

export const triggerDevActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_runs",
    description: "List Trigger.dev runs with optional status, task, version, and time filters.",
    inputSchema: listRunsInputSchema,
    outputSchema: s.object("A page of Trigger.dev runs.", {
      runs: s.array("Runs returned by Trigger.dev.", looseObjectSchema),
      pagination: s.looseObject("Cursor pagination metadata returned by Trigger.dev."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_run",
    description: "Retrieve a Trigger.dev run by ID.",
    inputSchema: getRunInputSchema,
    outputSchema: looseObjectSchema,
  }),
  defineProviderAction(service, {
    name: "get_run_result",
    description: "Retrieve the execution result for a completed Trigger.dev run.",
    inputSchema: getRunInputSchema,
    outputSchema: looseObjectSchema,
  }),
  defineProviderAction(service, {
    name: "trigger_task",
    description: "Trigger a Trigger.dev task by task identifier.",
    inputSchema: triggerTaskInputSchema,
    outputSchema: runIdOutputSchema,
  }),
  defineProviderAction(service, {
    name: "cancel_run",
    description: "Cancel an in-progress Trigger.dev run.",
    inputSchema: getRunInputSchema,
    outputSchema: runIdOutputSchema,
  }),
  defineProviderAction(service, {
    name: "replay_run",
    description: "Replay a Trigger.dev run with the same payload and options.",
    inputSchema: getRunInputSchema,
    outputSchema: runIdOutputSchema,
  }),
];
