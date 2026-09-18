import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "uptimerobot";

const numericValueSchema = s.union([s.integer("An integer numeric value."), s.string("A string numeric value.")], {
  description: "A numeric value returned by the UptimeRobot API.",
});
const monitorIdSchema = s.positiveInteger("The numeric ID of the UptimeRobot monitor.");
const alertContactIdSchema = s.positiveInteger("The numeric ID of the UptimeRobot alert contact.");
const monitorTypeCodeSchema = s.integer(
  "The UptimeRobot monitor type code. Known values are 1=HTTP(s), 2=Keyword, 3=Ping, 4=Port, 5=Heartbeat, and 6=SSL.",
  { minimum: 1, maximum: 6 },
);
const keywordTypeSchema = s.union([s.literal(1), s.literal(2)], {
  description: "The keyword matching mode. Use 1 when the keyword must exist, or 2 when it must not exist.",
});
const paginationSchema = s.looseObject("The pagination summary returned by UptimeRobot.", {
  offset: numericValueSchema,
  limit: numericValueSchema,
  total: numericValueSchema,
});
const alertContactSchema = s.looseObject("An alert contact returned by the UptimeRobot API.", {
  id: numericValueSchema,
  friendly_name: s.string("The friendly name of the alert contact."),
  type: numericValueSchema,
  status: numericValueSchema,
  value: s.string("The destination value configured for the alert contact."),
});
const monitorLogSchema = s.looseObject("A monitor log entry returned by UptimeRobot.", {
  type: numericValueSchema,
  datetime: numericValueSchema,
  duration: numericValueSchema,
  reason: s.looseObject("The nested reason object returned by UptimeRobot, when present."),
});
const monitorSchema = s.looseObject("A monitor returned by the UptimeRobot API.", {
  id: numericValueSchema,
  friendly_name: s.string("The friendly name configured for the monitor."),
  url: s.string("The monitored URL, hostname, or IP address."),
  type: numericValueSchema,
  status: numericValueSchema,
  sub_type: numericValueSchema,
  interval: numericValueSchema,
  timeout: numericValueSchema,
  keyword_type: numericValueSchema,
  keyword_value: s.string("The keyword value configured for keyword monitors, when present."),
  http_username: s.string("The HTTP authentication username configured for the monitor, when present."),
  http_password: s.string("The HTTP authentication password configured for the monitor, when present."),
  alert_contacts: s.array("The alert contacts returned for the monitor, when requested.", alertContactSchema),
  logs: s.array("The monitor logs returned by UptimeRobot, when requested.", monitorLogSchema),
  create_datetime: numericValueSchema,
});
const accountSchema = s.looseObject("The account details returned by the UptimeRobot API.", {
  email: s.string("The email address of the connected UptimeRobot account."),
  user_id: numericValueSchema,
  monitor_limit: numericValueSchema,
  monitor_interval: numericValueSchema,
  up_monitors: numericValueSchema,
  down_monitors: numericValueSchema,
  paused_monitors: numericValueSchema,
  firstname: s.string("The first name of the account owner, when present."),
  registered_at: s.string("The account registration timestamp returned by UptimeRobot, when present."),
});
const alertContactAssignmentSchema = s.object("A structured alert contact assignment.", {
  id: alertContactIdSchema,
  threshold: s.nonNegativeInteger("How many minutes UptimeRobot should wait before notifying this alert contact."),
  recurrence: s.nonNegativeInteger("How many times UptimeRobot should repeat the notification for this alert contact."),
});
const alertContactsInputSchema = s.union(
  [
    s.nonEmptyString("The official alert_contacts string, such as 12345_0_0-67890_5_2."),
    s.array(
      "A list of alert contacts to encode into the official alert_contacts parameter.",
      s.union([alertContactIdSchema, alertContactAssignmentSchema]),
      { minItems: 1 },
    ),
  ],
  { description: "Either the official alert_contacts string or a list of structured alert contact assignments." },
);
const createOrUpdateMonitorFields: Record<string, JsonSchema> = {
  friendly_name: s.nonEmptyString("The friendly name of the monitor."),
  url: s.nonEmptyString("The URL, hostname, or IP address that UptimeRobot should monitor."),
  type: monitorTypeCodeSchema,
  sub_type: s.positiveInteger(
    "The subtype code used for port monitors. Known values are 1=HTTP, 2=HTTPS, 3=FTP, 4=SMTP, 5=POP3, 6=IMAP, and 99=Custom.",
  ),
  port: s.integer("The destination port used for custom port monitors.", { minimum: 1, maximum: 65535 }),
  interval: s.positiveInteger("The monitor interval in seconds accepted by UptimeRobot."),
  timeout: s.integer("The timeout in seconds before UptimeRobot treats the check as failed.", {
    minimum: 1,
    maximum: 60,
  }),
  keyword_type: keywordTypeSchema,
  keyword_value: s.nonEmptyString("The keyword value used by keyword monitors."),
  http_username: s.nonEmptyString("The HTTP authentication username used by the monitor."),
  http_password: s.nonEmptyString("The HTTP authentication password used by the monitor."),
  ssl: s.boolean("Whether SSL validation should stay enabled for HTTPS-based monitors."),
  alert_contacts: alertContactsInputSchema,
};

export const uptimerobotActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_account_details",
    operationType: "read",
    description: "Get account-level monitor usage and profile details from the connected UptimeRobot account.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for getting UptimeRobot account details.", {}),
    outputSchema: s.object("The UptimeRobot account details lookup result.", { account: accountSchema }),
  }),
  defineProviderAction(service, {
    name: "list_alert_contacts",
    operationType: "read",
    description: "List the alert contacts configured in the connected UptimeRobot account.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for listing UptimeRobot alert contacts.", {}),
    outputSchema: s.object("The alert contact list returned by UptimeRobot.", {
      alert_contacts: s.array("The alert contacts returned by UptimeRobot.", alertContactSchema),
      pagination: s.nullable(paginationSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_monitors",
    operationType: "read",
    description: "List monitors available in the connected UptimeRobot account.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for listing monitors from the UptimeRobot account.",
      {
        offset: s.nonNegativeInteger("The zero-based pagination offset to request from UptimeRobot."),
        limit: s.integer("The maximum number of monitors to return from UptimeRobot.", { minimum: 1, maximum: 50 }),
        search: s.nonEmptyString("A search term applied to monitor friendly names, URLs, and types."),
        sort: s.stringEnum("The field used by UptimeRobot to sort the monitor list.", [
          "friendly_name",
          "url",
          "status",
          "type",
        ]),
        monitor_ids: s.array("A list of monitor IDs encoded into the official monitors filter.", monitorIdSchema, {
          minItems: 1,
        }),
        types: s.array("A list of monitor type codes encoded into the official types filter.", monitorTypeCodeSchema, {
          minItems: 1,
        }),
        statuses: s.array(
          "A list of monitor status codes encoded into the official statuses filter.",
          s.nonNegativeInteger("A UptimeRobot monitor status code."),
          { minItems: 1 },
        ),
        logs: s.boolean("Whether monitor logs should be included in each monitor result."),
        alert_contacts: s.boolean("Whether alert contacts should be included in each monitor result."),
      },
      {
        optional: ["offset", "limit", "search", "sort", "monitor_ids", "types", "statuses", "logs", "alert_contacts"],
      },
    ),
    outputSchema: s.object("The UptimeRobot monitor list.", {
      monitors: s.array("The monitors returned by UptimeRobot.", monitorSchema),
      pagination: s.nullable(paginationSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_monitor",
    operationType: "read",
    description: "Get the full configuration and current status of a single UptimeRobot monitor.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for fetching a single UptimeRobot monitor.",
      {
        monitor_id: monitorIdSchema,
        logs: s.boolean("Whether monitor logs should be included in the UptimeRobot response."),
        alert_contacts: s.boolean("Whether alert contacts should be included in the UptimeRobot response."),
      },
      { optional: ["logs", "alert_contacts"] },
    ),
    outputSchema: s.object("The single-monitor lookup result returned by UptimeRobot.", { monitor: monitorSchema }),
  }),
  defineProviderAction(service, {
    name: "create_monitor",
    operationType: "write",
    description: "Create a new monitor in the connected UptimeRobot account.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for creating a UptimeRobot monitor.", createOrUpdateMonitorFields, {
      optional: [
        "sub_type",
        "port",
        "interval",
        "timeout",
        "keyword_type",
        "keyword_value",
        "http_username",
        "http_password",
        "ssl",
        "alert_contacts",
      ],
    }),
    outputSchema: s.object("The newly created UptimeRobot monitor.", { monitor: monitorSchema }),
  }),
  defineProviderAction(service, {
    name: "update_monitor",
    operationType: "write",
    description: "Update an existing monitor in the connected UptimeRobot account.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for updating an existing UptimeRobot monitor.",
      { monitor_id: monitorIdSchema, ...createOrUpdateMonitorFields },
      { optional: Object.keys(createOrUpdateMonitorFields) },
    ),
    outputSchema: s.object("The updated UptimeRobot monitor.", { monitor: monitorSchema }),
  }),
  defineProviderAction(service, {
    name: "delete_monitor",
    operationType: "destructive",
    description: "Delete a monitor from the connected UptimeRobot account.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for deleting a UptimeRobot monitor.", { monitor_id: monitorIdSchema }),
    outputSchema: s.object("The monitor deletion acknowledgement returned by the UptimeRobot provider.", {
      deleted: s.boolean("Whether the monitor was deleted successfully."),
    }),
  }),
];
