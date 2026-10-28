import type { ActionDefinition } from "../../core/types.ts";

import { jsonSchema as s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
const taskId = s.string("UUID of the saved Komos task.", { format: "uuid" });
const runId = s.string("UUID of the Komos task run.", { format: "uuid" });
const paging = {
  limit: s.integer("Number of results per page; defaults to 20.", { minimum: 1, maximum: 100 }),
  offset: s.integer("Number of results to skip; defaults to 0.", { minimum: 0 }),
};
const pageOutput = {
  total: s.integer("Total number of matching results."),
  limit: s.integer("Page size returned by Komos."),
  offset: s.integer("Offset returned by Komos."),
};
const task = s.looseRequiredObject("Saved task with its input and output definitions.", {
  id: s.string("Task ID."),
  name: s.string("Task name."),
  status: s.string("Task preparation status."),
});
const run = s.looseRequiredObject("Task run with status, timestamps, inputs and outputs.", {
  id: s.string("Run ID."),
  status: s.string("Run status: PENDING, RUNNING, COMPLETED, FAILED or CANCELLED."),
  timestamps: s.looseObject("Run creation, start and finish timestamps."),
  inputs: s.looseObject("Input values used by the task run."),
  outputs: s.looseObject("Output values produced by the task run."),
});
const runInput = s.requiredObject("Identify a task run.", { runId });
const taskInput = s.requiredObject("Identify a saved task.", { taskId });
const komosActions: readonly ActionDefinition[] = [
  defineProviderAction("komos", {
    name: "list_tasks",
    description: "List saved tasks with pagination, name search and preparation status filters.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object(
      "Filter and paginate saved tasks.",
      {
        ...paging,
        search: s.string("Case-insensitive substring of the task name."),
        status: s.stringEnum("Task preparation status to match.", [
          "DRAFT",
          "PROCESSING",
          "NEEDS_REVIEW",
          "READY",
          "ERROR",
        ]),
      },
      { required: [] },
    ),
    outputSchema: s.looseRequiredObject("A page of saved tasks.", {
      tasks: s.array("Tasks in this page.", task),
      ...pageOutput,
    }),
  }),
  defineProviderAction("komos", {
    name: "get_task",
    description: "Retrieve a saved task including its definition and execution plan summary.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: taskInput,
    outputSchema: s.looseRequiredObject("Saved task details.", { task }),
  }),
  defineProviderAction("komos", {
    name: "queue_task_run",
    description:
      "Queue a saved task with optional input overrides and an idempotency key. Wait for get_task_run to obtain final outputs.",
    operationType: "write",
    requiredScopes: [],
    inputSchema: s.object(
      "Start a saved task run.",
      {
        taskId,
        inputs: s.looseObject("Input overrides; omitted values use the saved task defaults."),
        clientRequestId: s.string(
          "Idempotency key unique per task and organization; reuse it to avoid duplicate runs.",
        ),
      },
      { optional: ["inputs", "clientRequestId"] },
    ),
    outputSchema: run,
    asyncLifecycle: {
      startActionId: "komos.queue_task_run",
      statusActionId: "komos.get_task_run",
      cancelActionId: "komos.cancel_task_run",
    },
  }),
  defineProviderAction("komos", {
    name: "get_task_run",
    description: "Retrieve the latest task run status and outputs, including terminal failures or cancellation.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: runInput,
    outputSchema: run,
    asyncLifecycle: {
      startActionId: "komos.queue_task_run",
      statusActionId: "komos.get_task_run",
      cancelActionId: "komos.cancel_task_run",
    },
  }),
  defineProviderAction("komos", {
    name: "list_runs",
    description:
      "List runs across tasks with pagination, status and creation time filters. By default Komos returns runs from the last seven days.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object(
      "Filter and paginate task runs.",
      {
        ...paging,
        taskId,
        status: s.stringEnum("Run status to match.", ["PENDING", "RUNNING", "COMPLETED", "FAILED", "CANCELLED"]),
        since: s.string("Return runs created after this ISO 8601 timestamp; defaults to seven days ago.", {
          format: "date-time",
        }),
        until: s.string("Return runs created before this ISO 8601 timestamp.", {
          format: "date-time",
        }),
      },
      { required: [] },
    ),
    outputSchema: s.looseRequiredObject("A page of task runs.", {
      runs: s.array("Runs in this page.", run),
      ...pageOutput,
    }),
  }),
  defineProviderAction("komos", {
    name: "list_task_runs",
    description: "Retrieve the 50 most recent runs for one saved task. This endpoint does not support pagination.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: taskInput,
    outputSchema: s.looseRequiredObject("Recent runs for a saved task.", {
      runs: s.array("Up to 50 recent runs.", run),
    }),
  }),
  defineProviderAction("komos", {
    name: "get_task_run_logs",
    description: "Retrieve ordered execution log entries for a task run.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: runInput,
    outputSchema: s.looseRequiredObject("Execution logs for a task run.", {
      runId: s.string("Run ID for these logs."),
      logEntries: s.array(
        "Ordered execution log entries.",
        s.looseObject("Log entry with timestamp, level, message and optional step inputs and outputs."),
      ),
    }),
  }),
  defineProviderAction("komos", {
    name: "cancel_task_run",
    description: "Request cancellation of a pending or running task run, with an optional audit reason.",
    operationType: "destructive",
    requiredScopes: [],
    inputSchema: s.object(
      "Cancel a task run.",
      {
        runId,
        reason: s.string("Cancellation reason recorded for auditing.", { maxLength: 1024 }),
      },
      { optional: ["reason"] },
    ),
    outputSchema: run,
  }),
];
export default komosActions;
