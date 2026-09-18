import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { extendObject } from "./schemas.ts";
import {
  additionalFiltersInputField,
  emptyInputSchema,
  idArrayField,
  idField,
  pageInputFields,
  paginatedOutputSchema,
  taskSchema,
  taskStatusValues,
  taskTypeValues,
  triggerSourceValues,
} from "./schemas.ts";

const service = "paperless_ngx";

const paperlessTaskSchema = extendObject(
  "A Paperless-ngx background task.",
  taskSchema,
  {
    result_data: s.nullable(
      s.looseObject(
        "Structured task result, or null while the task has not finished. Consume tasks report the created document in document_id, a rejected duplicate in duplicate_of and the rejection text in reason; failures carry error_message.",
        {
          document_id: s.integer("Id of the document created by a successful consume task."),
          duplicate_of: s.integer("Id of the existing document when the consumed file was rejected as a duplicate."),
          reason: s.string("Human readable reason when the file was not consumed."),
          message: s.string("Human readable result message."),
          error_message: s.string("Error message when the task failed."),
        },
      ),
    ),
  },
  { optional: ["result_data"] },
);

const taskTypeDescription =
  "Task type: consume_file, train_classifier, sanity_check, index_optimize, mail_fetch, llm_index, empty_trash, check_workflows, bulk_update, reprocess_document, build_share_link, bulk_delete or apply_ai_suggestions.";

const triggerSourceDescription =
  "What started the task: scheduled (Celery beat), web_ui, api_upload, folder_consume, email_consume, system or manual (started through run_task).";

const taskStatusDescription =
  "Task status: pending, started, success, failure or revoked. Tasks move pending -> started -> success or failure, or pending -> revoked when cancelled before starting.";

const taskFilterInputFields = {
  task_id: s.nonEmptyString(
    "Celery task UUID to filter by, as returned by upload_document or run_task. Matches at most one task.",
  ),
  name: s.string(
    "Case-insensitive text matched against the input file name and against the human readable task type and trigger source labels.",
  ),
  result: s.string(
    "Case-insensitive text matched against result_data.reason and result_data.error_message. A numeric value also matches result_data.document_id and result_data.duplicate_of, and the word duplicate matches every task rejected as a duplicate.",
  ),
  task_type: s.stringEnum(`${taskTypeDescription} One value per call.`, taskTypeValues),
  trigger_source: s.stringEnum(`${triggerSourceDescription} One value per call.`, triggerSourceValues),
  acknowledged: s.boolean(
    "When true, only tasks already acknowledged (dismissed); when false, only unacknowledged tasks.",
  ),
  owner: idField(
    "Id of the user that owns the task. Non-staff users only ever see their own tasks and unowned system tasks; staff users see every task.",
  ),
  date_created_after: s.nonEmptyString("ISO 8601 date or datetime; only tasks created at or after this instant."),
  date_created_before: s.nonEmptyString("ISO 8601 date or datetime; only tasks created at or before this instant."),
};

const taskStatusFilterInputFields = {
  status: s.stringEnum(`${taskStatusDescription} One value per call.`, taskStatusValues),
  is_complete: s.boolean(
    "When true, only finished tasks (success, failure or revoked); when false, only pending and started tasks.",
  ),
};

const taskOrderingInputField = s.nonEmptyString(
  "Field to order by, prefixed with - for descending order: date_created, date_done, status, task_type, duration_seconds or wait_time_seconds. Defaults to -date_created.",
);

const taskSummaryItemSchema = s.looseObject("Aggregated statistics for one task type.", {
  task_type: s.string(taskTypeDescription),
  total_count: s.integer("Number of tasks of this type in the period."),
  pending_count: s.integer("Number of tasks still pending."),
  success_count: s.integer("Number of successful tasks."),
  failure_count: s.integer("Number of failed tasks."),
  avg_duration_seconds: s.nullableNumber("Average run time in seconds over tasks that recorded a duration, or null."),
  avg_wait_time_seconds: s.nullableNumber("Average queue wait time in seconds over tasks that recorded one, or null."),
  last_run: s.nullableString("ISO 8601 timestamp of the most recent task of this type, or null."),
  last_success: s.nullableString("ISO 8601 timestamp of the most recent success, or null."),
  last_failure: s.nullableString("ISO 8601 timestamp of the most recent failure, or null."),
});

const runnableTaskTypeValues = ["train_classifier", "sanity_check", "llm_index"];

export const paperlessNgxTaskActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_tasks",
    operationType: "read",
    description:
      "List Paperless-ngx background tasks (document consumption, classifier training, sanity checks, mail fetches and other jobs) with pagination and filters. Non-staff users see their own tasks plus unowned system tasks; staff users see every task. Requires the view_paperlesstask permission.",
    requiredScopes: [],
    inputSchema: s.object(
      "Pagination and task filters.",
      {
        page: pageInputFields.page,
        page_size: pageInputFields.page_size,
        ordering: taskOrderingInputField,
        ...taskFilterInputFields,
        ...taskStatusFilterInputFields,
        additional_filters: additionalFiltersInputField,
      },
      {
        optional: [
          "page",
          "page_size",
          "ordering",
          ...Object.keys(taskFilterInputFields),
          ...Object.keys(taskStatusFilterInputFields),
          "additional_filters",
        ],
      },
    ),
    outputSchema: paginatedOutputSchema("A page of background tasks.", paperlessTaskSchema),
  }),
  defineProviderAction(service, {
    name: "get_task",
    operationType: "read",
    description:
      "Get one background task by its Celery task UUID, the id returned by upload_document, update_document_version, run_task and other asynchronous actions. Poll it until status is success, failure or revoked; a successful consume task reports the new document id in result_data.document_id (also the first entry of related_document_ids), while a rejected duplicate reports the existing document in result_data.duplicate_of.",
    requiredScopes: [],
    followUpActions: ["paperless_ngx.get_document"],
    inputSchema: s.object("The task to read.", {
      task_id: s.nonEmptyString(
        "Celery task UUID, as returned in the task_id field of upload_document, update_document_version or run_task.",
      ),
    }),
    outputSchema: paperlessTaskSchema,
  }),
  defineProviderAction(service, {
    name: "get_task_by_id",
    operationType: "read",
    description:
      "Get one background task by its numeric row id (the id field of list_tasks), as opposed to the Celery UUID used by get_task.",
    requiredScopes: [],
    inputSchema: s.object("The task to read.", {
      id: idField("The numeric task row id."),
    }),
    outputSchema: paperlessTaskSchema,
  }),
  defineProviderAction(service, {
    name: "acknowledge_tasks",
    operationType: "write",
    description:
      "Mark background tasks as acknowledged (dismissed from the task list). Pass tasks with the numeric task row ids, or all true to acknowledge every visible unacknowledged task; exactly one of the two must be given. Requires the change_paperlesstask permission.",
    requiredScopes: [],
    inputSchema: s.object(
      "Which tasks to acknowledge.",
      {
        tasks: idArrayField(
          "Numeric task row ids (the id field, not the Celery task_id) to acknowledge. Every id must be visible to the connected user and listed once.",
          "A task row id.",
        ),
        all: s.boolean(
          "When true, acknowledge every unacknowledged task visible to the connected user instead of an explicit list. Defaults to false.",
        ),
      },
      { optional: ["tasks", "all"] },
    ),
    outputSchema: s.requiredObject("The acknowledgement result.", {
      result: s.nonNegativeInteger("Number of tasks that were newly marked as acknowledged."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_task_summary",
    operationType: "read",
    description:
      "Get aggregated background task statistics per task type over the last N days: counts by outcome, average run and wait times and the timestamps of the latest run, success and failure. Superusers, staff and users with the view_system_monitoring permission see all tasks; everyone else sees their own tasks plus unowned system tasks.",
    requiredScopes: [],
    inputSchema: s.object(
      "The aggregation window.",
      {
        days: s.integer(
          "Number of days to aggregate, from 1 to 365. Defaults to 30; values outside the range are rejected before the request is sent.",
          { minimum: 1, maximum: 365 },
        ),
      },
      { optional: ["days"] },
    ),
    outputSchema: s.requiredObject("The task summary.", {
      summary: s.array("One entry per task type that ran in the period.", taskSummaryItemSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_task_status_counts",
    operationType: "read",
    description:
      "Get the number of visible background tasks in total and per status group: needs_attention (failure or revoked), in_progress (pending or started) and completed (success). Accepts the same filters as list_tasks except status and is_complete, which the counts already break down.",
    requiredScopes: [],
    inputSchema: s.object(
      "Task filters applied before counting.",
      {
        ...taskFilterInputFields,
        additional_filters: additionalFiltersInputField,
      },
      { optional: [...Object.keys(taskFilterInputFields), "additional_filters"] },
    ),
    outputSchema: s.looseRequiredObject("Task counts per status group.", {
      all: s.nonNegativeInteger("Number of matching tasks in any status."),
      needs_attention: s.nonNegativeInteger("Number of failed or revoked tasks."),
      in_progress: s.nonNegativeInteger("Number of pending or started tasks."),
      completed: s.nonNegativeInteger("Number of successful tasks."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_active_tasks",
    operationType: "read",
    description:
      "List the background tasks that are currently pending or started, newest first, capped at 50 entries and not paginated. Non-staff users see their own tasks plus unowned system tasks.",
    requiredScopes: [],
    inputSchema: emptyInputSchema,
    outputSchema: s.requiredObject("The active tasks.", {
      tasks: s.array("Pending and started tasks, newest first, at most 50.", paperlessTaskSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "run_task",
    operationType: "write",
    description:
      "Manually start a maintenance task in the background: train_classifier retrains the automatic matching classifier, sanity_check verifies the document files and database, llm_index updates the AI index. Only these three task types can be dispatched, and only by a superuser. Returns the Celery task UUID to poll with get_task.",
    requiredScopes: [],
    asyncLifecycle: {
      startActionId: "paperless_ngx.run_task",
      statusActionId: "paperless_ngx.get_task",
    },
    followUpActions: ["paperless_ngx.get_task"],
    inputSchema: s.object("The task to dispatch.", {
      task_type: s.stringEnum(
        "Task type to run: train_classifier, sanity_check or llm_index. Other task types are rejected by Paperless-ngx.",
        runnableTaskTypeValues,
      ),
    }),
    outputSchema: s.requiredObject("The dispatched task handle.", {
      task_id: s.string("Celery task UUID of the dispatched task; pass it to get_task."),
    }),
  }),
];
