import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "worksnaps";

const timeEntryTypeSchema = s.stringEnum("The Worksnaps time entry type filter.", ["online", "offline"]);
const reportTypeSchema = s.stringEnum("The Worksnaps report type to request.", ["time_entries", "time_summary"]);
const positiveIdSchema = (description: string): JsonSchema => s.positiveInteger(description);
const unixTimestampStringSchema = (description: string): JsonSchema =>
  s.string({ description, minLength: 1, pattern: "^[0-9]+$" });
const idListSchema = s.array(
  "A non-empty list of Worksnaps numeric identifiers.",
  positiveIdSchema("A Worksnaps numeric identifier."),
  {
    minItems: 1,
  },
);

const userAssignmentSchema = s.looseRequiredObject(
  "A Worksnaps user assignment record.",
  {
    id: positiveIdSchema("The Worksnaps user assignment ID."),
    projectId: positiveIdSchema("The Worksnaps project ID."),
    userId: positiveIdSchema("The Worksnaps user ID."),
    userFirstName: s.nonEmptyString("The assigned user's first name."),
    userLastName: s.nonEmptyString("The assigned user's last name."),
    userEmail: s.nonEmptyString("The assigned user's email address."),
    role: s.nonEmptyString("The assigned project role."),
    raw: s.unknownObject("The raw Worksnaps user assignment payload."),
  },
  { optional: ["userFirstName", "userLastName", "userEmail", "role"] },
);

const taskAssignmentSchema = s.looseRequiredObject("A Worksnaps task assignment record.", {
  id: positiveIdSchema("The Worksnaps task assignment ID."),
  projectId: positiveIdSchema("The Worksnaps project ID."),
  taskId: positiveIdSchema("The Worksnaps task ID."),
  userId: positiveIdSchema("The Worksnaps user ID."),
  raw: s.unknownObject("The raw Worksnaps task assignment payload."),
});

const projectSchema = s.looseRequiredObject(
  "A normalized Worksnaps project record.",
  {
    id: positiveIdSchema("The Worksnaps project ID."),
    name: s.nonEmptyString("The Worksnaps project name."),
    description: s.nonEmptyString("The Worksnaps project description."),
    status: s.nonEmptyString("The Worksnaps project status."),
    userAssignments: s.array(
      "The project members returned when includeUserAssignment is enabled.",
      userAssignmentSchema,
    ),
    raw: s.unknownObject("The raw Worksnaps project payload."),
  },
  { optional: ["description", "status", "userAssignments"] },
);

const taskSchema = s.looseRequiredObject(
  "A normalized Worksnaps task record.",
  {
    id: positiveIdSchema("The Worksnaps task ID."),
    name: s.nonEmptyString("The Worksnaps task name."),
    description: s.nonEmptyString("The Worksnaps task description."),
    taskAssignments: s.array(
      "The task assignments returned when includeTaskAssignment is enabled.",
      taskAssignmentSchema,
    ),
    raw: s.unknownObject("The raw Worksnaps task payload."),
  },
  { optional: ["description", "taskAssignments"] },
);

const timeEntrySchema = s.looseRequiredObject(
  "A normalized Worksnaps time entry record.",
  {
    id: positiveIdSchema("The Worksnaps time entry ID."),
    loggedTimestamp: unixTimestampStringSchema("The timestamp when Worksnaps logged the entry."),
    fromTimestamp: unixTimestampStringSchema("The start timestamp of the time entry."),
    durationInMinutes: s.nonNegativeInteger("The duration of the time entry in minutes."),
    type: s.nonEmptyString("The Worksnaps time entry type."),
    projectId: positiveIdSchema("The Worksnaps project ID."),
    userId: positiveIdSchema("The Worksnaps user ID."),
    taskId: positiveIdSchema("The Worksnaps task ID."),
    userComment: s.nonEmptyString("The user comment attached to the time entry."),
    thumbnailUrl: s.nonEmptyString("The thumbnail screenshot URL."),
    webcamUrl: s.nonEmptyString("The webcam snapshot URL."),
    activityLevel: s.nonNegativeInteger("The activity level reported by Worksnaps."),
    raw: s.unknownObject("The raw Worksnaps time entry payload."),
  },
  { optional: ["userComment", "thumbnailUrl", "webcamUrl", "activityLevel", "taskId", "userId", "projectId"] },
);

const reportLineSchema = s.looseRequiredObject(
  "A normalized Worksnaps project report line.",
  {
    userId: positiveIdSchema("The Worksnaps user ID."),
    projectId: positiveIdSchema("The Worksnaps project ID."),
    durationInMinutes: s.nonNegativeInteger("The reported duration in minutes."),
    taskId: positiveIdSchema("The Worksnaps task ID."),
    taskName: s.nonEmptyString("The Worksnaps task name."),
    userComment: s.nonEmptyString("The reported user comment."),
    timeEntryType: s.nonEmptyString("The Worksnaps time entry type."),
    raw: s.unknownObject("The raw Worksnaps report line payload."),
  },
  { optional: ["taskId", "taskName", "userComment", "timeEntryType"] },
);

const currentUserSchema = s.looseRequiredObject(
  "The current Worksnaps user profile.",
  {
    id: positiveIdSchema("The Worksnaps user ID."),
    login: s.nonEmptyString("The Worksnaps login name."),
    firstName: s.nonEmptyString("The user's first name."),
    lastName: s.nonEmptyString("The user's last name."),
    email: s.nonEmptyString("The user's email address."),
    timezoneId: s.integer("The Worksnaps timezone identifier."),
    timezoneName: s.nonEmptyString("The Worksnaps timezone name."),
    isInDaylightTime: s.boolean("Whether the user is currently in daylight saving time."),
    raw: s.unknownObject("The raw Worksnaps user payload."),
  },
  { optional: ["firstName", "lastName", "email", "timezoneId", "timezoneName", "isInDaylightTime"] },
);

export const worksnapsActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_current_user",
    description: "Read the current Worksnaps user profile for the connected API token.",
    inputSchema: s.actionInput({}, [], "Input parameters for reading the current Worksnaps user."),
    outputSchema: s.actionOutput({ user: currentUserSchema }, "The Worksnaps current user response."),
  }),
  defineProviderAction(service, {
    name: "list_projects",
    description: "List Worksnaps projects that the current user is involved in.",
    inputSchema: s.object(
      "Input parameters for listing Worksnaps projects.",
      {
        includeUserAssignment: s.boolean(
          "Whether Worksnaps should include project member assignments in each project record.",
        ),
      },
      { optional: ["includeUserAssignment"] },
    ),
    outputSchema: s.actionOutput(
      { projects: s.array("The Worksnaps projects returned for the request.", projectSchema) },
      "The Worksnaps project list response.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_project",
    description: "Read one Worksnaps project by project ID.",
    inputSchema: s.object(
      "Input parameters for reading one Worksnaps project.",
      {
        projectId: positiveIdSchema("The Worksnaps project ID to retrieve."),
        includeUserAssignment: s.boolean(
          "Whether Worksnaps should include project member assignments in the response.",
        ),
      },
      { optional: ["includeUserAssignment"] },
    ),
    outputSchema: s.actionOutput({ project: projectSchema }, "The Worksnaps project detail response."),
  }),
  defineProviderAction(service, {
    name: "list_project_tasks",
    description: "List tasks that belong to one Worksnaps project.",
    inputSchema: s.object(
      "Input parameters for listing tasks in one Worksnaps project.",
      {
        projectId: positiveIdSchema("The Worksnaps project ID whose tasks should be listed."),
        includeTaskAssignment: s.boolean("Whether Worksnaps should include task assignments in each task record."),
      },
      { optional: ["includeTaskAssignment"] },
    ),
    outputSchema: s.actionOutput(
      { tasks: s.array("The Worksnaps tasks returned for the request.", taskSchema) },
      "The Worksnaps task list response.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_task",
    description: "Read one Worksnaps task by project ID and task ID.",
    inputSchema: s.actionInput(
      {
        projectId: positiveIdSchema("The Worksnaps project ID that owns the task."),
        taskId: positiveIdSchema("The Worksnaps task ID to retrieve."),
      },
      ["projectId", "taskId"],
      "Input parameters for reading one Worksnaps task.",
    ),
    outputSchema: s.actionOutput({ task: taskSchema }, "The Worksnaps task detail response."),
  }),
  defineProviderAction(service, {
    name: "list_project_user_assignments",
    description: "List user assignments for one Worksnaps project.",
    inputSchema: s.actionInput(
      { projectId: positiveIdSchema("The Worksnaps project ID whose members should be listed.") },
      ["projectId"],
      "Input parameters for listing Worksnaps project members.",
    ),
    outputSchema: s.actionOutput(
      { userAssignments: s.array("The user assignments returned for the Worksnaps project.", userAssignmentSchema) },
      "The Worksnaps user assignment list response.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_project_task_assignments",
    description: "List task assignments for one Worksnaps project.",
    inputSchema: s.actionInput(
      { projectId: positiveIdSchema("The Worksnaps project ID whose task assignments should be listed.") },
      ["projectId"],
      "Input parameters for listing Worksnaps task assignments in one project.",
    ),
    outputSchema: s.actionOutput(
      { taskAssignments: s.array("The task assignments returned for the Worksnaps project.", taskAssignmentSchema) },
      "The Worksnaps task assignment list response.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_project_time_entries",
    description: "List Worksnaps time entries in one project for one or more users.",
    inputSchema: s.object(
      "Input parameters for listing Worksnaps time entries in one project.",
      {
        projectId: positiveIdSchema("The Worksnaps project ID whose time entries should be listed."),
        userIds: idListSchema,
        fromTimestamp: unixTimestampStringSchema("The starting Unix timestamp string at a 10-minute boundary."),
        toTimestamp: unixTimestampStringSchema("The ending Unix timestamp string at a 10-minute boundary."),
        taskIds: idListSchema,
        timeEntryType: timeEntryTypeSchema,
      },
      { optional: ["taskIds", "timeEntryType"] },
    ),
    outputSchema: s.actionOutput(
      { timeEntries: s.array("The Worksnaps time entries returned for the request.", timeEntrySchema) },
      "The Worksnaps time entry list response.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_project_time_entry",
    description: "Read one Worksnaps time entry by project ID and time entry ID.",
    inputSchema: s.actionInput(
      {
        projectId: positiveIdSchema("The Worksnaps project ID that owns the time entry."),
        timeEntryId: positiveIdSchema("The Worksnaps time entry ID to retrieve."),
      },
      ["projectId", "timeEntryId"],
      "Input parameters for reading one Worksnaps time entry.",
    ),
    outputSchema: s.actionOutput({ timeEntry: timeEntrySchema }, "The Worksnaps time entry detail response."),
  }),
  defineProviderAction(service, {
    name: "get_project_time_report",
    description: "Read a Worksnaps project report for a bounded time window and user set.",
    inputSchema: s.object(
      "Input parameters for reading a Worksnaps project report.",
      {
        projectId: positiveIdSchema("The Worksnaps project ID whose report should be generated."),
        reportType: reportTypeSchema,
        fromTimestamp: unixTimestampStringSchema("The starting Unix timestamp string at a 10-minute boundary."),
        toTimestamp: unixTimestampStringSchema("The ending Unix timestamp string at a 10-minute boundary."),
        userIds: idListSchema,
        taskIds: idListSchema,
        timeEntryType: timeEntryTypeSchema,
      },
      { optional: ["taskIds", "timeEntryType"] },
    ),
    outputSchema: s.actionOutput(
      {
        reportType: reportTypeSchema,
        reportLines: s.array("The Worksnaps report lines returned for the request.", reportLineSchema),
      },
      "The Worksnaps project report response.",
    ),
  }),
];
