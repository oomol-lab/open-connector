import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "browse_ai";

const unixTimestampMsSchema = s.integer("A Unix timestamp in milliseconds.");
const nullableUnixTimestampMsSchema = s.nullableInteger(
  "A Unix timestamp in milliseconds, or null when the value is unavailable.",
);

const browseAiInputParameterValueSchema = s.union(
  [
    s.string("A string input parameter value."),
    s.number("A numeric input parameter value."),
    s.stringArray("A list of selected string values.", { itemDescription: "One selected string value." }),
  ],
  { description: "A Browse AI input parameter value." },
);

const nullableBrowseAiInputParameterValueSchema = s.union(
  [browseAiInputParameterValueSchema, { type: "null", description: "A null parameter value." }],
  { description: "A Browse AI input parameter value or null." },
);

const browseAiSelectOptionSchema = s.object("One select option supported by a Browse AI robot input parameter.", {
  label: s.nonEmptyString("The display label of the select option."),
  value: s.nonEmptyString("The submitted value of the select option."),
});

const browseAiRobotInputParameterSchema = s.looseRequiredObject(
  "One Browse AI robot input parameter definition.",
  {
    type: s.nonEmptyString("The Browse AI input parameter type."),
    name: s.nonEmptyString("The parameter name used in task inputParameters."),
    label: s.nonEmptyString("The human-readable parameter label."),
    required: s.boolean("Whether the parameter is required when running the robot."),
    encrypted: s.boolean("Whether the parameter value is masked by Browse AI."),
    defaultValue: nullableBrowseAiInputParameterValueSchema,
    value: nullableBrowseAiInputParameterValueSchema,
    min: s.number("The minimum numeric value accepted by the parameter."),
    max: s.number("The maximum numeric value accepted by the parameter."),
    options: s.array("The select options available for this parameter.", browseAiSelectOptionSchema),
  },
  { optional: ["encrypted", "defaultValue", "value", "min", "max", "options"] },
);

const browseAiInputParametersObjectSchema = s.record(
  "The inputParameters object accepted by a Browse AI robot task.",
  browseAiInputParameterValueSchema,
);

const browseAiRobotSchema = s.object("A Browse AI robot.", {
  id: s.nonEmptyString("The Browse AI robot ID."),
  name: s.string("The Browse AI robot name."),
  createdAt: unixTimestampMsSchema,
  inputParameters: s.array("The input parameters supported by the Browse AI robot.", browseAiRobotInputParameterSchema),
});

const browseAiCapturedTextValueSchema = s.nullableString(
  "A captured text value, or null when Browse AI captured an empty field.",
);

const browseAiCapturedTextsSchema = s.record(
  "Captured text fields keyed by the Browse AI capture name.",
  browseAiCapturedTextValueSchema,
);

const browseAiCapturedScreenshotSchema = s.looseRequiredObject(
  "One captured screenshot returned by Browse AI.",
  {
    id: s.nonEmptyString("The Browse AI screenshot ID."),
    name: s.nullableString("The screenshot name."),
    src: s.nonEmptyString("The screenshot image URL."),
    width: s.number("The screenshot width in pixels."),
    height: s.number("The screenshot height in pixels."),
    x: s.number("The screenshot X offset in pixels."),
    y: s.number("The screenshot Y offset in pixels."),
    deviceScaleFactor: s.number("The device scale factor used to capture the screenshot."),
    full: s.nullableString("The screenshot coverage mode, such as page or viewport."),
    comparedToScreenshotId: s.nullableString("The screenshot ID used for Browse AI diff comparisons."),
    diffImageSrc: s.nullableString("The diff image URL highlighting screenshot changes."),
    changePercentage: s.number("The percentage of changed pixels compared with the previous screenshot."),
    diffThreshold: s.number("The configured screenshot change threshold percentage."),
    fileRemovedAt: nullableUnixTimestampMsSchema,
  },
  {
    optional: [
      "name",
      "width",
      "height",
      "x",
      "y",
      "deviceScaleFactor",
      "full",
      "comparedToScreenshotId",
      "diffImageSrc",
      "changePercentage",
      "diffThreshold",
      "fileRemovedAt",
    ],
  },
);

const browseAiCapturedScreenshotsSchema = s.record(
  "Captured screenshots keyed by the Browse AI screenshot capture name.",
  browseAiCapturedScreenshotSchema,
);

const browseAiCapturedListItemSchema = s.record(
  "One captured Browse AI list row keyed by column name.",
  browseAiCapturedTextValueSchema,
);

const browseAiCapturedListsSchema = s.record(
  "Captured lists keyed by the Browse AI list name.",
  s.array("The rows captured for a Browse AI list.", browseAiCapturedListItemSchema),
);

const browseAiTaskSchema = s.object(
  "A Browse AI robot task.",
  {
    id: s.nonEmptyString("The Browse AI task ID."),
    inputParameters: browseAiInputParametersObjectSchema,
    robotId: s.nonEmptyString("The Browse AI robot ID that owns the task."),
    status: s.nonEmptyString("The normalized Browse AI task status."),
    runByUserId: s.nullableString("The Browse AI user ID that started the task from the dashboard."),
    robotBulkRunId: s.nullableString("The Browse AI bulk run ID associated with the task."),
    runByTaskMonitorId: s.nullableString("The Browse AI monitor ID that started the task."),
    runByAPI: s.boolean("Whether the task was started through the API."),
    createdAt: unixTimestampMsSchema,
    startedAt: nullableUnixTimestampMsSchema,
    finishedAt: nullableUnixTimestampMsSchema,
    userFriendlyError: s.nullableString("The human-readable error returned when the task fails."),
    triedRecordingVideo: s.boolean("Whether Browse AI attempted to record a video for the task."),
    videoUrl: s.nullableString("The Browse AI task video URL."),
    videoRemovedAt: nullableUnixTimestampMsSchema,
    retriedOriginalTaskId: s.nullableString("The original failed task ID that Browse AI retried."),
    retriedByTaskId: s.nullableString("The retry task ID created by Browse AI for this task."),
    capturedDataTemporaryUrl: s.nullableString("The temporary Browse AI URL for downloading large captured data."),
    capturedTexts: browseAiCapturedTextsSchema,
    capturedScreenshots: browseAiCapturedScreenshotsSchema,
    capturedLists: browseAiCapturedListsSchema,
  },
  {
    optional: [
      "runByUserId",
      "robotBulkRunId",
      "runByTaskMonitorId",
      "runByAPI",
      "startedAt",
      "finishedAt",
      "userFriendlyError",
      "triedRecordingVideo",
      "videoUrl",
      "videoRemovedAt",
      "retriedOriginalTaskId",
      "retriedByTaskId",
      "capturedDataTemporaryUrl",
    ],
  },
);

const browseAiRobotCookieInputSchema = s.object(
  "One Browse AI robot cookie update payload.",
  {
    name: s.nonEmptyString("The cookie name."),
    value: s.union(
      [
        s.string("The cookie value as a string."),
        s.number("The cookie value as a number that will be serialized as a string."),
      ],
      { description: "The cookie value." },
    ),
    domain: s.string("The cookie domain."),
    expirationDate: s.integer("The cookie expiration time as a Unix timestamp in seconds."),
    path: s.string("The cookie path."),
    secure: s.boolean("Whether the cookie requires HTTPS."),
    httpOnly: s.boolean("Whether the cookie is HTTP-only."),
    hostOnly: s.boolean("Whether the cookie is restricted to the exact host."),
  },
  { required: ["name", "value"] },
);

const browseAiRobotCookieSchema = s.object(
  "One Browse AI robot cookie.",
  {
    name: s.nonEmptyString("The cookie name."),
    value: s.string("The cookie value."),
    domain: s.string("The cookie domain."),
    expirationDate: s.integer("The cookie expiration time as a Unix timestamp in seconds."),
    path: s.string("The cookie path."),
    secure: s.boolean("Whether the cookie requires HTTPS."),
    httpOnly: s.boolean("Whether the cookie is HTTP-only."),
    hostOnly: s.boolean("Whether the cookie is restricted to the exact host."),
  },
  { optional: ["domain", "expirationDate", "path", "secure", "httpOnly", "hostOnly"] },
);

const getRobotInputSchema = s.actionInput(
  {
    robotId: s.nonEmptyString("The Browse AI robot ID."),
  },
  ["robotId"],
  "The input for retrieving one Browse AI robot.",
);

const runRobotTaskInputSchema = s.actionInput(
  {
    robotId: s.nonEmptyString("The Browse AI robot ID."),
    recordVideo: s.boolean("Whether Browse AI should attempt to record a task video."),
    inputParameters: browseAiInputParametersObjectSchema,
  },
  ["robotId"],
  "The input for starting one Browse AI robot task.",
);

const getRobotTaskInputSchema = s.actionInput(
  {
    robotId: s.nonEmptyString("The Browse AI robot ID."),
    taskId: s.nonEmptyString("The Browse AI task ID."),
  },
  ["robotId", "taskId"],
  "The input for retrieving one Browse AI robot task.",
);

const listRobotTasksInputSchema = s.actionInput(
  {
    robotId: s.nonEmptyString("The Browse AI robot ID."),
    page: s.integer("The Browse AI task list page number.", { minimum: 1 }),
    pageSize: s.integer("The number of tasks to return per page.", { minimum: 1, maximum: 10 }),
    status: s.stringEnum("The Browse AI task status filter.", ["failed", "successful", "in-progress"]),
    robotBulkRunId: s.string("The Browse AI bulk run ID used to filter tasks."),
    sort: s.string("The Browse AI sort expression, such as -createdAt,finishedAt."),
    includeRetried: s.boolean("Whether retried tasks should be included in the result."),
    fromDate: unixTimestampMsSchema,
    toDate: unixTimestampMsSchema,
  },
  ["robotId"],
  "The input for listing Browse AI robot tasks.",
);

const updateRobotCookiesInputSchema = s.actionInput(
  {
    robotId: s.nonEmptyString("The Browse AI robot ID."),
    cookies: s.array("The cookies that should be stored on the Browse AI robot.", browseAiRobotCookieInputSchema),
  },
  ["robotId", "cookies"],
  "The input for updating Browse AI robot cookies.",
);

export const browseAiActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_robots",
    operationType: "read",
    description: "List the Browse AI robots available to the connected API key.",
    inputSchema: s.actionInput({}, [], "The input for listing Browse AI robots."),
    outputSchema: s.actionOutput(
      {
        robots: s.object("The Browse AI robot collection.", {
          totalCount: s.integer("The total number of Browse AI robots."),
          items: s.array("The Browse AI robots returned for the API key.", browseAiRobotSchema),
        }),
      },
      "The Browse AI robot list response.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_robot",
    operationType: "read",
    description: "Retrieve one Browse AI robot and its input parameter definitions by robot ID.",
    followUpActions: ["browse_ai.run_robot_task"],
    inputSchema: getRobotInputSchema,
    outputSchema: s.actionOutput(
      {
        robot: browseAiRobotSchema,
      },
      "The Browse AI robot lookup response.",
    ),
  }),
  defineProviderAction(service, {
    name: "run_robot_task",
    operationType: "write",
    description: "Start one Browse AI robot task with optional inputParameters overrides.",
    followUpActions: ["browse_ai.get_robot_task"],
    inputSchema: runRobotTaskInputSchema,
    outputSchema: s.actionOutput(
      {
        task: browseAiTaskSchema,
      },
      "The Browse AI task creation response.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_robot_task",
    operationType: "read",
    description: "Retrieve one Browse AI robot task and its captured data by robot and task IDs.",
    inputSchema: getRobotTaskInputSchema,
    outputSchema: s.actionOutput(
      {
        task: browseAiTaskSchema,
      },
      "The Browse AI robot task lookup response.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_robot_tasks",
    operationType: "read",
    description: "List Browse AI robot tasks with pagination and status filters.",
    inputSchema: listRobotTasksInputSchema,
    outputSchema: s.actionOutput(
      {
        tasks: s.object("The Browse AI task collection.", {
          totalCount: s.integer("The total number of Browse AI tasks."),
          pageNumber: s.integer("The current Browse AI task page number."),
          hasMore: s.boolean("Whether another Browse AI task page is available."),
          items: s.array("The Browse AI tasks returned on the current page.", browseAiTaskSchema),
        }),
      },
      "The Browse AI task list response.",
    ),
  }),
  defineProviderAction(service, {
    name: "update_robot_cookies",
    operationType: "destructive",
    description: "Update the cookies stored on one Browse AI robot.",
    inputSchema: updateRobotCookiesInputSchema,
    outputSchema: s.actionOutput(
      {
        cookies: s.array("The cookies returned by Browse AI after the update.", browseAiRobotCookieSchema),
      },
      "The Browse AI robot cookie update response.",
    ),
  }),
];
