import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "vida" as const;

const taskSchema = s.looseRequiredObject("One task returned by Vida.", {
  id: s.optional(s.string("The task identifier.")),
  type: s.optional(s.string("The task type, such as call, text, email, or ping.")),
  state: s.optional(s.string("The current task state.")),
  target: s.optional(s.string("The destination targeted by the task.")),
  createdAt: s.optional(s.number("The Unix timestamp when the task was created.")),
});

const successSchema = s.optional(s.boolean("Whether Vida reports that the request succeeded."));

const getAccountAction = defineProviderAction(service, {
  name: "get_account",
  operationType: "read",
  description: "Get details for the Vida account authenticated by the current API token.",
  inputSchema: s.object(
    "The input payload for getting Vida account details.",
    {
      targetAccountId: s.optional(s.number("A child account identifier used by partner or reseller tokens.")),
    },
    { optional: ["targetAccountId"] },
  ),
  outputSchema: s.looseRequiredObject("The authenticated Vida account details.", {
    id: s.optional(s.number("The Vida account identifier.")),
    username: s.optional(s.string("The username associated with the Vida account.")),
    details: s.optional(s.looseObject("Additional account details returned by Vida.")),
  }),
});

const listTasksAction = defineProviderAction(service, {
  name: "list_tasks",
  operationType: "read",
  description: "List Vida tasks with optional pagination, time, sorting, and correlation filters.",
  inputSchema: s.object(
    "The input payload for listing Vida tasks.",
    {
      limit: s.optional(s.integer("The maximum number of tasks to return.", { minimum: 1 })),
      offset: s.optional(s.integer("The zero-based number of tasks to skip.", { minimum: 0 })),
      since: s.optional(s.integer("Only return tasks updated at or after this Unix timestamp.", { minimum: 0 })),
      until: s.optional(s.integer("Only return tasks updated at or before this Unix timestamp.", { minimum: 0 })),
      sort: s.optional(s.stringEnum("The task field used for sorting.", ["createdAt", "updatedAt", "scheduledFor"])),
      order: s.optional(s.stringEnum("The task sort direction.", ["asc", "desc"])),
      externalTaskId: s.optional(s.nonEmptyString("An exact caller-defined task correlation identifier.")),
      targetAccountId: s.optional(s.number("A child account identifier used by partner or reseller tokens.")),
    },
    {
      optional: ["limit", "offset", "since", "until", "sort", "order", "externalTaskId", "targetAccountId"],
    },
  ),
  outputSchema: s.looseRequiredObject("The paginated Vida task list response.", {
    success: successSchema,
    total: s.optional(s.number("The total number of matching tasks.")),
    tasks: s.optional(s.array("The tasks returned by Vida.", taskSchema)),
  }),
});

const getTaskAction = defineProviderAction(service, {
  name: "get_task",
  operationType: "read",
  description: "Get one Vida task by its identifier.",
  inputSchema: s.object(
    "The input payload for getting one Vida task.",
    {
      taskId: s.nonEmptyString("The Vida task identifier."),
      targetAccountId: s.optional(s.number("A child account identifier used by partner or reseller tokens.")),
    },
    { optional: ["targetAccountId"] },
  ),
  outputSchema: s.looseRequiredObject("The Vida task detail response.", {
    success: successSchema,
    task: s.optional(taskSchema),
  }),
});

const getTaskStatisticsAction = defineProviderAction(service, {
  name: "get_task_statistics",
  operationType: "read",
  description: "Get Vida task counts grouped by state.",
  inputSchema: s.object(
    "The input payload for getting Vida task statistics.",
    {
      targetAccountId: s.optional(s.number("A child account identifier used by partner or reseller tokens.")),
    },
    { optional: ["targetAccountId"] },
  ),
  outputSchema: s.looseRequiredObject("The Vida task statistics response.", {
    success: successSchema,
    total: s.optional(s.number("The total number of tasks counted.")),
    byState: s.optional(
      s.record("Task counts keyed by Vida task state.", s.number("The number of tasks in this state.")),
    ),
  }),
});

const getDailyCountsAction = defineProviderAction(service, {
  name: "get_daily_counts",
  operationType: "read",
  description: "Get current daily Vida call, text, and task usage counts.",
  inputSchema: s.object(
    "The input payload for getting Vida daily usage counts.",
    {
      targetAccountId: s.optional(s.number("A child account identifier used by partner or reseller tokens.")),
    },
    { optional: ["targetAccountId"] },
  ),
  outputSchema: s.looseRequiredObject("The Vida daily usage count response.", {
    success: successSchema,
    counts: s.optional(
      s.looseRequiredObject("The current daily usage counters.", {
        calls: s.optional(s.number("The number of calls counted today.")),
        texts: s.optional(s.number("The number of text messages counted today.")),
        tasks: s.optional(s.number("The number of tasks counted today.")),
        date: s.optional(s.string("The calendar date for these usage counters.")),
      }),
    ),
  }),
});

export const vidaActions: ActionDefinition[] = [
  getAccountAction,
  listTasksAction,
  getTaskAction,
  getTaskStatisticsAction,
  getDailyCountsAction,
];

export type VidaActionName = "get_account" | "list_tasks" | "get_task" | "get_task_statistics" | "get_daily_counts";
