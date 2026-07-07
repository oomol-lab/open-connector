import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "amplitude";

const dataResidencyField = s.stringEnum("The Amplitude data residency region.", ["default", "eu"]);
const yyyymmddField = s.string("A date formatted as YYYYMMDD.", {
  minLength: 8,
  maxLength: 8,
});
const looseRecordSchema = s.looseObject("Provider-defined JSON object fields.");
const eventQuerySchema = s.looseRequiredObject(
  "An Amplitude event query object.",
  {
    event_type: s.string("The Amplitude event type to query.", {
      minLength: 1,
    }),
    filters: s.array("Optional event or user property filters.", looseRecordSchema),
    group_by: s.array("Optional event or user properties to group by.", looseRecordSchema),
  },
  { optional: ["filters", "group_by"] },
);
const segmentDefinitionSchema = s.looseObject("An Amplitude segment definition.", {
  prop: s.string("The Amplitude user property or cohort property name."),
  op: s.string("The segment comparison operator."),
  values: s.array("The segment values to match.", s.string("A segment value.")),
  type: s.string("The optional segment type, such as event."),
  event_type: s.string("The event type used by a who-performed segment."),
});
const rawResponseSchema = s.unknown("The raw Amplitude API response.");
const eventSchema = s.looseObject("An Amplitude event summary.", {
  value: s.string("The raw Amplitude event name."),
  display: s.string("The Amplitude display name for the event."),
  totals: s.number("The total event count for the current week."),
  hidden: s.boolean("Whether the event is hidden."),
  deleted: s.boolean("Whether the event is deleted."),
  non_active: s.boolean("Whether the event is marked inactive."),
  flow_hidden: s.boolean("Whether the event is hidden from Pathfinder surfaces."),
});
const userMatchSchema = s.looseObject("A matching Amplitude user.", {
  amplitude_id: s.integer("The Amplitude ID for the matched user."),
  user_id: s.string("The user ID for the matched user."),
});
const userDataSchema = s.looseObject("Amplitude user summary fields.", {
  user_id: s.string("The Amplitude user ID."),
  canonical_amplitude_id: s.integer("The canonical Amplitude ID."),
  num_events: s.integer("The total number of events for the user."),
  num_sessions: s.integer("The total number of sessions for the user."),
  first_used: s.string("The first date the user was seen."),
  last_used: s.string("The latest date the user was seen."),
});
const userActivityEventSchema = s.looseObject("An Amplitude user activity event.", {
  event_type: s.string("The Amplitude event type."),
  event_time: s.string("The event timestamp."),
  event_id: s.integer("The Amplitude event ID."),
  user_id: s.string("The Amplitude user ID."),
  amplitude_id: s.integer("The Amplitude ID."),
});

const listEventsInputSchema = s.object(
  "Input for listing Amplitude events in a project.",
  {
    dataResidency: dataResidencyField,
  },
  { optional: ["dataResidency"] },
);

const listEventsOutputSchema = s.object("The normalized Amplitude events list response.", {
  events: s.array("Amplitude events returned by the Dashboard REST API.", eventSchema),
  raw: rawResponseSchema,
});

const getEventSegmentationInputSchema = s.object(
  "Input for querying Amplitude event segmentation metrics.",
  {
    event: eventQuerySchema,
    secondEvent: eventQuerySchema,
    start: yyyymmddField,
    end: yyyymmddField,
    metric: s.stringEnum("The Amplitude segmentation metric.", [
      "uniques",
      "totals",
      "pct_dau",
      "average",
      "histogram",
      "sums",
      "value_avg",
      "formula",
    ]),
    userType: s.stringEnum("The Amplitude user type filter.", ["any", "active"]),
    interval: s.integer("The Amplitude interval value, such as 1, 7, or 30."),
    segments: s.array("Amplitude segment definitions.", segmentDefinitionSchema),
    groupBy: s.string("The Amplitude property name to group by.", {
      minLength: 1,
    }),
    secondGroupBy: s.string("The second Amplitude property name to group by.", {
      minLength: 1,
    }),
    limit: s.positiveInteger("The maximum number of group-by values to return.", {
      maximum: 1000,
    }),
    formula: s.string("The Amplitude custom formula expression.", {
      minLength: 1,
    }),
    rollingWindow: s.positiveInteger("The rolling window size."),
    rollingAverage: s.positiveInteger("The rolling average size."),
    dataResidency: dataResidencyField,
  },
  {
    optional: [
      "secondEvent",
      "metric",
      "userType",
      "interval",
      "segments",
      "groupBy",
      "secondGroupBy",
      "limit",
      "formula",
      "rollingWindow",
      "rollingAverage",
      "dataResidency",
    ],
  },
);

const getEventSegmentationOutputSchema = s.object("The normalized Amplitude event segmentation response.", {
  result: s.looseObject("Amplitude event segmentation result data.", {
    series: s.array("Metric series returned by Amplitude.", s.array("Metric values.", s.number("A metric value."))),
    seriesLabels: s.array("Labels for each metric series.", s.string("A series label.")),
    seriesCollapsed: s.array("Collapsed metric values returned by Amplitude.", s.unknown("A collapsed metric value.")),
    xValues: s.array("Dates included in the result.", s.string("A result date.")),
  }),
  raw: rawResponseSchema,
});

const searchUserInputSchema = s.object(
  "Input for searching an Amplitude user.",
  {
    user: s.string("The Amplitude ID, device ID, user ID, or user ID prefix to search.", {
      minLength: 1,
    }),
    dataResidency: dataResidencyField,
  },
  { optional: ["dataResidency"] },
);

const searchUserOutputSchema = s.object(
  "The normalized Amplitude user search response.",
  {
    matches: s.array("Amplitude user matches.", userMatchSchema),
    type: s.string("The match type returned by Amplitude."),
    raw: rawResponseSchema,
  },
  { optional: ["type"] },
);

const getUserActivityInputSchema = s.object(
  "Input for retrieving Amplitude user activity.",
  {
    user: s.string("The Amplitude ID of the user.", { minLength: 1 }),
    offset: s.nonNegativeInteger("The zero-indexed offset from the most recent event."),
    limit: s.positiveInteger("The number of events to return.", {
      maximum: 1000,
    }),
    direction: s.stringEnum("The event direction to return.", ["earliest", "latest"]),
    dataResidency: dataResidencyField,
  },
  { optional: ["offset", "limit", "direction", "dataResidency"] },
);

const getUserActivityOutputSchema = s.object("The normalized Amplitude user activity response.", {
  userData: userDataSchema,
  events: s.array("Amplitude user activity events.", userActivityEventSchema),
  raw: rawResponseSchema,
});

export type AmplitudeActionName = "list_events" | "get_event_segmentation" | "search_user" | "get_user_activity";

export const amplitudeActions: readonly ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_events",
    description: "List visible Amplitude events with current-week totals and display metadata.",
    requiredScopes: [],
    inputSchema: listEventsInputSchema,
    outputSchema: listEventsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_event_segmentation",
    description: "Get Amplitude event segmentation metrics for one or two event queries.",
    requiredScopes: [],
    inputSchema: getEventSegmentationInputSchema,
    outputSchema: getEventSegmentationOutputSchema,
  }),
  defineProviderAction(service, {
    name: "search_user",
    description: "Search for an Amplitude user by Amplitude ID, device ID, user ID, or prefix.",
    requiredScopes: [],
    inputSchema: searchUserInputSchema,
    outputSchema: searchUserOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_user_activity",
    description: "Get an Amplitude user summary and recent or earliest activity events.",
    requiredScopes: [],
    inputSchema: getUserActivityInputSchema,
    outputSchema: getUserActivityOutputSchema,
  }),
];
