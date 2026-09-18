import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "exhibitday";
const positiveId = (description: string) => s.integer(description, { minimum: 1 });
const responseSchema = s.object("The ExhibitDay API response.", {
  data: s.unknown("The parsed JSON value returned by ExhibitDay."),
});

const eventFields = {
  name: s.string("The event name.", { maxLength: 500 }),
  startDate: s.string("The event start date in YYYY-MM-DD format.", { format: "date" }),
  endDate: s.string("The event end date in YYYY-MM-DD format.", { format: "date" }),
  formatId: s.integer("The event format: 1 for in-person, 2 for virtual, or 3 for hybrid.", {
    minimum: 1,
    maximum: 3,
  }),
  participationTypeId: positiveId("The workspace event participation type ID."),
  integrationMetadata1: s.string("Integration-specific metadata stored on the event."),
  integrationMetadata2: s.string("A second integration-specific metadata value."),
};

const taskFields = {
  name: s.string("The task name."),
  eventId: positiveId("The associated event ID; omit for a general task."),
  taskSectionId: positiveId("The event task section ID."),
  completed: s.boolean("Whether the task is completed."),
  dueDate: s.string("The task due date in YYYY-MM-DD format.", { format: "date" }),
  assigneeUserId: positiveId("The user or resource ID assigned to the task."),
  details: s.string("Plain-text task details."),
  integrationMetadata1: s.string("Integration-specific metadata stored on the task."),
  integrationMetadata2: s.string("A second integration-specific metadata value."),
};

const taskUpdateFields = {
  name: taskFields.name,
  taskSectionId: s.nullable(positiveId("The replacement task section ID, or null to remove it.")),
  completed: taskFields.completed,
  dueDate: s.nullable(
    s.string("The replacement due date in YYYY-MM-DD format, or null to remove it.", {
      format: "date",
    }),
  ),
  assigneeUserId: s.nullable(positiveId("The replacement assignee ID, or null to leave the task unassigned.")),
  details: taskFields.details,
  integrationMetadata1: taskFields.integrationMetadata1,
  integrationMetadata2: taskFields.integrationMetadata2,
};

const listEventsAction = defineProviderAction(service, {
  name: "list_events",
  operationType: "read",
  description: "List ExhibitDay events using workspace, date, format, or tag filters.",
  inputSchema: s.object(
    "The event list filters.",
    {
      nameContains: s.string("Return events whose names contain this case-insensitive text."),
      startDateFrom: s.string("Return events starting on or after this date.", { format: "date" }),
      startDateTo: s.string("Return events starting on or before this date.", { format: "date" }),
      endDateFrom: s.string("Return events ending on or after this date.", { format: "date" }),
      endDateTo: s.string("Return events ending on or before this date.", { format: "date" }),
      participationTypeId: positiveId("Return events with this participation type ID."),
      formatId: s.integer("Return events with this format ID from 1 through 3.", {
        minimum: 1,
        maximum: 3,
      }),
      starRating: s.integer("Return events with this star rating from 0 through 3.", {
        minimum: 0,
        maximum: 3,
      }),
      tag: s.string("Return events with this tag."),
      integrationMetadata1: s.string("Match the first integration metadata field exactly."),
      includeTasks: s.boolean("Whether to include each event's task collection."),
      includeTaskSections: s.boolean("Whether to include each event's task sections."),
      includeCustomFields: s.boolean("Whether to include custom event field values."),
    },
    {
      optional: [
        "nameContains",
        "startDateFrom",
        "startDateTo",
        "endDateFrom",
        "endDateTo",
        "participationTypeId",
        "formatId",
        "starRating",
        "tag",
        "integrationMetadata1",
        "includeTasks",
        "includeTaskSections",
        "includeCustomFields",
      ],
    },
  ),
  outputSchema: responseSchema,
});

const getEventAction = defineProviderAction(service, {
  name: "get_event",
  operationType: "read",
  description: "Retrieve one ExhibitDay event by ID.",
  inputSchema: s.object("The event lookup input.", { eventId: positiveId("The event ID.") }),
  outputSchema: responseSchema,
});

const createEventAction = defineProviderAction(service, {
  name: "create_event",
  operationType: "write",
  description: "Create an event in ExhibitDay.",
  inputSchema: s.object("The new event fields.", eventFields, {
    optional: ["formatId", "participationTypeId", "integrationMetadata1", "integrationMetadata2"],
  }),
  outputSchema: responseSchema,
});

const updateEventAction = defineProviderAction(service, {
  name: "update_event",
  operationType: "write",
  description: "Update fields on an existing ExhibitDay event.",
  inputSchema: s.object(
    "The event ID and replacement fields.",
    {
      eventId: positiveId("The event ID."),
      ...eventFields,
      starRating: s.integer("The replacement star rating from 0 through 3.", {
        minimum: 0,
        maximum: 3,
      }),
      tags: s.stringArray("The replacement event tags."),
      websiteUrl: s.string("The replacement event website URL.", { format: "uri" }),
      venueName: s.string("The replacement venue name."),
      venueAddress: s.string("The replacement venue address."),
      eventNotes: s.string("Replacement event notes."),
    },
    {
      optional: [
        "name",
        "startDate",
        "endDate",
        "formatId",
        "participationTypeId",
        "integrationMetadata1",
        "integrationMetadata2",
        "starRating",
        "tags",
        "websiteUrl",
        "venueName",
        "venueAddress",
        "eventNotes",
      ],
    },
  ),
  outputSchema: responseSchema,
});

const deleteEventAction = defineProviderAction(service, {
  name: "delete_event",
  operationType: "destructive",
  description: "Permanently delete an ExhibitDay event.",
  inputSchema: s.object("The event deletion input.", { eventId: positiveId("The event ID.") }),
  outputSchema: responseSchema,
});

const listTasksAction = defineProviderAction(service, {
  name: "list_tasks",
  operationType: "read",
  description: "List ExhibitDay tasks using event, completion, due-date, or assignee filters.",
  inputSchema: s.object(
    "The task list filters.",
    {
      eventId: positiveId("Return tasks associated with this event ID."),
      generalOnly: s.boolean("Whether to return only general tasks not associated with an event."),
      incompleteOnly: s.boolean("Whether to return only incomplete tasks."),
      completedOnly: s.boolean("Whether to return only completed tasks."),
      noDueDate: s.boolean("Whether to return only tasks without a due date."),
      dueDateFrom: s.string("Return tasks due on or after this date.", { format: "date" }),
      dueDateTo: s.string("Return tasks due on or before this date.", { format: "date" }),
      hasAssignee: s.boolean("Filter tasks by whether they have an assignee."),
      assigneeUserId: positiveId("Return tasks assigned to this user or resource ID."),
      nameContains: s.string("Return tasks whose names contain this case-insensitive text."),
      integrationMetadata1: s.string("Match the first integration metadata field exactly."),
      includeComments: s.boolean("Whether to include each task's comments."),
    },
    {
      optional: [
        "eventId",
        "generalOnly",
        "incompleteOnly",
        "completedOnly",
        "noDueDate",
        "dueDateFrom",
        "dueDateTo",
        "hasAssignee",
        "assigneeUserId",
        "nameContains",
        "integrationMetadata1",
        "includeComments",
      ],
    },
  ),
  outputSchema: responseSchema,
});

const getTaskAction = defineProviderAction(service, {
  name: "get_task",
  operationType: "read",
  description: "Retrieve one ExhibitDay task by ID.",
  inputSchema: s.object("The task lookup input.", { taskId: positiveId("The task ID.") }),
  outputSchema: responseSchema,
});

const createTaskAction = defineProviderAction(service, {
  name: "create_task",
  operationType: "write",
  description: "Create an event-specific or general task in ExhibitDay.",
  inputSchema: s.object("The new task fields.", taskFields, {
    optional: [
      "eventId",
      "taskSectionId",
      "completed",
      "dueDate",
      "assigneeUserId",
      "details",
      "integrationMetadata1",
      "integrationMetadata2",
    ],
  }),
  outputSchema: responseSchema,
});

const updateTaskAction = defineProviderAction(service, {
  name: "update_task",
  operationType: "write",
  description: "Update fields on an existing ExhibitDay task.",
  inputSchema: s.object(
    "The task ID and replacement fields.",
    { taskId: positiveId("The task ID."), ...taskUpdateFields },
    {
      optional: [
        "name",
        "taskSectionId",
        "completed",
        "dueDate",
        "assigneeUserId",
        "details",
        "integrationMetadata1",
        "integrationMetadata2",
      ],
    },
  ),
  outputSchema: responseSchema,
});

const deleteTaskAction = defineProviderAction(service, {
  name: "delete_task",
  operationType: "destructive",
  description: "Permanently delete an ExhibitDay task.",
  inputSchema: s.object("The task deletion input.", { taskId: positiveId("The task ID.") }),
  outputSchema: responseSchema,
});

export const exhibitdayActions: ProviderActionDefinition[] = [
  listEventsAction,
  getEventAction,
  createEventAction,
  updateEventAction,
  deleteEventAction,
  listTasksAction,
  getTaskAction,
  createTaskAction,
  updateTaskAction,
  deleteTaskAction,
];
