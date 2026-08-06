import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "ticktick";

const readScope = ["ticktick.read"];
const writeScope = ["ticktick.write"];

const projectId = s.nonEmptyString("The TickTick project ID.");
const taskId = s.nonEmptyString("The TickTick task ID.");
const habitId = s.nonEmptyString("The TickTick habit ID.");
const ticktickDateTime = s.string("The TickTick date-time string in yyyy-MM-dd'T'HH:mm:ssZ format.");
const priority = s.union([s.literal(0), s.literal(1), s.literal(3), s.literal(5)], {
  description: "The TickTick priority value.",
});
const checklistItemInput = s.object(
  "A checklist item payload sent to TickTick.",
  {
    id: s.string("The checklist item ID."),
    title: s.nonEmptyString("The checklist item title."),
    status: s.integer("The checklist item status."),
    isAllDay: s.boolean("Whether the checklist item is all day."),
    timeZone: s.string("The checklist item time zone."),
    sortOrder: s.integer("The checklist item sort order."),
    startDate: ticktickDateTime,
    completedTime: ticktickDateTime,
  },
  { optional: ["id", "status", "isAllDay", "timeZone", "sortOrder", "startDate", "completedTime"] },
);
const project = s.looseObject("A TickTick project.", {
  id: s.string("The TickTick project ID."),
  name: s.string("The TickTick project name."),
});
const task = s.looseObject("A TickTick task.", {
  id: s.string("The TickTick task ID."),
  projectId: s.string("The TickTick project ID."),
  title: s.string("The TickTick task title."),
});
const column = s.looseObject("A TickTick project column.", {
  id: s.string("The TickTick column ID."),
  projectId: s.string("The TickTick project ID."),
  name: s.string("The TickTick column name."),
});
const habit = s.looseObject("A TickTick habit.", {
  id: s.string("The TickTick habit ID."),
  name: s.string("The TickTick habit name."),
});
const habitCheckin = s.looseObject("A TickTick habit check-in group.");

const noInput = s.object("No input is required.", {});
const projectLookup = s.object("TickTick project lookup input.", { projectId });
const taskLookup = s.object("TickTick task lookup input.", { projectId, taskId });
const projectMutationInput = s.object(
  "TickTick project mutation input.",
  {
    projectId,
    name: s.nonEmptyString("The TickTick project name."),
    color: s.string("The TickTick project color."),
    sortOrder: s.integer("The TickTick project sort order."),
    viewMode: s.stringEnum("The TickTick project view mode.", ["list", "kanban", "timeline"]),
    kind: s.stringEnum("The TickTick project kind.", ["TASK", "NOTE", "task", "note"]),
  },
  { optional: ["projectId", "name", "color", "sortOrder", "viewMode", "kind"] },
);
const createTaskInput = s.object(
  "TickTick create-task input.",
  {
    projectId,
    title: s.nonEmptyString("The TickTick task title."),
    content: s.string("The TickTick task content."),
    desc: s.string("The TickTick task description."),
    isAllDay: s.boolean("Whether the task is all day."),
    startDate: ticktickDateTime,
    dueDate: ticktickDateTime,
    timeZone: s.string("The TickTick task time zone."),
    reminders: s.stringArray("TickTick reminder trigger strings."),
    repeatFlag: s.string("The TickTick recurrence rule."),
    priority,
    sortOrder: s.integer("The TickTick task sort order."),
    items: s.array("Checklist items to create under the task.", checklistItemInput),
    tags: s.stringArray("Task tags."),
  },
  {
    optional: [
      "content",
      "desc",
      "isAllDay",
      "startDate",
      "dueDate",
      "timeZone",
      "reminders",
      "repeatFlag",
      "priority",
      "sortOrder",
      "items",
      "tags",
    ],
  },
);
const updateTaskInput = s.object(
  "TickTick update-task input.",
  {
    taskId,
    id: s.string("Optional task ID repeated in the request body."),
    ...(createTaskInput.properties as Record<string, unknown> as Record<string, ReturnType<typeof s.string>>),
  },
  {
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
      "repeatFlag",
      "priority",
      "sortOrder",
      "items",
    ],
  },
);
const batchCreateTasksInput = s.object("TickTick batch create-task input.", {
  tasks: s.array("The TickTick tasks to create.", createTaskInput, { minItems: 1, maxItems: 50 }),
});
const completedFilterInput = s.object(
  "TickTick completed-task filter input.",
  {
    projectIds: s.array("Project IDs to filter by.", projectId),
    startDate: ticktickDateTime,
    endDate: ticktickDateTime,
  },
  { optional: ["projectIds", "startDate", "endDate"] },
);
const filterTasksInput = s.object(
  "TickTick task filter input.",
  {
    projectIds: s.array("Project IDs to filter by.", projectId),
    startDate: ticktickDateTime,
    endDate: ticktickDateTime,
    priority: s.array("Priority values to filter by.", priority),
    tag: s.stringArray("Tags to filter by."),
    status: s.array("Task status codes to filter by.", s.integer("A task status code.")),
  },
  { optional: ["projectIds", "startDate", "endDate", "priority", "tag", "status"] },
);

export type TicktickActionName =
  | "get_user_project"
  | "get_project_by_id"
  | "get_project_with_data"
  | "create_project"
  | "update_project"
  | "delete_project"
  | "get_task_by_project_and_id"
  | "create_task"
  | "create_task2"
  | "batch_add_tasks"
  | "update_task"
  | "complete_task"
  | "delete_task"
  | "list_all_tasks"
  | "list_completed_tasks"
  | "filter_tasks"
  | "move_tasks"
  | "list_habits"
  | "get_habit"
  | "create_or_update_habit_checkin"
  | "list_habit_checkins";

export const ticktickActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_user_project",
    description: "List the projects available to the connected TickTick account.",
    requiredScopes: readScope,
    inputSchema: noInput,
    outputSchema: s.object({ projects: s.array("The TickTick projects.", project) }),
  }),
  defineProviderAction(service, {
    name: "get_project_by_id",
    description: "Get a TickTick project by its project ID.",
    requiredScopes: readScope,
    inputSchema: projectLookup,
    outputSchema: s.object({ project }),
  }),
  defineProviderAction(service, {
    name: "get_project_with_data",
    description: "Get a TickTick project together with its undone tasks and columns.",
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
    description: "Create a TickTick project.",
    requiredScopes: writeScope,
    inputSchema: s.object(projectMutationInput.properties as Record<string, ReturnType<typeof s.string>>, {
      required: ["name"],
      description: "TickTick create-project input.",
    }),
    outputSchema: s.object({ project }),
  }),
  defineProviderAction(service, {
    name: "update_project",
    description: "Update a TickTick project by project ID.",
    requiredScopes: writeScope,
    inputSchema: s.object(projectMutationInput.properties as Record<string, ReturnType<typeof s.string>>, {
      required: ["projectId"],
      description: "TickTick update-project input.",
    }),
    outputSchema: s.object({ project }),
  }),
  defineProviderAction(service, {
    name: "delete_project",
    description: "Delete a TickTick project by project ID.",
    requiredScopes: writeScope,
    inputSchema: projectLookup,
    outputSchema: s.object({ deleted: s.literal(true), projectId: s.string("The TickTick project ID.") }),
  }),
  defineProviderAction(service, {
    name: "get_task_by_project_and_id",
    description: "Get a TickTick task by project ID and task ID.",
    requiredScopes: readScope,
    inputSchema: taskLookup,
    outputSchema: s.object({ task }),
  }),
  defineProviderAction(service, {
    name: "create_task",
    description: "Create a TickTick task under a project.",
    requiredScopes: writeScope,
    inputSchema: createTaskInput,
    outputSchema: s.object({ task }),
  }),
  defineProviderAction(service, {
    name: "create_task2",
    description: "Deprecated compatibility alias for create_task.",
    requiredScopes: writeScope,
    inputSchema: createTaskInput,
    outputSchema: s.object({ task }),
  }),
  defineProviderAction(service, {
    name: "batch_add_tasks",
    description: "Batch create multiple TickTick tasks in one request.",
    requiredScopes: writeScope,
    inputSchema: batchCreateTasksInput,
    outputSchema: s.object({
      tasks: s.array("The created TickTick tasks.", task),
      createdCount: s.integer("The number of tasks created."),
    }),
  }),
  defineProviderAction(service, {
    name: "update_task",
    description: "Update a TickTick task by task ID and project ID.",
    requiredScopes: writeScope,
    inputSchema: updateTaskInput,
    outputSchema: s.object({ task }),
  }),
  defineProviderAction(service, {
    name: "complete_task",
    description: "Mark a TickTick task as completed.",
    requiredScopes: writeScope,
    inputSchema: taskLookup,
    outputSchema: s.object({
      completed: s.literal(true),
      projectId: s.string("The TickTick project ID."),
      taskId: s.string("The TickTick task ID."),
    }),
  }),
  defineProviderAction(service, {
    name: "delete_task",
    description: "Delete a TickTick task by project ID and task ID.",
    requiredScopes: writeScope,
    inputSchema: taskLookup,
    outputSchema: s.object({
      deleted: s.literal(true),
      projectId: s.string("The TickTick project ID."),
      taskId: s.string("The TickTick task ID."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_all_tasks",
    description: "List undone TickTick tasks across projects.",
    requiredScopes: readScope,
    inputSchema: s.object(
      {
        limit: s.positiveInteger("The maximum number of tasks to return."),
        projectIds: s.array("Project IDs to include.", projectId),
        includeClosedProjects: s.boolean("Whether closed projects should be included."),
      },
      { optional: ["limit", "projectIds", "includeClosedProjects"] },
    ),
    outputSchema: s.object({
      tasks: s.array("Aggregated undone tasks.", task),
      totalTasks: s.integer("The number of tasks returned."),
      projectsScanned: s.integer("The number of projects scanned."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_completed_tasks",
    description: "List completed TickTick tasks.",
    requiredScopes: readScope,
    inputSchema: completedFilterInput,
    outputSchema: s.object({ tasks: s.array("The completed TickTick tasks.", task) }),
  }),
  defineProviderAction(service, {
    name: "filter_tasks",
    description: "Filter TickTick tasks by project, date range, priority, tags, and status.",
    requiredScopes: readScope,
    inputSchema: filterTasksInput,
    outputSchema: s.object({ tasks: s.array("The filtered TickTick tasks.", task) }),
  }),
  defineProviderAction(service, {
    name: "move_tasks",
    description: "Move one or more TickTick tasks between projects.",
    requiredScopes: writeScope,
    inputSchema: s.object({
      moves: s.array(
        "The TickTick task move operations.",
        s.object({
          fromProjectId: projectId,
          toProjectId: projectId,
          taskId,
        }),
        { minItems: 1 },
      ),
    }),
    outputSchema: s.object({ moves: s.array("The TickTick move results.", s.looseObject("A move result.")) }),
  }),
  defineProviderAction(service, {
    name: "list_habits",
    description: "List habits available to the connected TickTick account.",
    requiredScopes: readScope,
    inputSchema: noInput,
    outputSchema: s.object({ habits: s.array("The TickTick habits.", habit) }),
  }),
  defineProviderAction(service, {
    name: "get_habit",
    description: "Get a TickTick habit by its habit ID.",
    requiredScopes: readScope,
    inputSchema: s.object({ habitId }),
    outputSchema: s.object({ habit }),
  }),
  defineProviderAction(service, {
    name: "create_or_update_habit_checkin",
    description: "Create or update a TickTick habit check-in for a date stamp.",
    requiredScopes: writeScope,
    inputSchema: s.object(
      {
        habitId,
        stamp: s.integer("A date stamp in YYYYMMDD format."),
        time: ticktickDateTime,
        opTime: ticktickDateTime,
        value: s.number("The check-in value."),
        goal: s.number("The check-in goal."),
        status: s.integer("The check-in status."),
      },
      { optional: ["time", "opTime", "value", "goal", "status"] },
    ),
    outputSchema: s.object({ checkin: habitCheckin }),
  }),
  defineProviderAction(service, {
    name: "list_habit_checkins",
    description: "List TickTick habit check-ins over a date stamp range.",
    requiredScopes: readScope,
    inputSchema: s.object({
      habitIds: s.array("The TickTick habit IDs to query.", habitId, { minItems: 1 }),
      from: s.integer("Start date stamp in YYYYMMDD format."),
      to: s.integer("End date stamp in YYYYMMDD format."),
    }),
    outputSchema: s.object({ checkins: s.array("The TickTick habit check-in groups.", habitCheckin) }),
  }),
];
