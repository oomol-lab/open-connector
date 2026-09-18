import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "mixpanel";

interface MixpanelActionSource {
  name: string;
  operationType: ActionDefinition["operationType"];
  description: string;
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
  followUpActions?: string[];
}

const looseObjectSchema = s.looseObject("Raw Mixpanel object.");
const idField = s.anyOf("Identifier accepted by the official Mixpanel API.", [
  s.nonEmptyString("String identifier."),
  s.integer("Numeric identifier."),
]);
const optionalProjectField = idField;
const optionalWorkspaceField = idField;
const dateField = (description: string): JsonSchema => s.date(description);
const stringListField = (description: string): JsonSchema => s.stringArray(description, { minItems: 1 });

const savedCohortSchema = s.looseObject("Saved cohort summary returned by Mixpanel.", {
  id: idField,
  name: s.string("Saved cohort name."),
  count: s.integer("Current cohort member count."),
  description: s.nullableString("Saved cohort description when Mixpanel returns one."),
  is_visible: s.boolean("Whether the saved cohort is visible in the Mixpanel UI."),
  created: s.nullableString("Creation timestamp returned by Mixpanel when available."),
});

const funnelSummarySchema = s.looseObject("Saved funnel summary returned by Mixpanel.", {
  funnel_id: idField,
  name: s.string("Saved funnel name."),
});

const numericResultsSchema = s.record(
  "Map of YYYY-MM-DD dates to numeric values returned by Mixpanel.",
  s.nullable(s.number("Numeric value.")),
);

const topEventSchema = s.object(
  {
    event: s.string("Event name returned by Mixpanel."),
    amount: s.number("Event count or computed value returned by Mixpanel."),
    percent_change: s.number("Percent change from the previous comparison window."),
  },
  { required: ["event", "amount", "percent_change"], description: "Single top-event item returned by Mixpanel." },
);

const activityEventSchema = s.looseObject("Single profile-activity event returned by Mixpanel.", {
  event: s.string("Event name returned in the profile activity feed."),
  properties: looseObjectSchema,
});

const profileSchema = s.looseObject("Profile object returned by Mixpanel.", {
  $distinct_id: s.string("Distinct ID for the profile."),
  $last_seen: s.string("Last seen timestamp for the profile."),
  $email: s.string("Email property returned for the profile when available."),
});

const exportEventSchema = s.looseObject("Single raw event line returned by the Mixpanel export API.", {
  event: s.string("Event name returned by the raw export."),
  properties: looseObjectSchema,
});

const projectInput = {
  project_id: optionalProjectField,
};

const workspaceInput = {
  workspace_id: optionalWorkspaceField,
};

const rawOutput = (description: string): JsonSchema =>
  s.object(
    {
      raw: looseObjectSchema,
    },
    { required: ["raw"], description },
  );

const actions: MixpanelActionSource[] = [
  {
    name: "list_saved_cohorts",
    operationType: "read",
    description: "List saved cohorts available in a Mixpanel project.",
    followUpActions: ["mixpanel.query_profiles"],
    inputSchema: s.object("The input payload for listing saved cohorts.", projectInput),
    outputSchema: s.object(
      {
        cohorts: s.array("Saved cohorts returned by Mixpanel.", savedCohortSchema),
        raw: s.array("Raw saved cohort objects returned by Mixpanel.", looseObjectSchema),
      },
      { required: ["cohorts", "raw"], description: "The saved cohort list returned by Mixpanel." },
    ),
  },
  {
    name: "list_funnels",
    operationType: "read",
    description: "List saved funnels available in a Mixpanel project.",
    followUpActions: ["mixpanel.query_funnel"],
    inputSchema: s.object("The input payload for listing saved funnels.", {
      ...projectInput,
      ...workspaceInput,
    }),
    outputSchema: s.object(
      {
        funnels: s.array("Saved funnels returned by Mixpanel.", funnelSummarySchema),
        raw: s.array("Raw saved funnel objects returned by Mixpanel.", looseObjectSchema),
      },
      { required: ["funnels", "raw"], description: "The saved funnel list returned by Mixpanel." },
    ),
  },
  {
    name: "query_funnel",
    operationType: "read",
    description: "Query a saved Mixpanel funnel report over a date range.",
    followUpActions: ["mixpanel.query_retention_report"],
    inputSchema: s.object(
      "The input payload for querying a saved Mixpanel funnel.",
      {
        ...projectInput,
        ...workspaceInput,
        funnel_id: idField,
        from_date: dateField("Start date for the funnel query."),
        to_date: dateField("End date for the funnel query."),
        length: s.integer("Maximum number of units each user has to complete the funnel.", { minimum: 1, maximum: 90 }),
        length_unit: s.stringEnum("Unit used by the length parameter.", ["second", "minute", "hour", "day"]),
        interval: s.positiveInteger("Number of days to include in each bucket."),
        unit: s.stringEnum("Alternate time unit for bucketing the funnel report.", ["day", "week", "month"]),
        on: s.nonEmptyString("Optional Mixpanel expression used to segment the funnel report."),
        where: s.nonEmptyString("Optional Mixpanel expression used to filter funnel events."),
        limit: s.integer("Maximum number of segmented property values to return.", { minimum: 1, maximum: 10000 }),
      },
      { required: ["funnel_id", "from_date", "to_date"] },
    ),
    outputSchema: rawOutput("The Mixpanel saved funnel response."),
  },
  {
    name: "query_retention_report",
    operationType: "read",
    description: "Query a Mixpanel retention report over a date range.",
    followUpActions: ["mixpanel.query_frequency_report"],
    inputSchema: s.object(
      "The input payload for querying a Mixpanel retention report.",
      {
        ...projectInput,
        ...workspaceInput,
        from_date: dateField("Start date for the retention query."),
        to_date: dateField("End date for the retention query."),
        retention_type: s.stringEnum("Type of retention analysis to run.", ["birth", "compounded"]),
        born_event: s.nonEmptyString("Initial event that defines the entry cohort for birth retention."),
        event: s.nonEmptyString("Target event to measure retention against."),
        born_where: s.nonEmptyString("Optional Mixpanel expression used to filter born_event."),
        where: s.nonEmptyString("Optional Mixpanel expression used to filter retained events."),
        interval: s.positiveInteger("Number of units per returned interval bucket."),
        interval_count: s.positiveInteger("Number of interval buckets to return."),
        unit: s.stringEnum("Interval unit used for the retention query.", ["day", "week", "month"]),
        unbounded_retention: s.boolean("Whether retention counts should accumulate from right to left."),
        on: s.nonEmptyString("Optional Mixpanel expression used to segment the retention report."),
        limit: s.positiveInteger("Maximum number of segmented property values to return."),
      },
      { required: ["from_date", "to_date"] },
    ),
    outputSchema: rawOutput("The Mixpanel retention report response."),
  },
  {
    name: "query_frequency_report",
    operationType: "read",
    description: "Query how frequently users perform an event in Mixpanel.",
    inputSchema: s.object(
      "The input payload for querying a Mixpanel frequency report.",
      {
        ...projectInput,
        ...workspaceInput,
        from_date: dateField("Start date for the frequency query."),
        to_date: dateField("End date for the frequency query."),
        unit: s.stringEnum("Overall time period to return event frequency for.", ["day", "week", "month"]),
        addiction_unit: s.stringEnum("Granularity used inside each frequency bucket.", ["hour", "day"]),
        event: s.nonEmptyString("Optional event name to measure frequency for."),
        where: s.nonEmptyString("Optional Mixpanel expression used to filter the event."),
        on: s.nonEmptyString("Optional Mixpanel expression used to segment the frequency report."),
        limit: s.positiveInteger("Maximum number of segmented property values to return."),
      },
      { required: ["from_date", "to_date", "unit", "addiction_unit"] },
    ),
    outputSchema: rawOutput("The Mixpanel frequency report response."),
  },
  {
    name: "query_numeric_sum",
    operationType: "read",
    description: "Sum a numeric expression for a Mixpanel event over time.",
    followUpActions: ["mixpanel.query_numeric_average"],
    inputSchema: s.object(
      "The input payload for querying a Mixpanel numeric sum report.",
      {
        ...projectInput,
        ...workspaceInput,
        event: s.nonEmptyString("Event name to aggregate."),
        from_date: dateField("Start date for the numeric sum query."),
        to_date: dateField("End date for the numeric sum query."),
        on: s.nonEmptyString("Numeric Mixpanel expression to sum per unit time."),
        unit: s.stringEnum("Time unit used for bucketing the numeric sum query.", ["hour", "day"]),
        where: s.nonEmptyString("Optional Mixpanel expression used to filter events before summing."),
      },
      { required: ["event", "from_date", "to_date", "on"] },
    ),
    outputSchema: s.object(
      {
        status: s.string("Status returned by Mixpanel."),
        computed_at: s.string("Timestamp when Mixpanel computed the numeric sum report."),
        results: numericResultsSchema,
        raw: looseObjectSchema,
      },
      { required: ["results", "raw"], description: "The Mixpanel numeric sum response." },
    ),
  },
  {
    name: "query_numeric_average",
    operationType: "read",
    description: "Average a numeric expression for a Mixpanel event over time.",
    followUpActions: ["mixpanel.query_top_events"],
    inputSchema: s.object(
      "The input payload for querying a Mixpanel numeric average report.",
      {
        ...projectInput,
        ...workspaceInput,
        event: s.nonEmptyString("Event name to aggregate."),
        from_date: dateField("Start date for the numeric average query."),
        to_date: dateField("End date for the numeric average query."),
        on: s.nonEmptyString("Numeric Mixpanel expression to average per unit time."),
        unit: s.stringEnum("Time unit used for bucketing the numeric average query.", ["hour", "day"]),
        where: s.nonEmptyString("Optional Mixpanel expression used to filter events before averaging."),
      },
      { required: ["event", "from_date", "to_date", "on"] },
    ),
    outputSchema: s.object(
      {
        status: s.string("Status returned by Mixpanel."),
        computed_at: s.string("Timestamp when Mixpanel computed the numeric average report."),
        results: numericResultsSchema,
        raw: looseObjectSchema,
      },
      { required: ["results", "raw"], description: "The Mixpanel numeric average response." },
    ),
  },
  {
    name: "query_top_events",
    operationType: "read",
    description: "Get today's top Mixpanel events with counts and percent change from yesterday.",
    inputSchema: s.object(
      "The input payload for querying Mixpanel top events.",
      {
        ...projectInput,
        ...workspaceInput,
        type: s.stringEnum("Analysis type used by the top-events query.", ["general", "unique", "average"]),
        limit: s.positiveInteger("Maximum number of top events to return."),
      },
      { required: ["type"] },
    ),
    outputSchema: s.object(
      {
        type: s.stringEnum("Analysis type returned by Mixpanel.", ["general", "unique", "average"]),
        events: s.array("Top events returned by Mixpanel.", topEventSchema),
        raw: looseObjectSchema,
      },
      { required: ["type", "events", "raw"], description: "The Mixpanel top-events response." },
    ),
  },
  {
    name: "query_segmentation_report",
    operationType: "read",
    description: "Query a Mixpanel segmentation report for one event over a date range.",
    followUpActions: ["mixpanel.export_events"],
    inputSchema: s.object(
      "The input payload for querying a Mixpanel segmentation report.",
      {
        ...projectInput,
        event: s.nonEmptyString("Event name to query in the segmentation report."),
        from_date: dateField("Start date for the segmentation report."),
        to_date: dateField("End date for the segmentation report."),
        on: s.nonEmptyString("Optional Mixpanel expression used to group or break down the report."),
        unit: s.nonEmptyString("Optional interval unit accepted by Mixpanel, such as day, hour, or month."),
        type: s.nonEmptyString("Optional measurement type accepted by Mixpanel, such as general or unique."),
      },
      { required: ["event", "from_date", "to_date"] },
    ),
    outputSchema: rawOutput("The Mixpanel segmentation report response."),
  },
  {
    name: "query_saved_report",
    operationType: "read",
    description: "Query a saved Mixpanel report by bookmark ID.",
    followUpActions: ["mixpanel.export_events"],
    inputSchema: s.object(
      "The input payload for querying a saved Mixpanel report.",
      {
        ...projectInput,
        ...workspaceInput,
        bookmark_id: idField,
      },
      { required: ["bookmark_id"] },
    ),
    outputSchema: rawOutput("The Mixpanel saved report response."),
  },
  {
    name: "query_profiles",
    operationType: "read",
    description: "Query Mixpanel profiles with optional filters, paging, and selected properties.",
    followUpActions: ["mixpanel.profile_event_activity"],
    inputSchema: s.object("The input payload for querying Mixpanel profiles.", {
      ...projectInput,
      ...workspaceInput,
      distinct_ids: stringListField("Optional distinct IDs to filter the profile query."),
      where: s.nonEmptyString("Optional Mixpanel where expression used to filter profiles."),
      output_properties: stringListField("Optional profile properties to include in the response."),
      session_id: s.nonEmptyString("Pagination session ID returned by a previous Mixpanel profile query."),
      page: s.nonNegativeInteger("Zero-based page number used together with session_id when paginating."),
    }),
    outputSchema: s.object(
      {
        page: s.integer("Current page number returned by Mixpanel."),
        page_size: s.integer("Number of profiles returned in the current page."),
        session_id: s.string("Pagination session ID returned by Mixpanel for subsequent pages."),
        total: s.integer("Total number of matching profiles."),
        results: s.array("Profiles returned by the Mixpanel query.", profileSchema),
        raw: looseObjectSchema,
      },
      { required: ["results", "raw"], description: "The Mixpanel profile query response." },
    ),
  },
  {
    name: "profile_event_activity",
    operationType: "read",
    description: "Get event activity for one or more Mixpanel profiles over a date range.",
    inputSchema: s.object(
      "The input payload for querying Mixpanel profile event activity.",
      {
        ...projectInput,
        ...workspaceInput,
        distinct_ids: stringListField("Distinct IDs to fetch activity for."),
        from_date: dateField("Start date for the activity query."),
        to_date: dateField("End date for the activity query."),
      },
      { required: ["distinct_ids", "from_date", "to_date"] },
    ),
    outputSchema: s.object(
      {
        status: s.string("Status returned by Mixpanel."),
        events: s.array("Activity-feed events returned by Mixpanel.", activityEventSchema),
        raw: looseObjectSchema,
      },
      { required: ["events", "raw"], description: "The Mixpanel profile activity response." },
    ),
  },
  {
    name: "export_events",
    operationType: "write",
    description: "Export raw Mixpanel events for a project and date range.",
    inputSchema: s.object(
      "The input payload for exporting raw Mixpanel events.",
      {
        ...projectInput,
        from_date: dateField("Start date for the raw event export."),
        to_date: dateField("End date for the raw event export."),
        event: stringListField("Optional event names to include in the raw event export."),
        where: s.nonEmptyString("Optional Mixpanel where expression used to filter exported events."),
      },
      { required: ["from_date", "to_date"] },
    ),
    outputSchema: s.object(
      {
        jsonl: s.string("Raw JSONL response body returned by the Mixpanel export API."),
        event_count: s.integer("Number of JSON event lines parsed from the export response."),
        events: s.array("Parsed raw events returned by the export.", exportEventSchema),
      },
      { required: ["jsonl", "event_count", "events"], description: "The Mixpanel raw event export response." },
    ),
  },
];

export const mixpanelActions: ActionDefinition[] = actions.map((action) =>
  defineProviderAction(service, {
    name: action.name,
    operationType: action.operationType,
    description: action.description,
    requiredScopes: [],
    inputSchema: action.inputSchema,
    outputSchema: action.outputSchema,
    followUpActions: action.followUpActions,
  }),
);
