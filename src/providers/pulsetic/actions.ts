import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "pulsetic" as const;

const monitorIdSchema = s.integer("The unique Pulsetic monitor ID.", { minimum: 1 });
const pageSchema = s.integer("The page number to return.", { minimum: 1 });
const perPageSchema = s.integer("The number of records to return per page.", { minimum: 1 });
const dateTimeSchema = s.nonEmptyString("The start or end of the query window as a date-time accepted by Pulsetic.");
const monitorSchema = s.looseObject("A monitor returned by Pulsetic.", {
  id: s.integer("The unique Pulsetic monitor ID."),
  name: s.string("The monitor name."),
  url: s.string("The monitored URL."),
  status: s.string("The current monitor status."),
});
const historyRecordSchema = s.looseObject("A monitor history record returned by Pulsetic.");

const paginationFields = {
  page: s.optional(pageSchema),
  perPage: s.optional(perPageSchema),
};

const monitorTargetFields = {
  monitorId: monitorIdSchema,
};

const timeRangeFields = {
  ...monitorTargetFields,
  startTime: dateTimeSchema,
  endTime: dateTimeSchema,
};

const listMonitorsAction = defineProviderAction(service, {
  name: "list_monitors",
  operationType: "read",
  description: "List Pulsetic monitors with optional pagination.",
  inputSchema: s.object("The input payload for listing Pulsetic monitors.", paginationFields),
  outputSchema: s.object("The response returned when listing Pulsetic monitors.", {
    monitors: s.array("The Pulsetic monitors on the requested page.", monitorSchema),
  }),
});

const getMonitorAction = defineProviderAction(service, {
  name: "get_monitor",
  operationType: "read",
  description: "Get one Pulsetic monitor by ID.",
  inputSchema: s.object("The input payload for getting one Pulsetic monitor.", monitorTargetFields),
  outputSchema: s.object("The response returned when getting one Pulsetic monitor.", {
    monitor: monitorSchema,
  }),
});

const listSnapshotsAction = defineProviderAction(service, {
  name: "list_monitor_snapshots",
  operationType: "read",
  description: "List hourly Pulsetic snapshots for a monitor and time range.",
  inputSchema: s.object(
    "The input payload for listing Pulsetic monitor snapshots.",
    {
      ...timeRangeFields,
      ...paginationFields,
    },
    { optional: ["page", "perPage"] },
  ),
  outputSchema: s.object("The response returned when listing monitor snapshots.", {
    snapshots: s.array("The monitor snapshots returned by Pulsetic.", historyRecordSchema),
  }),
});

const listChecksAction = defineProviderAction(service, {
  name: "list_monitor_checks",
  operationType: "read",
  description: "List Pulsetic checks for a monitor and time range.",
  inputSchema: s.object(
    "The input payload for listing Pulsetic monitor checks.",
    {
      ...timeRangeFields,
      nodes: s.optional(
        s.stringArray("The Pulsetic node slugs used to filter checks.", {
          minItems: 1,
          itemDescription: "A Pulsetic node slug.",
        }),
      ),
      responseCodes: s.optional(
        s.array(
          "The HTTP response codes used to filter checks.",
          s.integer("An HTTP response code.", { minimum: 100, maximum: 599 }),
          { minItems: 1 },
        ),
      ),
    },
    { optional: ["nodes", "responseCodes"] },
  ),
  outputSchema: s.object("The response returned when listing monitor checks.", {
    checks: s.array("The monitor checks returned by Pulsetic.", historyRecordSchema),
  }),
});

const listEventsAction = defineProviderAction(service, {
  name: "list_monitor_events",
  operationType: "read",
  description: "List Pulsetic online and offline events for a monitor and time range.",
  inputSchema: s.object(
    "The input payload for listing Pulsetic monitor events.",
    {
      ...timeRangeFields,
      eventType: s.optional(s.stringEnum("The monitor event type used to filter results.", ["Online", "Offline"])),
    },
    { optional: ["eventType"] },
  ),
  outputSchema: s.object("The response returned when listing monitor events.", {
    events: s.array("The monitor events returned by Pulsetic.", historyRecordSchema),
  }),
});

const getStatsAction = defineProviderAction(service, {
  name: "get_monitor_stats",
  operationType: "read",
  description: "Get Pulsetic uptime, downtime, and response-time statistics for a monitor.",
  inputSchema: s.object("The input payload for getting Pulsetic monitor statistics.", monitorTargetFields),
  outputSchema: s.object("The response returned when getting monitor statistics.", {
    stats: s.looseObject("The 1-, 7-, 30-, and 90-day statistics returned by Pulsetic."),
  }),
});

const getDowntimeAction = defineProviderAction(service, {
  name: "get_monitor_downtime",
  operationType: "read",
  description: "Get total Pulsetic downtime for a monitor over an optional lookback window.",
  inputSchema: s.object(
    "The input payload for getting Pulsetic monitor downtime.",
    {
      ...monitorTargetFields,
      seconds: s.optional(
        s.number("The lookback window in seconds used to calculate downtime.", {
          exclusiveMinimum: 0,
        }),
      ),
    },
    { optional: ["seconds"] },
  ),
  outputSchema: s.object("The response returned when getting monitor downtime.", {
    downtimeSeconds: s.number("The total downtime in seconds reported by Pulsetic."),
  }),
});

export const pulseticActions: ActionDefinition[] = [
  listMonitorsAction,
  getMonitorAction,
  listSnapshotsAction,
  listChecksAction,
  listEventsAction,
  getStatsAction,
  getDowntimeAction,
];
