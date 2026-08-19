import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "cronitor";

const monitorKeySchema = s.nonEmptyString("The unique key of the Cronitor monitor.");
const monitorTypeSchema = s.stringEnum("The Cronitor monitor type.", ["job", "check", "heartbeat", "site"]);
const notifyListSchema = s.array(
  "Notification list keys or integration targets Cronitor alerts for this monitor.",
  s.nonEmptyString("A Cronitor notification list key or integration target."),
);
const notifyHashSchema = s.object(
  {
    alerts: notifyListSchema,
    events: s.object(
      {
        run: s.boolean("Whether Cronitor should notify when a run event occurs."),
        complete: s.boolean("Whether Cronitor should notify when a complete event occurs."),
      },
      { optional: ["run", "complete"], description: "Lifecycle telemetry events that should trigger notifications." },
    ),
  },
  { optional: ["alerts", "events"], description: "Occurrence-based Cronitor notification settings." },
);
const notifySchema = s.anyOf("Cronitor notification list or occurrence-based settings.", [
  notifyListSchema,
  notifyHashSchema,
]);

const monitorRequestSchema = s.looseObject(
  {
    url: s.url("The URL that Cronitor checks."),
    method: s.nonEmptyString("The HTTP method used by Cronitor when checking the URL."),
    timeout_seconds: s.positiveInteger("The request timeout in seconds."),
    headers: s.record(
      "HTTP headers sent by Cronitor when checking the URL.",
      s.nonEmptyString("A header value sent by Cronitor."),
    ),
  },
  { description: "The HTTP request configuration used by Cronitor check monitors." },
);

const monitorSchema = s.looseObject(
  {
    key: s.string("The unique key of the Cronitor monitor."),
    type: s.string("The Cronitor monitor type."),
    name: s.string("The human-readable monitor name."),
    schedules: s.array(
      "The cron expressions, interval expressions, or time schedules for this monitor.",
      s.string("A Cronitor schedule expression."),
    ),
    timezone: s.string("The timezone used to evaluate the monitor schedule."),
    assertions: s.array(
      "Assertions Cronitor evaluates for this monitor.",
      s.string("A Cronitor assertion expression."),
    ),
    notify: notifySchema,
    note: s.string("The note attached to the monitor."),
    platform: s.string("The platform associated with the monitor."),
    group: s.string("The group assigned to the monitor."),
    request: monitorRequestSchema,
    grace_seconds: s.integer("The grace period in seconds before Cronitor marks the monitor failed."),
    failure_tolerance: s.integer("The number of tolerated failures before Cronitor alerts."),
  },
  { description: "A monitor resource returned by Cronitor." },
);

const monitorMutationFields = {
  type: monitorTypeSchema,
  key: monitorKeySchema,
  name: s.nonEmptyString("The human-readable monitor name."),
  schedules: s.array(
    "The cron expressions, interval expressions, or time schedules for this monitor.",
    s.nonEmptyString("A Cronitor schedule expression."),
    {
      minItems: 1,
    },
  ),
  timezone: s.nonEmptyString("The timezone used to evaluate the monitor schedule."),
  assertions: s.array(
    "Assertions Cronitor evaluates for this monitor.",
    s.nonEmptyString("A Cronitor assertion expression."),
    {
      minItems: 1,
    },
  ),
  notify: notifySchema,
  note: s.string("The note attached to the monitor."),
  platform: s.nonEmptyString("The platform associated with the monitor."),
  group: s.nonEmptyString("The group assigned to the monitor."),
  request: monitorRequestSchema,
  grace_seconds: s.integer("The grace period in seconds before Cronitor marks the monitor failed."),
  failure_tolerance: s.integer("The number of tolerated failures before Cronitor alerts."),
};

const optionalMutationFields = [
  "name",
  "schedules",
  "timezone",
  "assertions",
  "notify",
  "note",
  "platform",
  "group",
  "request",
  "grace_seconds",
  "failure_tolerance",
];

export const cronitorActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_monitors",
    description: "List Cronitor monitors in the current account.",
    inputSchema: s.object({}, { description: "The input payload for listing Cronitor monitors." }),
    outputSchema: s.object(
      { monitors: s.array("The monitors returned by Cronitor.", monitorSchema) },
      { required: ["monitors"], description: "The response returned when listing Cronitor monitors." },
    ),
  }),
  defineProviderAction(service, {
    name: "get_monitor",
    description: "Get a Cronitor monitor by key.",
    inputSchema: s.object(
      { key: monitorKeySchema },
      { required: ["key"], description: "The input payload for getting a Cronitor monitor." },
    ),
    outputSchema: s.object(
      { monitor: monitorSchema },
      { required: ["monitor"], description: "The response returned when getting a Cronitor monitor." },
    ),
  }),
  defineProviderAction(service, {
    name: "create_monitor",
    description: "Create one Cronitor monitor.",
    inputSchema: s.object(monitorMutationFields, {
      optional: optionalMutationFields,
      description: "The input payload for creating a Cronitor monitor.",
    }),
    outputSchema: s.object(
      { monitor: monitorSchema },
      { required: ["monitor"], description: "The response returned when creating a Cronitor monitor." },
    ),
  }),
  defineProviderAction(service, {
    name: "update_monitor",
    description: "Update one Cronitor monitor by key.",
    inputSchema: s.object(monitorMutationFields, {
      optional: optionalMutationFields,
      description:
        "The input payload for updating a Cronitor monitor. Provide at least one update field in addition to key.",
    }),
    outputSchema: s.object(
      { monitor: monitorSchema },
      { required: ["monitor"], description: "The response returned when updating a Cronitor monitor." },
    ),
  }),
  defineProviderAction(service, {
    name: "delete_monitor",
    description: "Delete a Cronitor monitor by key.",
    inputSchema: s.object(
      { key: monitorKeySchema },
      { required: ["key"], description: "The input payload for deleting a Cronitor monitor." },
    ),
    outputSchema: s.object(
      {
        deleted: s.boolean("Whether the delete request completed successfully."),
        monitor: monitorSchema,
      },
      { required: ["deleted"], description: "The response returned when deleting a Cronitor monitor." },
    ),
  }),
];
