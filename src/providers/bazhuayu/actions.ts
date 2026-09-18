import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "bazhuayu";

const taskIdSchema = s.nonEmptyString("The Bazhuayu task ID.");
const requestIdSchema = s.string("The Bazhuayu request ID used for support and troubleshooting.");
const pageSchema = s.positiveInteger("The one-based page number.");
const sizeSchema = s.integer("The number of records to return, from 1 to 1000.", {
  minimum: 1,
  maximum: 1000,
});
const taskIdsSchema = s.stringArray("The Bazhuayu task IDs.", {
  minItems: 1,
  itemDescription: "A Bazhuayu task ID.",
});
const subtaskIdsSchema = s.stringArray("The Bazhuayu subtask IDs.", {
  minItems: 1,
  itemDescription: "A Bazhuayu subtask ID.",
});
const recordSchema = s.record(
  "One collected record whose fields are defined by the Bazhuayu task.",
  s.unknown("A provider-defined collected value."),
);

const taskGroupSchema = s.looseObject("A Bazhuayu task group.", {
  taskGroupId: s.integer("The task group ID."),
  taskGroupName: s.string("The task group name."),
});

const taskSchema = s.looseObject("A Bazhuayu task summary.", {
  taskId: taskIdSchema,
  taskName: s.string("The task name."),
});

const taskActionSchema = s.looseObject("One API-addressable step in a Bazhuayu task.", {
  actionType: s.string("The task step type."),
  name: s.string("The task step name."),
  actionId: s.string("The task step ID used by update actions."),
});

const taskActionsSchema = s.looseObject("The API-addressable steps for one Bazhuayu task.", {
  taskId: taskIdSchema,
  actions: s.array("The matching task steps.", taskActionSchema),
});

const taskStatusSchema = s.looseObject("The latest execution status for one Bazhuayu task.", {
  taskId: taskIdSchema,
  status: s.string("The current task status."),
  currentTotalExtractCount: s.integer("The number of records collected by this execution."),
  executedTimes: s.integer("The task execution count."),
  subTaskCount: s.integer("The number of subtasks."),
  nextExecuteTime: s.nullableString("The next scheduled execution time, when available."),
  startExecuteTime: s.nullableString("The task start time, when available."),
  executingTime: s.optional(s.nullableString("The task execution start time, when available.")),
  endExecuteTime: s.nullableString("The task end time, when available."),
  startExecuteTimeSeconds: s.optional(s.number("The task execution duration in seconds.")),
});

const subtaskStatusSchema = s.looseObject("The latest status for one Bazhuayu subtask.", {
  subTaskId: s.string("The subtask ID."),
  status: s.string("The current subtask status."),
});

const taskDataOutputSchema = s.object("A page of collected Bazhuayu task data.", {
  records: s.array("The collected records.", recordSchema),
  offset: s.integer("The offset to use for the next page."),
  total: s.integer("The total number of records."),
  remaining: s.integer("The number of records remaining after this page."),
  requestId: requestIdSchema,
});

const actionTypeSchema = s.stringEnum("The Bazhuayu task step type.", [
  "LoopAction",
  "NavigateAction",
  "EnterTextAction",
]);

const updatePropertySchema = s.object("One task step property update.", {
  name: s.nonEmptyString("The Bazhuayu property name."),
  value: s.string("The new property value."),
});

const updateActionSchema = s.object("One Bazhuayu task step update.", {
  actionType: actionTypeSchema,
  actionId: s.nonEmptyString("The task step ID."),
  properties: s.array("The properties to update.", updatePropertySchema, { minItems: 1 }),
});

const updateLoopSchema = s.object("One Bazhuayu loop step update.", {
  actionId: s.nonEmptyString("The loop step ID."),
  loopType: s.stringEnum("The loop item type.", ["URLList", "TextList"]),
  loopItems: s.stringArray("The replacement or appended loop items.", {
    minItems: 1,
    itemDescription: "One URL or text loop item.",
  }),
  isAppend: s.boolean("Whether to append the items instead of replacing the current list."),
});

const analyticsMetricSchema = s.looseObject("Provider-reported metrics for one task and period.");
const analyticsItemSchema = s.looseObject("Analytics for one Bazhuayu task and time bucket.", {
  taskId: taskIdSchema,
  userId: s.string("The Bazhuayu user ID."),
  taskName: s.optional(s.nullableString("The task name, when available.")),
  dayKey: s.string("The day, week, or month bucket key."),
  weekStartDate: s.optional(s.nullableString("The week start date for weekly results.")),
  weekEndDate: s.optional(s.nullableString("The week end date for weekly results.")),
  collectionMethod: s.string("The collection method."),
  dataVolumeMetrics: analyticsMetricSchema,
  executionMetrics: analyticsMetricSchema,
  resourceUsageMetrics: analyticsMetricSchema,
});

export const bazhuayuActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_task_groups",
    operationType: "read",
    description:
      "List the task groups available to the connected Bazhuayu account. Requires a Flagship, Flagship+, Enterprise, or Team plan.",
    requiredScopes: [],
    inputSchema: s.object("No input is required to list Bazhuayu task groups.", {}),
    outputSchema: s.object("The connected account's Bazhuayu task groups.", {
      taskGroups: s.array("The available task groups.", taskGroupSchema),
      requestId: requestIdSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_tasks",
    operationType: "read",
    description: "List the Bazhuayu tasks in one task group. Requires a Flagship, Flagship+, Enterprise, or Team plan.",
    requiredScopes: [],
    inputSchema: s.object("The task group whose tasks should be listed.", {
      taskGroupId: s.positiveInteger("The Bazhuayu task group ID."),
    }),
    outputSchema: s.object("The Bazhuayu tasks in the requested group.", {
      tasks: s.array("The matching tasks.", taskSchema),
      requestId: requestIdSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_task_actions",
    operationType: "read",
    description:
      "Get API-addressable steps from Bazhuayu tasks so their action IDs can be used in parameter updates. Requires a Flagship+, Enterprise, or Team plan.",
    requiredScopes: [],
    inputSchema: s.object("The tasks and step types to inspect.", {
      taskIds: taskIdsSchema,
      actionTypes: s.array("The task step types to return.", actionTypeSchema, {
        minItems: 1,
        maxItems: 3,
      }),
    }),
    outputSchema: s.object("The API-addressable steps grouped by Bazhuayu task.", {
      tasks: s.array("The task step groups.", taskActionsSchema),
      requestId: requestIdSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "copy_task",
    operationType: "write",
    description:
      "Copy a Bazhuayu task into a task group and return the new task ID. Requires a Flagship+, Enterprise, or Team plan.",
    requiredScopes: [],
    inputSchema: s.object("The task to copy and its destination task group.", {
      taskId: taskIdSchema,
      taskGroupId: s.optional(
        s.positiveInteger(
          "The destination Bazhuayu task group ID. Omit it to copy into the source task's current group.",
        ),
      ),
    }),
    outputSchema: s.object("The new Bazhuayu task created from the source task.", {
      taskId: taskIdSchema,
      taskName: s.optional(s.string("The copied task name, when returned by Bazhuayu.")),
      requestId: requestIdSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "update_task_parameters",
    operationType: "write",
    description:
      "Update supported properties and loop items in a Bazhuayu task. Requires a Flagship+, Enterprise, or Team plan.",
    requiredScopes: [],
    inputSchema: s.object("The task parameters and loop items to update.", {
      taskId: taskIdSchema,
      actions: s.array("The task step property updates.", updateActionSchema),
      loopItems: s.array("The loop step updates.", updateLoopSchema),
    }),
    outputSchema: s.object("The Bazhuayu task parameters accepted by the update.", {
      taskId: taskIdSchema,
      updatedParameters: s.looseObject("The updated task actions and loop items."),
      requestId: requestIdSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "update_loop_items",
    operationType: "destructive",
    description:
      "Replace or append the text or URL items used by one Bazhuayu loop step. Requires a Flagship+, Enterprise, or Team plan.",
    requiredScopes: [],
    inputSchema: s.object("The loop step and its new items.", {
      taskId: taskIdSchema,
      actionId: s.nonEmptyString("The Bazhuayu loop step ID."),
      loopType: s.stringEnum("The loop item type accepted by this endpoint.", ["TextList", "UrlList"]),
      loopItems: s.stringArray("The replacement or appended loop items.", {
        minItems: 1,
        itemDescription: "One URL or text loop item.",
      }),
      isAppend: s.boolean("Whether to append the items instead of replacing the current list."),
    }),
    outputSchema: s.object("The result of updating the Bazhuayu loop step.", {
      message: s.string("The provider update result message."),
      requestId: requestIdSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "start_task",
    operationType: "write",
    description:
      "Start a Bazhuayu task on cloud workers and return its batch number. Requires a Flagship+, Enterprise, or Team plan.",
    requiredScopes: [],
    inputSchema: s.object("The Bazhuayu task to start.", { taskId: taskIdSchema }),
    outputSchema: s.object("The newly queued Bazhuayu task execution.", {
      lotNo: s.string("The task execution batch number."),
      status: s.string("The initial task execution status."),
      requestId: requestIdSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "stop_task",
    operationType: "destructive",
    description: "Stop a running Bazhuayu cloud task. Requires a Flagship+, Enterprise, or Team plan.",
    requiredScopes: [],
    inputSchema: s.object("The Bazhuayu task to stop.", { taskId: taskIdSchema }),
    outputSchema: s.object("Confirmation that Bazhuayu accepted the stop request.", {
      requestId: requestIdSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_task_statuses",
    operationType: "read",
    description: "Get the latest execution status for Bazhuayu tasks. Requires a Flagship+, Enterprise, or Team plan.",
    requiredScopes: [],
    inputSchema: s.object("The Bazhuayu tasks whose status should be returned.", {
      taskIds: taskIdsSchema,
    }),
    outputSchema: s.object("The latest Bazhuayu task statuses.", {
      tasks: s.array("The task status results.", taskStatusSchema),
      requestId: requestIdSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_task_stats",
    operationType: "read",
    description:
      "Get account-wide counts for waiting, extracting, and finished Bazhuayu cloud tasks and subtasks. Requires an Enterprise plan.",
    requiredScopes: [],
    inputSchema: s.object("No input is required to get Bazhuayu task statistics.", {}),
    outputSchema: s.object("The current Bazhuayu cloud task counts.", {
      stats: s.looseObject("The account-wide task and subtask counts.", {
        extractingCount: s.integer("The number of extracting tasks."),
        waitingCount: s.integer("The number of waiting tasks."),
        finishedCount: s.integer("The number of finished tasks."),
        waitingSubTaskCount: s.integer("The number of waiting subtasks."),
        executingSubTaskCount: s.integer("The number of executing subtasks."),
      }),
      requestId: requestIdSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_subtask_statuses",
    operationType: "read",
    description: "List the latest batch's Bazhuayu subtask statuses. Requires a Flagship+, Enterprise, or Team plan.",
    requiredScopes: [],
    inputSchema: s.object("The task and page of subtasks to return.", {
      taskId: taskIdSchema,
      page: pageSchema,
      size: s.positiveInteger("The number of subtasks to return per page."),
    }),
    outputSchema: s.object("The Bazhuayu subtask statuses on the requested page.", {
      subtasks: s.array("The subtask status results.", subtaskStatusSchema),
      requestId: requestIdSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "start_subtasks",
    operationType: "write",
    description: "Start selected cloud subtasks for a Bazhuayu task. Requires a Flagship+, Enterprise, or Team plan.",
    requiredScopes: [],
    inputSchema: s.object("The Bazhuayu cloud subtasks to start.", {
      taskId: taskIdSchema,
      subTaskIds: subtaskIdsSchema,
    }),
    outputSchema: s.object("Confirmation that Bazhuayu accepted the subtask start request.", {
      requestId: requestIdSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "stop_subtasks",
    operationType: "destructive",
    description: "Stop selected cloud subtasks for a Bazhuayu task. Requires a Flagship+, Enterprise, or Team plan.",
    requiredScopes: [],
    inputSchema: s.object("The Bazhuayu cloud subtasks to stop.", {
      taskId: taskIdSchema,
      subTaskIds: subtaskIdsSchema,
    }),
    outputSchema: s.object("Confirmation that Bazhuayu accepted the subtask stop request.", {
      requestId: requestIdSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_task_data",
    operationType: "read",
    description:
      "Get a page of collected data from a Bazhuayu task using the offset returned by the previous page. Requires a Flagship, Flagship+, Enterprise, or Team plan.",
    requiredScopes: [],
    inputSchema: s.object("The task data page to retrieve.", {
      taskId: taskIdSchema,
      offset: s.integer("The data offset. Values less than or equal to 0 read from the beginning."),
      size: sizeSchema,
    }),
    outputSchema: taskDataOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_task_batch_data",
    operationType: "read",
    description:
      "Get a page of collected data from one Bazhuayu task execution batch. Requires a Flagship, Flagship+, Enterprise, or Team plan.",
    requiredScopes: [],
    inputSchema: s.object("The task execution batch and data page to retrieve.", {
      taskId: taskIdSchema,
      lotNo: s.nonEmptyString("The Bazhuayu task execution batch number."),
      offset: s.integer("The data offset. Values less than or equal to 0 read from the beginning."),
      size: sizeSchema,
    }),
    outputSchema: taskDataOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_unexported_data",
    operationType: "read",
    description:
      "Get the next unexported records from a Bazhuayu task. Use this with mark_data_exported through only one sequential consumer per task because Bazhuayu acknowledgements are task-scoped. Requires a Flagship, Flagship+, Enterprise, or Team plan.",
    requiredScopes: [],
    inputSchema: s.object("The task and number of unexported records to retrieve.", {
      taskId: taskIdSchema,
      size: sizeSchema,
    }),
    outputSchema: s.object("The next unexported Bazhuayu task records.", {
      records: s.array("The unexported records.", recordSchema),
      total: s.integer("The total number of unexported records."),
      current: s.integer("The number of records returned by this request."),
      requestId: requestIdSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "mark_data_exported",
    operationType: "write",
    description:
      "Mark the current unexported data for a Bazhuayu task as exported. Call this only after a single sequential consumer has persisted the preceding get_unexported_data result. Requires a Flagship, Flagship+, Enterprise, or Team plan.",
    requiredScopes: [],
    inputSchema: s.object("The task whose current data should be marked as exported.", {
      taskId: taskIdSchema,
    }),
    outputSchema: s.object("Confirmation that Bazhuayu marked the data as exported.", {
      requestId: requestIdSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "query_task_analytics",
    operationType: "read",
    description:
      "Query Bazhuayu collection volume, execution, success-rate, and resource-usage metrics for the last three months. Requires a Flagship, Flagship+, Enterprise, or Team plan.",
    requiredScopes: [],
    inputSchema: s.object("The UTC date range, filters, granularity, and page of analytics to return.", {
      start: s.date("The inclusive UTC start date in YYYY-MM-DD format."),
      end: s.date("The inclusive UTC end date in YYYY-MM-DD format."),
      page: s.optional(s.withDefault(s.positiveInteger("The one-based page number."), 1)),
      pageSize: s.optional(
        s.withDefault(s.integer("The number of analytics rows to return.", { minimum: 1, maximum: 500 }), 20),
      ),
      taskIds: s.optional(
        s.stringArray("Optional task IDs to include.", {
          maxItems: 100,
          itemDescription: "A Bazhuayu task ID.",
        }),
      ),
      memberNames: s.optional(
        s.stringArray("Optional team member names to include.", {
          maxItems: 100,
          itemDescription: "A Bazhuayu team member name.",
        }),
      ),
      collectionMethod: s.optional(s.stringEnum("The collection method to include.", ["Cloud", "Local", "All"])),
      timeGranularity: s.optional(
        s.withDefault(s.stringEnum("The time bucket used to aggregate analytics.", ["Day", "Week", "Month"]), "Day"),
      ),
    }),
    outputSchema: s.object("The requested page of Bazhuayu task analytics.", {
      items: s.array("The analytics rows.", analyticsItemSchema),
      total: s.integer("The total number of matching analytics rows."),
      requestId: requestIdSchema,
    }),
  }),
];
