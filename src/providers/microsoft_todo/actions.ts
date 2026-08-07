import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { microsoftTodoProviderScopes, microsoftTodoReadScopes, microsoftTodoWriteScopes } from "./scopes.ts";

const service = "microsoft_todo";
const readPermissions = [microsoftTodoProviderScopes.tasksRead];
const writePermissions = [microsoftTodoProviderScopes.tasksReadWrite];

interface MicrosoftTodoActionSource {
  name: string;
  description: string;
  requiredScopes: string[];
  providerPermissions: string[];
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
}

const nonEmptyString = (description: string): JsonSchema => s.string({ minLength: 1, description });

const taskListId = nonEmptyString("Microsoft To Do task list ID.");
const taskId = nonEmptyString("Microsoft To Do task ID.");
const checklistItemId = nonEmptyString("Microsoft To Do checklist item ID.");
const nextLink = s.url("Opaque pagination URL returned by a previous Microsoft To Do response (@odata.nextLink).");

const dateTimeTimeZone = s.object(
  "A date and time with an explicit time zone.",
  {
    dateTime: nonEmptyString("Date and time value, for example 2026-08-07T09:00:00."),
    timeZone: s.string({ description: "Time zone for dateTime, for example UTC. Defaults to UTC when omitted." }),
  },
  { required: ["dateTime"] },
);
const dueDateTime = s.describe(dateTimeTimeZone, "Date and time the task is due.");
const startDateTime = s.describe(dateTimeTimeZone, "Date and time the task is scheduled to start.");
const reminderDateTime = s.describe(dateTimeTimeZone, "Date and time to alert the user with a reminder.");

const itemBody = s.object(
  "The body content of a task.",
  {
    content: s.string({ description: "Body content." }),
    contentType: s.stringEnum(["text", "html"], { description: "Body content type." }),
  },
  { required: ["content"] },
);

const recurrencePatternType = s.stringEnum(
  ["daily", "weekly", "absoluteMonthly", "relativeMonthly", "absoluteYearly", "relativeYearly"],
  { description: "Recurrence pattern type." },
);
const dayOfWeek = s.stringEnum(["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"], {
  description: "Day of the week.",
});
const recurrencePattern = s.object(
  "The frequency of a task recurrence.",
  {
    type: recurrencePatternType,
    interval: s.positiveInteger("Number of units between occurrences."),
    month: s.integer({ description: "Month of the year for yearly recurrences." }),
    dayOfMonth: s.integer({ description: "Day of the month for monthly recurrences." }),
    daysOfWeek: s.array(dayOfWeek, { description: "Days of the week for weekly or monthly recurrences." }),
    firstDayOfWeek: dayOfWeek,
    index: s.stringEnum(["first", "second", "third", "fourth", "last"], {
      description: "Which week the recurrence falls on for relative monthly/yearly recurrences.",
    }),
  },
  { required: ["type", "interval"] },
);
const recurrenceRange = s.object(
  "The date range over which a task recurrence repeats.",
  {
    type: s.stringEnum(["endDate", "noEnd", "numbered"], { description: "Recurrence range type." }),
    startDate: s.date("Start date of the recurrence range."),
    endDate: s.date("End date of the recurrence range."),
    recurrenceTimeZone: s.string({ description: "Time zone for startDate and endDate." }),
    numberOfOccurrences: s.nonNegativeInteger("Number of occurrences for a numbered recurrence range."),
  },
  { required: ["type", "startDate"] },
);
const patternedRecurrence = s.object(
  "A recurrence pattern and range for a task.",
  {
    pattern: recurrencePattern,
    range: recurrenceRange,
  },
  { required: ["pattern", "range"] },
);

const wellknownListName = s.stringEnum(["none", "defaultList", "flaggedEmails", "unknownFutureValue"], {
  description: "Well-known list identifier when the list is a built-in list.",
});
const todoTaskList = s.looseObject(
  {
    id: nonEmptyString("Task list ID."),
    displayName: nonEmptyString("Display name for the task list."),
    isOwner: s.boolean({ description: "Whether the current user owns the task list." }),
    isShared: s.boolean({ description: "Whether the task list is shared." }),
    wellknownListName,
  },
  { description: "Microsoft To Do task list resource." },
);

const taskStatus = s.stringEnum(["notStarted", "inProgress", "completed", "waitingOnOthers", "deferred"], {
  description: "State or progress of the task.",
});
const importance = s.stringEnum(["low", "normal", "high"], { description: "Importance of the task." });
const checklistItem = s.looseObject(
  {
    id: nonEmptyString("Checklist item ID."),
    displayName: nonEmptyString("Display name of the checklist item."),
    isChecked: s.boolean({ description: "Whether the checklist item is checked." }),
    createdDateTime: s.dateTime("When the checklist item was created."),
    checkedDateTime: s.dateTime("When the checklist item was checked."),
  },
  { description: "Microsoft To Do checklist item resource." },
);
const todoTask = s.looseObject(
  {
    id: nonEmptyString("Task ID."),
    title: nonEmptyString("Task title."),
    body: itemBody,
    bodyLastModifiedDateTime: s.dateTime("When the task body was last modified."),
    status: taskStatus,
    importance,
    isReminderOn: s.boolean({ description: "Whether a reminder alert is set for the task." }),
    reminderDateTime: dateTimeTimeZone,
    recurrence: patternedRecurrence,
    categories: s.stringArray("Categories associated with the task."),
    createdDateTime: s.dateTime("When the task was created."),
    lastModifiedDateTime: s.dateTime("When the task was last modified."),
    dueDateTime: dateTimeTimeZone,
    startDateTime: dateTimeTimeZone,
    completedDateTime: dateTimeTimeZone,
    hasAttachments: s.boolean({ description: "Whether the task has attachments." }),
    checklistItems: s.array(checklistItem, { description: "Checklist items linked to the task." }),
  },
  { description: "Microsoft To Do task resource." },
);

const listQueryProperties = {
  top: s.integer({ description: "Maximum number of items to return.", minimum: 1, maximum: 1000 }),
  skip: s.nonNegativeInteger("Number of items to skip."),
  filter: s.string({ description: "OData $filter expression." }),
  orderby: s.string({ description: "OData $orderby expression." }),
  nextLink,
};

const taskListsPage = s.object(
  "A page of Microsoft To Do task lists.",
  {
    value: s.array(todoTaskList, { description: "Task lists in this page." }),
    nextLink,
  },
  { required: ["value"], optional: ["nextLink"] },
);
const tasksPage = s.object(
  "A page of Microsoft To Do tasks.",
  {
    value: s.array(todoTask, { description: "Tasks in this page." }),
    nextLink,
  },
  { required: ["value"], optional: ["nextLink"] },
);
const checklistItemsPage = s.object(
  "A page of Microsoft To Do checklist items.",
  {
    value: s.array(checklistItem, { description: "Checklist items in this page." }),
    nextLink,
  },
  { required: ["value"], optional: ["nextLink"] },
);

const deletedConfirmation = (description: string): JsonSchema =>
  s.object(
    description,
    {
      id: nonEmptyString("ID of the deleted resource."),
      deleted: s.literal(true, { description: "Always true when the deletion succeeded." }),
    },
    { required: ["id", "deleted"] },
  );

const actions: MicrosoftTodoActionSource[] = [
  action(
    "list_task_lists",
    "List the current user's Microsoft To Do task lists.",
    microsoftTodoReadScopes,
    readPermissions,
    s.object(listQueryProperties, { optional: Object.keys(listQueryProperties) }),
    taskListsPage,
  ),
  action(
    "get_task_list",
    "Get one Microsoft To Do task list by ID.",
    microsoftTodoReadScopes,
    readPermissions,
    s.object({ listId: taskListId }, { required: ["listId"] }),
    todoTaskList,
  ),
  action(
    "create_task_list",
    "Create a new Microsoft To Do task list.",
    microsoftTodoWriteScopes,
    writePermissions,
    s.object({ displayName: nonEmptyString("Display name for the new task list.") }, { required: ["displayName"] }),
    todoTaskList,
  ),
  action(
    "update_task_list",
    "Rename a Microsoft To Do task list.",
    microsoftTodoWriteScopes,
    writePermissions,
    s.object(
      { listId: taskListId, displayName: nonEmptyString("Updated display name for the task list.") },
      { required: ["listId", "displayName"] },
    ),
    todoTaskList,
  ),
  action(
    "delete_task_list",
    "Delete a Microsoft To Do task list and all of its tasks.",
    microsoftTodoWriteScopes,
    writePermissions,
    s.object({ listId: taskListId }, { required: ["listId"] }),
    deletedConfirmation("Confirmation that the task list was deleted."),
  ),
  action(
    "list_tasks",
    "List tasks in a Microsoft To Do task list.",
    microsoftTodoReadScopes,
    readPermissions,
    s.object(
      {
        listId: taskListId,
        expandChecklistItems: s.boolean({ description: "Include checklist items for each task." }),
        ...listQueryProperties,
      },
      { required: ["listId"], optional: ["expandChecklistItems", ...Object.keys(listQueryProperties)] },
    ),
    tasksPage,
  ),
  action(
    "get_task",
    "Get one task from a Microsoft To Do task list.",
    microsoftTodoReadScopes,
    readPermissions,
    s.object({ listId: taskListId, taskId }, { required: ["listId", "taskId"] }),
    todoTask,
  ),
  action(
    "create_task",
    "Create a new task in a Microsoft To Do task list.",
    microsoftTodoWriteScopes,
    writePermissions,
    s.object(
      {
        listId: taskListId,
        title: nonEmptyString("Task title."),
        body: itemBody,
        status: taskStatus,
        importance,
        categories: s.stringArray("Categories to associate with the task."),
        dueDateTime,
        startDateTime,
        isReminderOn: s.boolean({
          description:
            "Whether to alert the user with a reminder. Set reminderDateTime as well, otherwise no alert fires.",
        }),
        reminderDateTime,
        recurrence: patternedRecurrence,
      },
      { required: ["listId", "title"] },
    ),
    todoTask,
  ),
  action(
    "update_task",
    "Update fields on an existing Microsoft To Do task.",
    microsoftTodoWriteScopes,
    writePermissions,
    s.object(
      {
        listId: taskListId,
        taskId,
        title: nonEmptyString("Updated task title."),
        body: itemBody,
        status: taskStatus,
        importance,
        categories: s.stringArray("Updated categories for the task."),
        dueDateTime,
        startDateTime,
        completedDateTime: dateTimeTimeZone,
        isReminderOn: s.boolean({
          description:
            "Whether to alert the user with a reminder. Set reminderDateTime as well, otherwise no alert fires.",
        }),
        reminderDateTime,
        recurrence: patternedRecurrence,
      },
      { required: ["listId", "taskId"] },
    ),
    todoTask,
  ),
  action(
    "delete_task",
    "Delete a task from a Microsoft To Do task list.",
    microsoftTodoWriteScopes,
    writePermissions,
    s.object({ listId: taskListId, taskId }, { required: ["listId", "taskId"] }),
    deletedConfirmation("Confirmation that the task was deleted."),
  ),
  action(
    "list_checklist_items",
    "List checklist items on a Microsoft To Do task.",
    microsoftTodoReadScopes,
    readPermissions,
    s.object({ listId: taskListId, taskId, nextLink }, { required: ["listId", "taskId"], optional: ["nextLink"] }),
    checklistItemsPage,
  ),
  action(
    "create_checklist_item",
    "Add a checklist item to a Microsoft To Do task.",
    microsoftTodoWriteScopes,
    writePermissions,
    s.object(
      { listId: taskListId, taskId, displayName: nonEmptyString("Display name for the checklist item.") },
      { required: ["listId", "taskId", "displayName"] },
    ),
    checklistItem,
  ),
  action(
    "update_checklist_item",
    "Update a checklist item on a Microsoft To Do task.",
    microsoftTodoWriteScopes,
    writePermissions,
    s.object(
      {
        listId: taskListId,
        taskId,
        checklistItemId,
        displayName: nonEmptyString("Updated display name for the checklist item."),
        isChecked: s.boolean({ description: "Whether the checklist item is checked." }),
      },
      { required: ["listId", "taskId", "checklistItemId"] },
    ),
    checklistItem,
  ),
  action(
    "delete_checklist_item",
    "Delete a checklist item from a Microsoft To Do task.",
    microsoftTodoWriteScopes,
    writePermissions,
    s.object({ listId: taskListId, taskId, checklistItemId }, { required: ["listId", "taskId", "checklistItemId"] }),
    deletedConfirmation("Confirmation that the checklist item was deleted."),
  ),
];

export const microsoftTodoActions: ActionDefinition[] = actions.map((item) => defineProviderAction(service, item));

function action(
  name: string,
  description: string,
  requiredScopes: string[],
  providerPermissions: string[],
  inputSchema: JsonSchema,
  outputSchema: JsonSchema,
): MicrosoftTodoActionSource {
  return { name, description, requiredScopes, providerPermissions, inputSchema, outputSchema };
}
