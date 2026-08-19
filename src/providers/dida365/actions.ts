import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "dida365";

export const dida365OAuthScopes = {
  read: "tasks:read",
  write: "tasks:write",
} as const;

const readScope = [dida365OAuthScopes.read];
const writeScope = [dida365OAuthScopes.write];
const dateTime = s.string("The Dida365 date-time string in yyyy-MM-dd'T'HH:mm:ssZ format.");
const projectId = s.nonEmptyString("The Dida365 project ID.");
const taskId = s.nonEmptyString("The Dida365 task ID.");
const habitId = s.nonEmptyString("The Dida365 habit ID.");
const sortOrder = s.integer("The sort order value.");
const priority = s.union([s.literal(0), s.literal(1), s.literal(3), s.literal(5)], {
  description: "The Dida365 priority value. Valid values are 0, 1, 3, and 5.",
});
const project = s.looseObject("A Dida365 project.");
const task = s.looseObject("A Dida365 task.");
const taskWithProject = s.looseObject("A Dida365 task with project context added by the connector.");
const column = s.looseObject("A Dida365 project column.");
const habit = s.looseObject("A Dida365 habit.");
const habitCheckin = s.looseObject("A Dida365 habit check-in group.");
const projectLookup = s.object("The input payload for looking up a Dida365 project.", { projectId });
const taskLookup = s.object("The input payload for looking up a Dida365 task.", { projectId, taskId });

const checklistItemInput = s.object(
  "A checklist item payload sent to Dida365.",
  {
    id: s.string("The checklist item ID."),
    title: s.nonEmptyString("The checklist item title."),
    status: s.integer("The checklist item status. Use 0 for normal and 1 for completed."),
    isAllDay: s.boolean("Whether the checklist item is all day."),
    timeZone: s.string("The time zone for the checklist item."),
    sortOrder,
    startDate: s.string("The checklist item start date-time string."),
    completedTime: s.string("The checklist item completion date-time string."),
  },
  { optional: ["id", "status", "isAllDay", "timeZone", "sortOrder", "startDate", "completedTime"] },
);

const taskWriteFields: Record<string, JsonSchema> = {
  projectId,
  title: s.nonEmptyString("The Dida365 task title."),
  content: s.string("The Dida365 task content."),
  desc: s.string("The Dida365 task description."),
  isAllDay: s.boolean("Whether the Dida365 task is all day."),
  startDate: s.string("The task start date-time string."),
  dueDate: s.string("The task due date-time string."),
  timeZone: s.string("The Dida365 task time zone."),
  reminders: s.array(
    "The reminder trigger strings attached to the task.",
    s.string("A Dida365 reminder trigger string."),
  ),
  tags: s.stringArray("The Dida365 tags attached to the task."),
  repeatFlag: s.string("The Dida365 recurrence rule string."),
  priority,
  sortOrder,
  items: s.array("The checklist items to create under the task.", checklistItemInput),
};

const projectWriteFields = {
  name: s.nonEmptyString("The Dida365 project name."),
  color: s.string("The Dida365 project color."),
  sortOrder,
  viewMode: s.stringEnum("The Dida365 project view mode.", ["list", "kanban", "timeline"]),
  kind: s.stringEnum("The Dida365 project kind.", ["TASK", "NOTE", "task", "note"]),
};

const moveOperation = s.object("A single Dida365 task move operation.", {
  fromProjectId: s.nonEmptyString("The source Dida365 project ID."),
  toProjectId: s.nonEmptyString("The destination Dida365 project ID."),
  taskId: s.nonEmptyString("The Dida365 task ID to move."),
});

export const dida365Actions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_user_project",
    description: "List the projects available to the connected Dida365 account.",
    requiredScopes: readScope,
    inputSchema: s.object("The input payload for listing Dida365 projects.", {}),
    outputSchema: s.object({ projects: s.array("The Dida365 projects.", project) }),
  }),
  defineProviderAction(service, {
    name: "get_project_by_id",
    description: "Get a Dida365 project by its project ID.",
    requiredScopes: readScope,
    inputSchema: projectLookup,
    outputSchema: s.object({ project }),
  }),
  defineProviderAction(service, {
    name: "get_project_with_data",
    description: "Get a Dida365 project together with its undone tasks and columns by project ID.",
    requiredScopes: readScope,
    inputSchema: projectLookup,
    outputSchema: s.object({
      project,
      tasks: s.array("The undone tasks under the project.", task),
      columns: s.array("The columns under the project.", column),
    }),
  }),
  defineProviderAction(service, {
    name: "create_project",
    description: "Create a Dida365 project with optional color, sort order, view mode, and kind.",
    requiredScopes: writeScope,
    inputSchema: s.object("The input payload for creating a Dida365 project.", projectWriteFields, {
      required: ["name"],
      optional: ["color", "sortOrder", "viewMode", "kind"],
    }),
    outputSchema: s.object({ project }),
  }),
  defineProviderAction(service, {
    name: "update_project",
    description: "Update a Dida365 project by project ID.",
    requiredScopes: writeScope,
    inputSchema: s.object(
      "The input payload for updating a Dida365 project.",
      { projectId, ...projectWriteFields },
      {
        required: ["projectId"],
        optional: ["name", "color", "sortOrder", "viewMode", "kind"],
      },
    ),
    outputSchema: s.object({ project }),
  }),
  defineProviderAction(service, {
    name: "delete_project",
    description: "Delete a Dida365 project by project ID. A missing project is treated as already deleted.",
    requiredScopes: writeScope,
    inputSchema: projectLookup,
    outputSchema: s.object({ deleted: s.literal(true), projectId: s.string("The Dida365 project ID.") }),
  }),
  defineProviderAction(service, {
    name: "get_task_by_project_and_id",
    description: "Get a Dida365 task by project ID and task ID.",
    requiredScopes: readScope,
    inputSchema: taskLookup,
    outputSchema: s.object({ task }),
  }),
  defineProviderAction(service, {
    name: "create_task",
    description:
      "Create a Dida365 task under a project with optional schedule, reminders, recurrence, and checklist items.",
    requiredScopes: writeScope,
    inputSchema: s.object("The input payload for creating a Dida365 task.", taskWriteFields, {
      required: ["projectId", "title"],
      optional: [
        "content",
        "desc",
        "isAllDay",
        "startDate",
        "dueDate",
        "timeZone",
        "reminders",
        "tags",
        "repeatFlag",
        "priority",
        "sortOrder",
        "items",
      ],
    }),
    outputSchema: s.object({ task }),
  }),
  defineProviderAction(service, {
    name: "update_task",
    description: "Update a Dida365 task by task ID and project ID.",
    requiredScopes: writeScope,
    inputSchema: s.object(
      "The input payload for updating a Dida365 task.",
      { taskId, id: s.string("Optional task ID repeated in the request body."), ...taskWriteFields },
      {
        required: ["projectId", "taskId"],
        optional: [
          "id",
          "title",
          "content",
          "desc",
          "isAllDay",
          "startDate",
          "dueDate",
          "timeZone",
          "reminders",
          "tags",
          "repeatFlag",
          "priority",
          "sortOrder",
          "items",
        ],
      },
    ),
    outputSchema: s.object({ task }),
  }),
  defineProviderAction(service, {
    name: "complete_task",
    description: "Mark a Dida365 task as completed by project ID and task ID.",
    requiredScopes: writeScope,
    inputSchema: taskLookup,
    outputSchema: s.object({
      completed: s.literal(true),
      projectId: s.string("The Dida365 project ID."),
      taskId: s.string("The Dida365 task ID."),
    }),
  }),
  defineProviderAction(service, {
    name: "delete_task",
    description: "Delete a Dida365 task by project ID and task ID. A missing task is treated as already deleted.",
    requiredScopes: writeScope,
    inputSchema: taskLookup,
    outputSchema: s.object({
      deleted: s.literal(true),
      projectId: s.string("The Dida365 project ID."),
      taskId: s.string("The Dida365 task ID."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_all_tasks",
    description: "List undone Dida365 tasks across projects.",
    requiredScopes: readScope,
    inputSchema: s.object(
      "The input payload for aggregating Dida365 tasks.",
      {
        limit: s.positiveInteger("The maximum number of tasks to return after aggregation."),
        projectIds: s.array("An optional list of project IDs to include.", projectId),
        includeClosedProjects: s.boolean("Whether closed projects should be included in the aggregation."),
      },
      { optional: ["limit", "projectIds", "includeClosedProjects"] },
    ),
    outputSchema: s.object({
      tasks: s.array("The aggregated undone tasks across the scanned projects.", taskWithProject),
      totalTasks: s.integer("The number of tasks returned by the connector."),
      projectsScanned: s.integer("The number of projects scanned by the connector."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_completed_tasks",
    description: "List completed Dida365 tasks within optional project and date filters.",
    requiredScopes: readScope,
    inputSchema: s.object(
      "The input payload for listing completed Dida365 tasks.",
      {
        projectIds: s.array("An optional list of project IDs to filter by.", projectId),
        startDate: dateTime,
        endDate: dateTime,
      },
      { optional: ["projectIds", "startDate", "endDate"] },
    ),
    outputSchema: s.object({ tasks: s.array("The completed Dida365 tasks.", task) }),
  }),
  defineProviderAction(service, {
    name: "filter_tasks",
    description: "Filter Dida365 tasks by project, date range, priority, tags, and status.",
    requiredScopes: readScope,
    inputSchema: s.object(
      "The input payload for filtering Dida365 tasks.",
      {
        projectIds: s.array("An optional list of project IDs to filter by.", projectId),
        startDate: dateTime,
        endDate: dateTime,
        priority: s.array("An optional list of Dida365 priority values.", priority),
        tag: s.stringArray("An optional list of Dida365 tag values."),
        status: s.array("An optional list of Dida365 task status codes.", s.integer("A Dida365 status code.")),
      },
      { optional: ["projectIds", "startDate", "endDate", "priority", "tag", "status"] },
    ),
    outputSchema: s.object({ tasks: s.array("The Dida365 tasks returned by the filter.", task) }),
  }),
  defineProviderAction(service, {
    name: "move_tasks",
    description: "Move one or more Dida365 tasks between projects.",
    requiredScopes: writeScope,
    inputSchema: s.object({
      moves: s.array("The Dida365 task move operations to submit.", moveOperation, { minItems: 1 }),
    }),
    outputSchema: s.object({ moves: s.array("The Dida365 move results.", s.looseObject("The Dida365 move result.")) }),
  }),
  defineProviderAction(service, {
    name: "list_habits",
    description: "List habits available to the connected Dida365 account.",
    requiredScopes: readScope,
    inputSchema: s.object("The input payload for listing Dida365 habits.", {}),
    outputSchema: s.object({ habits: s.array("The Dida365 habits.", habit) }),
  }),
  defineProviderAction(service, {
    name: "get_habit",
    description: "Get a Dida365 habit by its habit ID.",
    requiredScopes: readScope,
    inputSchema: s.object({ habitId }),
    outputSchema: s.object({ habit }),
  }),
  defineProviderAction(service, {
    name: "create_or_update_habit_checkin",
    description: "Create or update a Dida365 habit check-in for a date stamp.",
    requiredScopes: writeScope,
    inputSchema: s.object(
      "The input payload for creating or updating a Dida365 habit check-in.",
      {
        habitId,
        stamp: s.integer("A date stamp in YYYYMMDD format."),
        time: dateTime,
        opTime: dateTime,
        value: s.number("The check-in value."),
        goal: s.number("The check-in goal."),
        status: s.integer("The check-in status."),
      },
      { required: ["habitId", "stamp"], optional: ["time", "opTime", "value", "goal", "status"] },
    ),
    outputSchema: s.object({ checkin: habitCheckin }),
  }),
  defineProviderAction(service, {
    name: "list_habit_checkins",
    description: "List Dida365 habit check-ins for one or more habits over a date stamp range.",
    requiredScopes: readScope,
    inputSchema: s.object({
      habitIds: s.array("The Dida365 habit IDs to query.", habitId, { minItems: 1 }),
      from: s.integer("A date stamp in YYYYMMDD format."),
      to: s.integer("A date stamp in YYYYMMDD format."),
    }),
    outputSchema: s.object({ checkins: s.array("The Dida365 habit check-in groups.", habitCheckin) }),
  }),
];
