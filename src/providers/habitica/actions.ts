import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "habitica";

const taskTypeSchema = s.stringEnum("The Habitica task type.", ["habit", "daily", "todo", "reward"]);
const taskQueryTypeSchema = s.stringEnum("The task type filter supported by Habitica.", [
  "habits",
  "dailys",
  "todos",
  "rewards",
  "completedTodos",
]);
const taskAttributeSchema = s.stringEnum("The Habitica stat associated with the task.", ["str", "int", "per", "con"]);
const taskPrioritySchema = s.anyOf("The Habitica task priority.", [
  s.literal(0.1, { description: "A trivial task priority." }),
  s.literal(1, { description: "An easy task priority." }),
  s.literal(1.5, { description: "A medium task priority." }),
  s.literal(2, { description: "A hard task priority." }),
]);
const scoreDirectionSchema = s.stringEnum("The direction used to score a Habitica task.", ["up", "down"]);
const rawObjectSchema = s.unknownObject("The raw Habitica object.");

const checklistItemInputSchema = s.object("One checklist item to send to Habitica.", {
  text: s.nonEmptyString("The checklist item text."),
  completed: s.boolean("Whether the checklist item starts completed."),
});

const checklistItemSchema = s.object("One normalized Habitica checklist item.", {
  id: s.nullableString("The Habitica checklist item identifier."),
  text: s.nullableString("The checklist item text."),
  completed: s.nullableBoolean("Whether the checklist item is completed."),
  raw: rawObjectSchema,
});

const tagSchema = s.object("One normalized Habitica tag.", {
  id: s.nullableString("The Habitica tag identifier."),
  name: s.nullableString("The Habitica tag name."),
  challenge: s.nullableString("The Habitica challenge identifier when this tag belongs to a challenge."),
  raw: rawObjectSchema,
});

const taskSchema = s.object("One normalized Habitica task.", {
  id: s.nullableString("The Habitica task identifier."),
  text: s.nullableString("The Habitica task text."),
  alias: s.nullableString("The Habitica task alias."),
  type: s.nullable(taskTypeSchema),
  notes: s.nullableString("The Habitica task notes."),
  completed: s.nullableBoolean("Whether the Habitica task is completed."),
  priority: s.nullableNumber("The Habitica task priority."),
  value: s.nullableNumber("The Habitica task value."),
  attribute: s.nullable(taskAttributeSchema),
  date: s.nullableString("The Habitica due date string when returned."),
  tags: s.array("The Habitica tag IDs attached to the task.", s.string("One Habitica tag ID.")),
  checklist: s.array("The normalized Habitica checklist items.", checklistItemSchema),
  raw: rawObjectSchema,
});

const scoreResultSchema = s.object("The normalized Habitica task score result.", {
  delta: s.nullableNumber("The Habitica score delta."),
  hp: s.nullableNumber("The user's HP after scoring."),
  mp: s.nullableNumber("The user's MP after scoring."),
  exp: s.nullableNumber("The user's EXP after scoring."),
  gp: s.nullableNumber("The user's GP after scoring."),
  lvl: s.nullableInteger("The user's level after scoring."),
  class: s.nullableString("The user's class after scoring."),
  points: s.nullableInteger("The user's remaining stat points after scoring."),
  str: s.nullableNumber("The user's STR after scoring."),
  con: s.nullableNumber("The user's CON after scoring."),
  int: s.nullableNumber("The user's INT after scoring."),
  per: s.nullableNumber("The user's PER after scoring."),
  tmp: s.unknownObject("The temporary drop payload returned by Habitica."),
  raw: s.unknownObject("The raw Habitica score response data."),
});

const userSchema = s.object("The normalized authenticated Habitica user profile.", {
  id: s.nullableString("The Habitica user identifier."),
  profileName: s.nullableString("The Habitica profile display name."),
  level: s.nullableInteger("The Habitica user level."),
  class: s.nullableString("The Habitica user class."),
  partyId: s.nullableString("The Habitica party identifier when the user has one."),
  raw: rawObjectSchema,
});

const taskIdSchema = s.nonEmptyString("The Habitica task ID or alias.");
const tagIdSchema = s.uuid("The Habitica tag ID.");

const taskMutationProperties = {
  text: s.nonEmptyString("The text displayed for the Habitica task."),
  type: taskTypeSchema,
  tags: s.array("The Habitica tag IDs to attach to the task.", s.string("One Habitica tag ID.")),
  alias: s.nonEmptyString("An optional Habitica alias for the task."),
  attribute: taskAttributeSchema,
  checklist: s.array("The checklist items to attach to the task.", checklistItemInputSchema),
  collapseChecklist: s.boolean("Whether Habitica should collapse the checklist."),
  notes: s.string("Additional Habitica task notes."),
  date: s.dateTime("The due date to send to Habitica for todo tasks."),
  priority: taskPrioritySchema,
  frequency: s.stringEnum("The Habitica daily frequency.", ["daily", "weekly", "monthly", "yearly"]),
  repeat: s.unknownObject("The Habitica repeat object for dailies, keyed by weekday abbreviations."),
  everyX: s.integer("The Habitica everyX interval for dailies.", { minimum: 1 }),
  streak: s.nonNegativeInteger("The Habitica streak value for dailies."),
  daysOfMonth: s.array(
    "The Habitica daysOfMonth values for monthly dailies.",
    s.integer("One day of month.", { minimum: 1, maximum: 31 }),
  ),
  weeksOfMonth: s.array(
    "The Habitica weeksOfMonth values for monthly dailies.",
    s.integer("One week-of-month value.", { minimum: 1, maximum: 5 }),
  ),
  startDate: s.dateTime("The Habitica start date for dailies."),
  up: s.boolean("Whether a habit can be scored up."),
  down: s.boolean("Whether a habit can be scored down."),
  value: s.number("The Habitica reward cost or task value."),
  completed: s.boolean("Whether the task is completed."),
};

const taskMutationOptional = [
  "tags",
  "alias",
  "attribute",
  "checklist",
  "collapseChecklist",
  "notes",
  "date",
  "priority",
  "frequency",
  "repeat",
  "everyX",
  "streak",
  "daysOfMonth",
  "weeksOfMonth",
  "startDate",
  "up",
  "down",
  "value",
  "completed",
];

const createTaskInputSchema = s.object(
  "The common Habitica user task fields accepted by create and update endpoints.",
  taskMutationProperties,
  { optional: taskMutationOptional },
);

const updateTaskInputSchema = {
  ...s.object(
    "Input parameters for updating one Habitica task.",
    {
      taskId: taskIdSchema,
      ...Object.fromEntries(Object.entries(taskMutationProperties).filter(([key]) => key !== "type")),
    },
    { optional: ["text", ...taskMutationOptional.filter((key) => key !== "type")] },
  ),
  anyOf: Object.keys(taskMutationProperties)
    .filter((key) => key !== "type")
    .map((key) => ({ required: [key] })),
};

export const habiticaActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_user_profile",
    description: "Get the authenticated Habitica user's profile with optional userFields filtering.",
    inputSchema: s.actionInput(
      {
        userFields: s.nonEmptyString(
          "A comma-separated Habitica userFields selection passed through to the /user endpoint.",
        ),
      },
      [],
      "Input parameters for reading the authenticated Habitica user profile.",
    ),
    outputSchema: s.actionOutput(
      { user: userSchema },
      "The response returned when reading the authenticated Habitica user profile.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_my_tasks",
    description: "List the authenticated Habitica user's tasks with optional type and dueDate filters.",
    inputSchema: s.actionInput(
      {
        type: taskQueryTypeSchema,
        dueDate: s.date("The optional date used for Habitica nextDue computation."),
      },
      [],
      "Input parameters for listing the authenticated Habitica user's tasks.",
    ),
    outputSchema: s.actionOutput(
      { tasks: s.array("The normalized Habitica tasks.", taskSchema) },
      "The response returned when listing Habitica tasks.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_task",
    description: "Get one Habitica task by task ID or alias.",
    inputSchema: s.actionInput({ taskId: taskIdSchema }, ["taskId"], "Input parameters for reading one Habitica task."),
    outputSchema: s.actionOutput({ task: taskSchema }, "The response returned when reading one Habitica task."),
  }),
  defineProviderAction(service, {
    name: "create_task",
    description: "Create one new personal Habitica task from a single JSON task object.",
    inputSchema: createTaskInputSchema,
    outputSchema: s.actionOutput({ task: taskSchema }, "The response returned when creating one Habitica task."),
  }),
  defineProviderAction(service, {
    name: "update_task",
    description: "Update one Habitica task by task ID or alias.",
    inputSchema: updateTaskInputSchema,
    outputSchema: s.actionOutput({ task: taskSchema }, "The response returned when updating one Habitica task."),
  }),
  defineProviderAction(service, {
    name: "delete_task",
    description: "Delete one Habitica task by task ID or alias.",
    inputSchema: s.actionInput(
      { taskId: taskIdSchema },
      ["taskId"],
      "Input parameters for deleting one Habitica task.",
    ),
    outputSchema: s.actionOutput(
      {
        deleted: s.boolean("Whether the Habitica task deletion was accepted."),
        taskId: taskIdSchema,
      },
      "The response returned when deleting one Habitica task.",
    ),
  }),
  defineProviderAction(service, {
    name: "score_task",
    description: "Score one Habitica task in the up or down direction.",
    inputSchema: s.actionInput(
      {
        taskId: taskIdSchema,
        direction: scoreDirectionSchema,
      },
      ["taskId", "direction"],
      "Input parameters for scoring one Habitica task.",
    ),
    outputSchema: s.actionOutput(
      { scoreResult: scoreResultSchema },
      "The response returned when scoring one Habitica task.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_tags",
    description: "List the authenticated Habitica user's tags.",
    inputSchema: s.actionInput({}, [], "No input is required for listing Habitica tags."),
    outputSchema: s.actionOutput(
      { tags: s.array("The normalized Habitica tags.", tagSchema) },
      "The response returned when listing Habitica tags.",
    ),
  }),
  defineProviderAction(service, {
    name: "create_tag",
    description: "Create one new Habitica tag.",
    inputSchema: s.actionInput(
      { name: s.nonEmptyString("The Habitica tag name.") },
      ["name"],
      "Input parameters for creating one Habitica tag.",
    ),
    outputSchema: s.actionOutput({ tag: tagSchema }, "The response returned when creating one Habitica tag."),
  }),
  defineProviderAction(service, {
    name: "update_tag",
    description: "Update one Habitica tag by tag ID.",
    inputSchema: s.actionInput(
      {
        tagId: tagIdSchema,
        name: s.nonEmptyString("The replacement Habitica tag name."),
      },
      ["tagId", "name"],
      "Input parameters for updating one Habitica tag.",
    ),
    outputSchema: s.actionOutput({ tag: tagSchema }, "The response returned when updating one Habitica tag."),
  }),
  defineProviderAction(service, {
    name: "delete_tag",
    description: "Delete one Habitica tag by tag ID.",
    inputSchema: s.actionInput({ tagId: tagIdSchema }, ["tagId"], "Input parameters for deleting one Habitica tag."),
    outputSchema: s.actionOutput(
      {
        deleted: s.boolean("Whether the Habitica tag deletion was accepted."),
        tagId: tagIdSchema,
      },
      "The response returned when deleting one Habitica tag.",
    ),
  }),
];
