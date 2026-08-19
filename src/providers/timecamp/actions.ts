import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "timecamp";

const rawOutput = s.unknown("The raw TimeCamp response payload for this item.");
const timecampDate = (description: string): JsonSchema => s.date(description);
const timecampTimestamp = (description: string): JsonSchema => s.nonEmptyString(description);
const positiveInteger = (description: string): JsonSchema => s.positiveInteger(description);
const timecampId = (description: string): JsonSchema =>
  s.anyOf(description, [
    s.nonEmptyString(`${description} as a string.`),
    positiveInteger(`${description} as a positive integer.`),
  ]);

const userSchema = s.object("A normalized TimeCamp user.", {
  userId: s.nullableString("The TimeCamp user ID."),
  email: s.nullableString("The user's email address."),
  displayName: s.nullableString("The user's display name."),
  groupId: s.nullableString("The group ID associated with the user when returned."),
  rootGroupId: s.nullableString("The user's root group ID when returned."),
  registerTime: s.nullableString("The user registration timestamp returned by TimeCamp."),
  loginTime: s.nullableString("The user's last login timestamp when returned."),
  syncTime: s.nullableString("The user's last desktop sync timestamp when returned."),
  permissions: s.looseObject("The permission flags returned by TimeCamp for this user."),
  raw: rawOutput,
});

const taskSchema = s.object("A normalized TimeCamp task or project.", {
  taskId: s.nullableString("The TimeCamp task ID."),
  parentId: s.nullableString("The parent task ID, or null for root-level projects."),
  assignedBy: s.nullableString("The user ID that assigned this task when returned."),
  name: s.nullableString("The task or project name."),
  externalTaskId: s.nullableString("The external task ID when configured."),
  externalParentId: s.nullableString("The external parent task ID when configured."),
  level: s.nullableNumber("The task tree level when returned."),
  archived: s.nullableBoolean("Whether TimeCamp marks the task as archived."),
  billable: s.nullableBoolean("Whether TimeCamp marks the task as billable."),
  color: s.nullableString("The task color returned by TimeCamp."),
  note: s.nullableString("The task note returned by TimeCamp."),
  addDate: s.nullableString("The task creation timestamp returned by TimeCamp."),
  modifyTime: s.nullableString("The task modification timestamp returned by TimeCamp."),
  users: s.looseObject("The TimeCamp users assigned to this task keyed by user ID."),
  raw: rawOutput,
});

const timeEntryTagSchema = s.object("A normalized tag attached to a TimeCamp time entry.", {
  tagListName: s.nullableString("The TimeCamp tag list name."),
  tagListId: s.nullableString("The TimeCamp tag list ID."),
  tagId: s.nullableString("The TimeCamp tag ID."),
  name: s.nullableString("The tag name."),
  mandatory: s.nullableBoolean("Whether TimeCamp marks the tag as mandatory."),
  raw: rawOutput,
});

const timeEntrySchema = s.object("A normalized TimeCamp time entry.", {
  entryId: s.nullableString("The TimeCamp time entry ID."),
  duration: s.nullableNumber("The time entry duration in seconds."),
  userId: s.nullableString("The TimeCamp user ID associated with the entry."),
  userName: s.nullableString("The TimeCamp user name associated with the entry."),
  taskId: s.nullableString("The task ID associated with the entry."),
  taskName: s.nullableString("The task name associated with the entry."),
  date: s.nullableString("The time entry date."),
  startTime: s.nullableString("The time entry start time."),
  endTime: s.nullableString("The time entry end time."),
  lastModify: s.nullableString("The TimeCamp modification timestamp."),
  locked: s.nullableBoolean("Whether TimeCamp marks the entry as locked."),
  billable: s.nullableBoolean("Whether TimeCamp marks the entry as billable."),
  invoiceId: s.nullableString("The invoice ID associated with the entry when returned."),
  note: s.nullableString("The time entry note or description."),
  color: s.nullableString("The time entry color when returned."),
  tags: s.array("The tags attached to the time entry.", timeEntryTagSchema),
  hasEntryLocationHistory: s.nullableBoolean("Whether TimeCamp reports location history for this entry."),
  raw: rawOutput,
});

const timerSchema = s.object("A normalized TimeCamp timer response.", {
  isTimerRunning: s.nullableBoolean("Whether TimeCamp reports an active timer."),
  elapsed: s.nullableNumber("Elapsed timer seconds when TimeCamp returns them."),
  entryId: s.nullableString("The entry ID associated with the timer response."),
  timerId: s.nullableString("The active timer ID when returned."),
  newTimerId: s.nullableString("The new timer ID returned after starting a timer."),
  startTime: s.nullableString("The timer start timestamp when returned."),
  entryTime: s.nullableNumber("The saved entry duration after stopping a timer."),
  raw: rawOutput,
});

const listTimeEntriesInputSchema = withAnyOfRequired(
  s.object(
    "The input payload for listing TimeCamp time entries.",
    {
      from: timecampDate("The start date in YYYY-MM-DD format."),
      to: timecampDate("The end date in YYYY-MM-DD format."),
      billable: s.boolean("Whether TimeCamp should return only billable entries."),
      modifyFrom: timecampDate("The minimal latest modification date in YYYY-MM-DD format."),
      modifyTo: timecampDate("The maximal latest modification date in YYYY-MM-DD format."),
      tagIds: s.array(
        "Tag IDs used to filter entries. TimeCamp receives one repeated tags_filter item per tag.",
        timecampId("A TimeCamp tag ID"),
        { minItems: 1 },
      ),
      approvalMode: s.boolean("Whether TimeCamp should apply approval-mode permissions."),
      optionalFields: s.stringEnum("Extra fields TimeCamp should include in the response.", ["tags", "breadcrumps"]),
      includeProject: s.boolean("Whether TimeCamp should include project or task information."),
      includeRates: s.boolean("Whether TimeCamp should include rate information."),
      withSubtasks: s.boolean("Whether TimeCamp should include subtasks."),
      ignoreInvoiced: s.boolean("Whether TimeCamp should ignore invoiced entries."),
      roundDuration: s.boolean("Whether TimeCamp should round entry durations."),
      activeOnly: s.boolean("Whether TimeCamp should return only active entries."),
      userIds: s.array(
        "User IDs to include. Use me for entries owned by the current user.",
        s.nonEmptyString("A TimeCamp user ID or the value me."),
        { minItems: 1 },
      ),
    },
    {
      optional: [
        "from",
        "to",
        "billable",
        "modifyFrom",
        "modifyTo",
        "tagIds",
        "approvalMode",
        "optionalFields",
        "includeProject",
        "includeRates",
        "withSubtasks",
        "ignoreInvoiced",
        "roundDuration",
        "activeOnly",
        "userIds",
      ],
    },
  ),
  [
    ["from", "to"],
    ["modifyFrom", "modifyTo"],
  ],
);

const createTimeEntryInputSchema = withAnyOfRequired(
  s.object(
    "The input payload for creating a TimeCamp time entry.",
    {
      date: timecampDate("The date for the time entry in YYYY-MM-DD format."),
      startTime: timecampTimestamp("The entry start time accepted by TimeCamp, such as HH:mm:ss or a full timestamp."),
      endTime: timecampTimestamp("The entry end time accepted by TimeCamp, such as HH:mm:ss or a full timestamp."),
      duration: positiveInteger("The entry duration in seconds."),
      userId: timecampId("The user ID for which TimeCamp should create the entry"),
      taskId: positiveInteger("The task ID associated with the new entry."),
      tags: s.array("Tag IDs to attach to the new entry.", positiveInteger("A TimeCamp tag ID."), {
        minItems: 1,
      }),
      note: s.nonEmptyString("The note to attach to the new time entry."),
      description: s.nonEmptyString("The description to attach to the new time entry."),
      billable: s.boolean("Whether TimeCamp should mark the entry as billable."),
    },
    {
      optional: ["startTime", "endTime", "duration", "userId", "taskId", "tags", "note", "description", "billable"],
    },
  ),
  [["duration"], ["startTime", "endTime"]],
);

const updateTimeEntryInputSchema = withAnyOfRequired(
  s.object(
    "The input payload for updating a TimeCamp time entry.",
    {
      entryId: positiveInteger("The TimeCamp time entry ID to update."),
      startTime: timecampTimestamp("The updated entry start time accepted by TimeCamp."),
      endTime: timecampTimestamp("The updated entry end time accepted by TimeCamp."),
      duration: positiveInteger("The updated entry duration in seconds."),
      date: timecampDate("The updated entry date in YYYY-MM-DD format."),
      note: s.nonEmptyString("The updated note for the time entry."),
      description: s.nonEmptyString("The updated description for the time entry."),
      invoiceId: positiveInteger("The updated invoice ID associated with the entry."),
      taskId: positiveInteger("The updated task ID associated with the entry."),
      billable: s.boolean("Whether TimeCamp should mark the entry as billable."),
    },
    {
      required: ["entryId"],
      optional: ["startTime", "endTime", "duration", "date", "note", "description", "invoiceId", "taskId", "billable"],
    },
  ),
  [
    ["startTime"],
    ["endTime"],
    ["duration"],
    ["date"],
    ["note"],
    ["description"],
    ["invoiceId"],
    ["taskId"],
    ["billable"],
  ],
);

export const timecampActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_current_user",
    description: "Get the TimeCamp user associated with the current API token.",
    inputSchema: s.actionInput({}, [], "The input payload for retrieving the current TimeCamp user."),
    outputSchema: s.actionOutput(
      {
        user: userSchema,
      },
      "The response returned when retrieving the current TimeCamp user.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_users",
    description: "List users in the connected TimeCamp account.",
    inputSchema: s.actionInput(
      {
        activeOnly: s.boolean("Whether TimeCamp should return only active users."),
      },
      [],
      "The input payload for listing TimeCamp users.",
    ),
    outputSchema: s.actionOutput(
      {
        users: s.array("The TimeCamp users returned by the API.", userSchema),
      },
      "The response returned when listing TimeCamp users.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_tasks",
    description: "List TimeCamp tasks or projects with optional task and status filters.",
    inputSchema: s.actionInput(
      {
        taskIds: s.array(
          "Specific TimeCamp task IDs to request. Multiple values are sent as a comma-separated task_id query.",
          timecampId("A TimeCamp task ID"),
          { minItems: 1 },
        ),
        externalTaskId: s.nonEmptyString("A TimeCamp external task ID to request."),
        permissions: s.array(
          "Permission names used by TimeCamp to filter tasks.",
          s.stringEnum("A TimeCamp task permission filter.", [
            "create_subtask",
            "edit_task_settings",
            "track_time",
            "view_detailed_data",
          ]),
          { minItems: 1 },
        ),
        status: s.stringEnum("The TimeCamp task status filter.", ["active", "archived", "all"]),
        minimal: s.boolean("Whether TimeCamp should return minimal task information."),
        ignoreAdminRights: s.boolean("Whether TimeCamp should ignore admin rights while filtering accessible tasks."),
      },
      [],
      "The input payload for listing TimeCamp tasks.",
    ),
    outputSchema: s.actionOutput(
      {
        tasks: s.array("The TimeCamp tasks returned by the API.", taskSchema),
        raw: s.unknown("The raw TimeCamp tasks response."),
      },
      "The response returned when listing TimeCamp tasks.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_time_entries",
    description: "List TimeCamp time entries for a date or modification range.",
    inputSchema: listTimeEntriesInputSchema,
    outputSchema: s.actionOutput(
      {
        timeEntries: s.array("The TimeCamp time entries returned by the API.", timeEntrySchema),
        raw: s.unknown("The raw TimeCamp time entries response."),
      },
      "The response returned when listing TimeCamp time entries.",
    ),
  }),
  defineProviderAction(service, {
    name: "create_time_entry",
    description: "Create a TimeCamp time entry.",
    inputSchema: createTimeEntryInputSchema,
    outputSchema: s.actionOutput(
      {
        entryId: s.nullableString("The ID of the created TimeCamp time entry."),
        raw: rawOutput,
      },
      "The response returned after creating a TimeCamp time entry.",
    ),
  }),
  defineProviderAction(service, {
    name: "update_time_entry",
    description: "Update an existing TimeCamp time entry.",
    inputSchema: updateTimeEntryInputSchema,
    outputSchema: s.actionOutput(
      {
        timeEntry: timeEntrySchema,
      },
      "The response returned after updating a TimeCamp time entry.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_timer_status",
    description: "Get the current TimeCamp timer status.",
    inputSchema: s.actionInput({}, [], "The input payload for reading the TimeCamp timer status."),
    outputSchema: s.actionOutput(
      {
        timer: timerSchema,
      },
      "The response returned when reading the TimeCamp timer status.",
    ),
  }),
  defineProviderAction(service, {
    name: "start_timer",
    description: "Start a TimeCamp timer, optionally attached to a task.",
    inputSchema: s.actionInput(
      {
        taskId: positiveInteger("The task ID to track time against."),
        startedAt: timecampTimestamp("The timestamp from which TimeCamp should start the timer."),
      },
      [],
      "The input payload for starting a TimeCamp timer.",
    ),
    outputSchema: s.actionOutput(
      {
        timer: timerSchema,
      },
      "The response returned after starting a TimeCamp timer.",
    ),
  }),
  defineProviderAction(service, {
    name: "stop_timer",
    description: "Stop the current TimeCamp timer and save the tracked time.",
    inputSchema: s.actionInput(
      {
        stoppedAt: timecampTimestamp("The timestamp at which TimeCamp should stop the timer."),
      },
      [],
      "The input payload for stopping a TimeCamp timer.",
    ),
    outputSchema: s.actionOutput(
      {
        timer: timerSchema,
      },
      "The response returned after stopping a TimeCamp timer.",
    ),
  }),
];

function withAnyOfRequired(schema: JsonSchema, fieldSets: string[][]): JsonSchema {
  return {
    ...schema,
    anyOf: fieldSets.map((fieldSet) => ({ required: fieldSet })),
  };
}
