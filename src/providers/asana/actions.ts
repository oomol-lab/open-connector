import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { gidField, includeFieldsSchema, nextCursorSchema, paginationFields, taskSchema } from "./schemas.ts";

const service = "asana";

const customFieldsSchema = s.record(
  "Arbitrary object keyed by Asana custom field gid.",
  s.unknown("An Asana custom field value."),
);

const taskMutationFields = {
  name: s.nonEmptyString("The Asana task name."),
  notes: s.string("The Asana task notes."),
  assignee: s.nonEmptyString('The Asana task assignee, such as "me", an email, or a user gid.'),
  completed: s.boolean("Whether the task is completed."),
  dueOn: s.date("The task due date in YYYY-MM-DD format."),
  dueAt: s.dateTime("The task due date-time in RFC 3339 format."),
  startOn: s.date("The task start date in YYYY-MM-DD format."),
  startAt: s.dateTime("The task start date-time in RFC 3339 format."),
  approvalStatus: s.string("The Asana task approval status."),
  resourceSubtype: s.string("The Asana task subtype."),
  customFields: customFieldsSchema,
};

const createTaskInputSchema = s.object(
  "The input payload for this action.",
  {
    ...taskMutationFields,
    projectId: gidField("The Asana project gid that should receive the task."),
  },
  { required: ["projectId", "name"] },
);

const updateTaskInputSchema = s.object(
  "The input payload for this action.",
  {
    ...taskMutationFields,
    taskId: gidField("The Asana task gid."),
  },
  { required: ["taskId"] },
);
updateTaskInputSchema.anyOf = Object.keys(taskMutationFields).map((field) => ({ required: [field] }));

export const asanaActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_project_tasks",
    description: "List tasks within an Asana project, ordered by project priority, with pagination support.",
    inputSchema: s.object(
      "The input payload for this action.",
      {
        projectId: gidField("The Asana project gid."),
        completedSince: s.anyOf(
          'Only include tasks incomplete or completed since this RFC 3339 timestamp, or use the literal "now".',
          [s.literal("now"), s.dateTime("A completion timestamp.")],
        ),
        ...paginationFields,
        includeFields: includeFieldsSchema,
      },
      { required: ["projectId"] },
    ),
    outputSchema: s.object("The output payload for this action.", {
      tasks: s.array("The Asana tasks.", taskSchema),
      nextCursor: nextCursorSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_task",
    description: "Get a single Asana task by gid.",
    inputSchema: s.object(
      "The input payload for this action.",
      {
        taskId: gidField("The Asana task gid."),
        includeFields: includeFieldsSchema,
      },
      { required: ["taskId"] },
    ),
    outputSchema: s.object("The output payload for this action.", {
      task: taskSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "create_task",
    description: "Create a new Asana task in a project with optional assignee, notes, dates, and custom fields.",
    inputSchema: createTaskInputSchema,
    outputSchema: s.object("The output payload for this action.", {
      task: taskSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "update_task",
    description: "Update an existing Asana task by gid.",
    inputSchema: updateTaskInputSchema,
    outputSchema: s.object("The output payload for this action.", {
      task: taskSchema,
    }),
  }),
];
