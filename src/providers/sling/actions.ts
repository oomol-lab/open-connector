import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "sling";

const idList = (description: string) =>
  s.array(description, s.positiveInteger("One Sling numeric identifier."), { minItems: 1 });
const stringList = (description: string) =>
  s.stringArray(description, { minItems: 1, itemDescription: "One Sling filter value." });
const rawObject = (description: string) => s.looseObject(description);
const rawObjectList = (description: string, itemDescription: string) =>
  s.array(description, rawObject(itemDescription));

const emptyInputSchema = s.object("No input is required.", {});

const listUsersInputSchema = s.object(
  "Input parameters for listing Sling users in the current organization.",
  {
    query: s.nonEmptyString("Only return users with a matching prefix in name, lastname, or email."),
    ids: idList("Only return Sling users whose ids are in this list."),
    includeDeleted: s.boolean("Whether deleted users should be included."),
  },
  { optional: ["query", "ids", "includeDeleted"] },
);

const listGroupsInputSchema = s.object(
  "Input parameters for listing Sling groups in the current organization.",
  {
    ids: idList("Only return Sling groups whose ids are in this list."),
    type: s.nonEmptyString("Only return groups with this Sling group type."),
  },
  { optional: ["ids", "type"] },
);

const calendarEventsInputSchema = s.object(
  "Input parameters for listing Sling calendar events for one user.",
  {
    orgId: s.positiveInteger("The Sling organization identifier."),
    userId: s.positiveInteger("The Sling user identifier."),
    dates: s.nonEmptyString("The ISO 8601 interval to fetch, such as 2026-06-24/2026-06-30."),
    locationIds: idList("Sling location ids used to filter calendar events."),
    positionIds: idList("Sling position ids used to filter calendar events."),
    tagIds: idList("Sling tag ids used to include calendar events."),
    excludeTagIds: idList("Sling tag ids used to exclude calendar events."),
    userIds: idList("Sling user ids used to filter calendar events."),
    groupIds: idList("Sling group ids used to include calendar events."),
    excludeGroupIds: idList("Sling group ids used to exclude calendar events."),
    dayPartIds: idList("Sling day part ids used to include calendar events."),
    excludeDayPartIds: idList("Sling day part ids used to exclude calendar events."),
    eventTypes: stringList("Sling event types to include."),
    groupBy: s.nonEmptyString("The Sling calendar grouping mode."),
    pageSize: s.integer("The number of calendar results to return.", { minimum: 1 }),
    page: s.integer("The zero-based calendar result page to return.", { minimum: 0 }),
    skipUnscheduled: s.boolean("Whether unscheduled shifts should be skipped."),
    showPlanningEvents: s.boolean("Whether planning status events should be included."),
  },
  {
    optional: [
      "locationIds",
      "positionIds",
      "tagIds",
      "excludeTagIds",
      "userIds",
      "groupIds",
      "excludeGroupIds",
      "dayPartIds",
      "excludeDayPartIds",
      "eventTypes",
      "groupBy",
      "pageSize",
      "page",
      "skipUnscheduled",
      "showPlanningEvents",
    ],
  },
);

const shiftIdInputSchema = s.object("Input parameters for a Sling shift-scoped request.", {
  shiftId: s.anyOf("The Sling shift identifier.", [
    s.positiveInteger("A numeric Sling shift identifier."),
    s.nonEmptyString("A string Sling shift identifier."),
  ]),
});

const listUsersOutputSchema = s.object("The Sling users returned by the connector.", {
  users: rawObjectList("The Sling user records returned by the API.", "One Sling user record."),
});
const shiftOutputSchema = s.object("The Sling shift returned by the connector.", {
  shift: rawObject("The Sling shift record returned by the API."),
});

export const slingActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_current_session",
    description: "Retrieve the current Sling API session, including user and organization details.",
    inputSchema: emptyInputSchema,
    outputSchema: s.object("The current Sling session returned by the connector.", {
      session: rawObject("The Sling session record returned by the API."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_users",
    description: "List Sling users in the current organization with optional filters.",
    inputSchema: listUsersInputSchema,
    outputSchema: listUsersOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_user",
    description: "Retrieve one Sling user by id.",
    inputSchema: s.object("Input parameters for retrieving one Sling user.", {
      userId: s.positiveInteger("The Sling user identifier."),
    }),
    outputSchema: s.object("The Sling user returned by the connector.", {
      user: rawObject("The Sling user record returned by the API."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_groups",
    description: "List Sling groups in the current organization with optional filters.",
    inputSchema: listGroupsInputSchema,
    outputSchema: s.object("The Sling groups returned by the connector.", {
      groups: rawObjectList("The Sling group records returned by the API.", "One Sling group record."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_group",
    description: "Retrieve one Sling group by id.",
    inputSchema: s.object("Input parameters for retrieving one Sling group.", {
      groupId: s.positiveInteger("The Sling group identifier."),
    }),
    outputSchema: s.object("The Sling group returned by the connector.", {
      group: rawObject("The Sling group record returned by the API."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_calendar_events",
    description: "List Sling calendar events for one user and organization within an ISO interval.",
    inputSchema: calendarEventsInputSchema,
    outputSchema: s.object("The Sling calendar events returned by the connector.", {
      events: rawObjectList(
        "The Sling calendar event records returned by the API.",
        "One Sling calendar event record.",
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "get_shift",
    description: "Retrieve one Sling shift by id.",
    inputSchema: s.object(
      "Input parameters for retrieving one Sling shift.",
      {
        shiftId: s.nonEmptyString("The Sling shift or event identifier."),
        includeTimesheets: s.stringEnum("How much timesheet data Sling should include.", ["true", "full"]),
      },
      { optional: ["includeTimesheets"] },
    ),
    outputSchema: shiftOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_detailed_shift",
    description: "Retrieve supplementary details for one Sling shift.",
    inputSchema: shiftIdInputSchema,
    outputSchema: shiftOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_shift_coworkers",
    description: "List coworkers for one Sling shift.",
    inputSchema: shiftIdInputSchema,
    outputSchema: s.object("The Sling shift coworkers returned by the connector.", {
      coworkers: rawObjectList("The Sling coworker records returned by the API.", "One Sling coworker record."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_current_shift",
    description: "Retrieve the current shift for the connected Sling user.",
    inputSchema: emptyInputSchema,
    outputSchema: shiftOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_next_shift",
    description: "Retrieve the next shift for the connected Sling user.",
    inputSchema: s.object(
      "Input parameters for retrieving the next Sling shift for the current user.",
      { referenceDate: s.nonEmptyString("Only return the first shift after this ISO timestamp.") },
      { optional: ["referenceDate"] },
    ),
    outputSchema: shiftOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_working_users",
    description: "List Sling users working on a specific date.",
    inputSchema: s.object("Input parameters for listing users working on a day.", {
      date: s.nonEmptyString("The ISO date for the working-users query."),
    }),
    outputSchema: listUsersOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_tasks",
    description: "List Sling tasks with optional type and cursor-like id filters.",
    inputSchema: s.object(
      "Input parameters for listing Sling tasks.",
      {
        filter: s.nonEmptyString("Only return tasks that belong to this Sling task type."),
        since: s.positiveInteger("Only return tasks with an id greater than this value."),
        before: s.positiveInteger("Only return tasks with an id less than this value."),
        pageSize: s.integer("The number of task results to return.", { minimum: 1 }),
      },
      { optional: ["filter", "since", "before", "pageSize"] },
    ),
    outputSchema: s.object("The Sling tasks returned by the connector.", {
      tasks: rawObjectList("The Sling task records returned by the API.", "One Sling task record."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_task",
    description: "Retrieve one Sling task by id.",
    inputSchema: s.object("Input parameters for retrieving one Sling task.", {
      taskId: s.positiveInteger("The Sling task identifier."),
    }),
    outputSchema: s.object("The Sling task returned by the connector.", {
      task: rawObject("The Sling task record returned by the API."),
    }),
  }),
];
