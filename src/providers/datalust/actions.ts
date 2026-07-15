import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "datalust";
const readPermissions = ["Read"];
const ingestPermissions = ["Read", "Ingest"];
const writePermissions = ["Read", "Write"];

const eventPropertySchema = s.object(
  {
    name: s.string("The event property name."),
    value: s.unknown("The event property value."),
  },
  { description: "A property attached to a Seq event." },
);

const eventSchema = s.object(
  {
    id: s.string("The Seq event identifier."),
    timestamp: s.string("The ISO 8601 timestamp at which the event occurred."),
    start: s.nullableString("The ISO 8601 span start timestamp when the event is a span."),
    properties: s.array(eventPropertySchema, { description: "The properties attached to the event." }),
    eventType: s.nullableString("The Seq event type identifier when present."),
    level: s.nullableString("The event level when present."),
    exception: s.nullableString("The exception or stack trace when present."),
    renderedMessage: s.nullableString("The rendered event message when requested and available."),
    traceId: s.nullableString("The trace identifier when present."),
    spanId: s.nullableString("The span identifier when present."),
    parentId: s.nullableString("The parent span identifier when present."),
    spanKind: s.nullableString("The span kind when present."),
    raw: s.looseObject("The raw Seq event payload."),
  },
  { description: "A normalized Seq event." },
);

const searchEventsInputSchema = s.actionInput(
  {
    filter: s.nonEmptyString("A strict Seq filter expression."),
    signal: s.nonEmptyString("A Seq signal identifier or signal expression."),
    count: s.positiveInteger("The maximum number of events to return."),
    startAtId: s.nonEmptyString("An event identifier at which to start searching inclusively."),
    afterId: s.nonEmptyString("An event identifier after which to continue searching exclusively."),
    render: s.boolean("Whether Seq should include rendered event messages."),
    fromDateUtc: s.dateTime("The earliest inclusive event timestamp."),
    toDateUtc: s.dateTime("The latest exclusive event timestamp."),
    variables: s.record("Values for free variables used by the filter.", s.unknown("A variable value.")),
  },
  [],
  "Input parameters for searching a page of Seq events.",
);

const searchEventsOutputSchema = s.actionOutput(
  {
    events: s.array(eventSchema, { description: "The matching Seq events." }),
    statistics: s.looseObject("Seq statistics for the event search."),
    raw: s.looseObject("The raw Seq event search payload."),
  },
  "A page of Seq event search results.",
);

const getEventInputSchema = s.actionInput(
  {
    eventId: s.nonEmptyString("The Seq event identifier."),
    render: s.boolean("Whether Seq should include the rendered event message."),
  },
  ["eventId"],
  "Input parameters for reading one Seq event.",
);

const executeQueryInputSchema = s.actionInput(
  {
    query: s.nonEmptyString("The Seq SQL-style query to execute."),
    rangeStartUtc: s.dateTime("The earliest inclusive timestamp for the query."),
    rangeEndUtc: s.dateTime("The latest exclusive timestamp for the query."),
    signal: s.nonEmptyString("A Seq signal identifier or signal expression."),
    timeoutMs: s.positiveInteger("The server-side query timeout in milliseconds."),
    variables: s.record("Values for free variables used by the query.", s.unknown("A variable value.")),
  },
  ["query"],
  "Input parameters for executing a Seq SQL-style query.",
);

const executeQueryOutputSchema = s.actionOutput(
  {
    columns: s.stringArray("The result column names.", { itemDescription: "A result column name." }),
    rows: s.array(s.array(s.unknown("A result cell value."), { description: "A result row." }), {
      description: "The flat result rows when returned by Seq.",
    }),
    slices: s.array(s.unknown("A time slice."), { description: "The hierarchical time slices when returned by Seq." }),
    series: s.array(s.unknown("A time series."), { description: "The time series when returned by Seq." }),
    variables: s.record("Variables returned with the query result.", s.unknown("A variable value.")),
    error: s.nullableString("The query error when Seq returns a non-throwing query failure."),
    reasons: s.stringArray("Detailed query error reasons.", { itemDescription: "A query error reason." }),
    suggestion: s.nullableString("A corrected query suggested by Seq when available."),
    statistics: s.looseObject("Seq query execution statistics."),
    raw: s.looseObject("The raw Seq query payload."),
  },
  "A structured Seq query result.",
);

const clefEventTypeSchema = s.anyOf("An implementation-specific CLEF event type.", [
  s.string("A string or hexadecimal CLEF event type."),
  s.number("A numeric CLEF event type."),
]);

const ingestEventInputSchema = s.actionInput(
  {
    timestamp: s.dateTime("The ISO 8601 timestamp at which the event occurred."),
    message: s.string("A fully rendered event message."),
    messageTemplate: s.string("A message template rendered with event properties."),
    level: s.string("The event level, such as Information, Warning, or Error."),
    exception: s.string("An exception or stack trace attached to the event."),
    eventType: clefEventTypeSchema,
    properties: s.looseObject("Additional top-level CLEF event properties; double an initial @ to escape it."),
  },
  ["timestamp"],
  "Input parameters for ingesting one event into Seq using CLEF.",
);

const ingestEventOutputSchema = s.actionOutput(
  {
    accepted: s.boolean("Whether Seq accepted the event request."),
    status: s.integer("The HTTP status returned by Seq."),
  },
  "The result of ingesting one event into Seq.",
);

const ingestEventsInputSchema = s.actionInput(
  {
    events: s.array(ingestEventInputSchema, {
      description: "The events to ingest as one newline-delimited CLEF batch.",
      minItems: 1,
    }),
  },
  ["events"],
  "Input parameters for ingesting a batch of CLEF events.",
);

const ingestEventsOutputSchema = s.actionOutput(
  {
    accepted: s.boolean("Whether Seq accepted the event batch request."),
    status: s.integer("The HTTP status returned by Seq."),
    eventCount: s.integer("The number of events submitted in the accepted batch."),
  },
  "The result of ingesting a batch of events into Seq.",
);

const signalFilterInputSchema = s.object(
  {
    filter: s.nonEmptyString("The strict Seq filter expression."),
    description: s.nullableString("The human-readable filter description, or null to clear it."),
    descriptionIsExcluded: s.boolean("Whether the description represents events excluded by the filter."),
    filterNonStrict: s.nullableString("The original non-strict filter text shown for editing, or null to clear it."),
  },
  { required: ["filter"], description: "A filter included in a Seq signal." },
);

const signalColumnInputSchema = s.requiredObject("A column displayed when a Seq signal is selected.", {
  expression: s.nonEmptyString("The Seq expression displayed in the column."),
});

const signalWriteProperties = {
  title: s.nonEmptyString("The human-readable signal title."),
  description: s.nullableString("The signal description, or null to clear it."),
  filters: s.array(signalFilterInputSchema, { description: "The filters combined by the signal." }),
  columns: s.array(signalColumnInputSchema, { description: "The columns displayed for the signal." }),
  isProtected: s.boolean("Whether modifying the signal requires Project permission."),
  isIndexSuppressed: s.boolean("Whether the signal should have no backing index."),
  grouping: s.stringEnum("How the signal is grouped in the Seq user interface.", ["Inferred", "Explicit", "None"]),
  explicitGroupName: s.nullableString("The explicit signal group name, or null when explicit grouping is not used."),
  ownerId: s.nullable(s.nonEmptyString("The owning Seq user identifier, or null to make the signal shared.")),
};

const createSignalInputSchema = s.actionInput(
  signalWriteProperties,
  ["title"],
  "Input parameters for creating a Seq signal.",
);

const updateSignalInputSchema = s.actionInput(
  { signalId: s.nonEmptyString("The Seq signal identifier."), ...signalWriteProperties },
  ["signalId"],
  "Input parameters for updating a Seq signal while preserving unspecified fields.",
);

const signalSchema = s.actionOutput(
  {
    id: s.string("The Seq signal identifier."),
    title: s.string("The human-readable signal title."),
    description: s.nullableString("The signal description when present."),
    filters: s.array(s.looseObject("A Seq signal filter."), { description: "The filters combined by the signal." }),
    columns: s.array(s.looseObject("A Seq signal column."), { description: "The columns displayed for the signal." }),
    isProtected: s.boolean("Whether modifying the signal requires Project permission."),
    isIndexSuppressed: s.boolean("Whether the signal has no backing index."),
    grouping: s.unknown("The grouping mode returned by Seq."),
    explicitGroupName: s.nullableString("The explicit signal group name when present."),
    ownerId: s.nullableString("The owning Seq user identifier, or null for a shared signal."),
    raw: s.looseObject("The raw Seq signal payload."),
  },
  "A normalized Seq signal.",
);

const getSignalOutputSchema = s.actionOutput({ signal: signalSchema }, "A Seq signal detail response.");

const listSignalsInputSchema = s.actionInput(
  {
    ownerId: s.nonEmptyString("Only return signals owned by this Seq user identifier."),
    shared: s.boolean("Whether to include shared signals."),
    partial: s.boolean("Whether Seq should return partial signal details."),
  },
  [],
  "Input parameters for listing Seq signals.",
);

const listSignalsOutputSchema = s.actionOutput(
  {
    signals: s.array(signalSchema, { description: "The matching Seq signals." }),
    raw: s.array(s.looseObject("A raw Seq signal."), { description: "The raw Seq signal list payload." }),
  },
  "A Seq signal list response.",
);

const savedQuerySchema = s.actionOutput(
  {
    id: s.string("The Seq saved query identifier."),
    title: s.string("The human-readable saved query title."),
    description: s.nullableString("The saved query description when present."),
    sql: s.string("The Seq SQL query text."),
    isProtected: s.boolean("Whether modifying the saved query requires Project permission."),
    ownerId: s.nullableString("The owning Seq user identifier, or null for a shared query."),
    raw: s.looseObject("The raw Seq saved query payload."),
  },
  "A normalized Seq saved query.",
);

const getSavedQueryOutputSchema = s.actionOutput(
  { savedQuery: savedQuerySchema },
  "A Seq saved query detail response.",
);

const savedQueryWriteProperties = {
  title: s.nonEmptyString("The human-readable saved query title."),
  description: s.nullableString("The saved query description, or null to clear it."),
  sql: s.string("The Seq SQL query text, which may be empty for a placeholder query."),
  isProtected: s.boolean("Whether modifying the saved query requires Project permission."),
  ownerId: s.nullable(s.nonEmptyString("The owning Seq user identifier, or null to make the query shared.")),
};

type DatalustActionDefinitions = readonly [
  ProviderActionDefinition<"search_events">,
  ProviderActionDefinition<"get_event">,
  ProviderActionDefinition<"execute_query">,
  ProviderActionDefinition<"ingest_event">,
  ProviderActionDefinition<"ingest_events">,
  ProviderActionDefinition<"list_signals">,
  ProviderActionDefinition<"get_signal">,
  ProviderActionDefinition<"create_signal">,
  ProviderActionDefinition<"update_signal">,
  ProviderActionDefinition<"delete_signal">,
  ProviderActionDefinition<"list_saved_queries">,
  ProviderActionDefinition<"get_saved_query">,
  ProviderActionDefinition<"create_saved_query">,
  ProviderActionDefinition<"update_saved_query">,
  ProviderActionDefinition<"delete_saved_query">,
];

export const datalustActions: DatalustActionDefinitions = [
  defineProviderAction(service, {
    name: "search_events",
    description: "Search a page of Seq events using a filter, signal, time range, or cursor.",
    providerPermissions: readPermissions,
    inputSchema: searchEventsInputSchema,
    outputSchema: searchEventsOutputSchema,
    followUpActions: ["datalust.get_event"],
  }),
  defineProviderAction(service, {
    name: "get_event",
    description: "Read one Seq event by its event identifier.",
    providerPermissions: readPermissions,
    inputSchema: getEventInputSchema,
    outputSchema: s.actionOutput({ event: eventSchema }, "A Seq event detail response."),
  }),
  defineProviderAction(service, {
    name: "execute_query",
    description: "Execute a Seq SQL-style query and return its structured JSON result.",
    providerPermissions: readPermissions,
    inputSchema: executeQueryInputSchema,
    outputSchema: executeQueryOutputSchema,
  }),
  defineProviderAction(service, {
    name: "ingest_event",
    description: "Ingest one structured log event into Seq using compact log event format.",
    providerPermissions: ingestPermissions,
    inputSchema: ingestEventInputSchema,
    outputSchema: ingestEventOutputSchema,
  }),
  defineProviderAction(service, {
    name: "ingest_events",
    description: "Ingest a JSON array of structured log events as one newline-delimited CLEF batch.",
    providerPermissions: ingestPermissions,
    inputSchema: ingestEventsInputSchema,
    outputSchema: ingestEventsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_signals",
    description: "List saved Seq signals visible to the API key.",
    providerPermissions: readPermissions,
    inputSchema: listSignalsInputSchema,
    outputSchema: listSignalsOutputSchema,
    followUpActions: ["datalust.get_signal"],
  }),
  defineProviderAction(service, {
    name: "get_signal",
    description: "Read one saved Seq signal by its identifier.",
    providerPermissions: readPermissions,
    inputSchema: s.actionInput(
      {
        signalId: s.nonEmptyString("The Seq signal identifier."),
        partial: s.boolean("Whether Seq should return partial signal details."),
      },
      ["signalId"],
      "Input parameters for reading one Seq signal.",
    ),
    outputSchema: getSignalOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_signal",
    description: "Create a Seq signal while preserving server-provided template defaults.",
    providerPermissions: writePermissions,
    inputSchema: createSignalInputSchema,
    outputSchema: getSignalOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_signal",
    description: "Update selected fields on a Seq signal while preserving unspecified fields.",
    providerPermissions: writePermissions,
    inputSchema: updateSignalInputSchema,
    outputSchema: s.actionOutput(
      {
        updated: s.boolean("Whether Seq accepted the signal update request."),
        status: s.integer("The HTTP status returned by Seq."),
      },
      "The result of updating a Seq signal.",
    ),
  }),
  defineProviderAction(service, {
    name: "delete_signal",
    description: "Delete a Seq signal by its identifier; protected signals also require Project permission.",
    providerPermissions: writePermissions,
    inputSchema: s.actionInput(
      { signalId: s.nonEmptyString("The Seq signal identifier.") },
      ["signalId"],
      "Input parameters for deleting a Seq signal.",
    ),
    outputSchema: s.actionOutput(
      {
        deleted: s.boolean("Whether Seq accepted the signal deletion request."),
        status: s.integer("The HTTP status returned by Seq."),
      },
      "The result of deleting a Seq signal.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_saved_queries",
    description: "List saved Seq SQL queries visible to the API key.",
    providerPermissions: readPermissions,
    inputSchema: s.actionInput(
      {
        ownerId: s.nonEmptyString("Only return saved queries owned by this Seq user identifier."),
        shared: s.boolean("Whether to include shared saved queries."),
      },
      [],
      "Input parameters for listing Seq saved queries.",
    ),
    outputSchema: s.actionOutput(
      {
        savedQueries: s.array(savedQuerySchema, { description: "The matching Seq saved queries." }),
        raw: s.array(s.looseObject("A raw Seq saved query."), {
          description: "The raw Seq saved query list payload.",
        }),
      },
      "A Seq saved query list response.",
    ),
    followUpActions: ["datalust.get_saved_query"],
  }),
  defineProviderAction(service, {
    name: "get_saved_query",
    description: "Read one saved Seq SQL query by its identifier.",
    providerPermissions: readPermissions,
    inputSchema: s.actionInput(
      { queryId: s.nonEmptyString("The Seq saved query identifier.") },
      ["queryId"],
      "Input parameters for reading one Seq saved query.",
    ),
    outputSchema: getSavedQueryOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_saved_query",
    description: "Create a saved Seq SQL query while preserving server-provided template defaults.",
    providerPermissions: writePermissions,
    inputSchema: s.actionInput(
      savedQueryWriteProperties,
      ["title", "sql"],
      "Input parameters for creating a Seq saved query.",
    ),
    outputSchema: getSavedQueryOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_saved_query",
    description: "Update selected fields on a saved Seq SQL query while preserving unspecified fields.",
    providerPermissions: writePermissions,
    inputSchema: s.actionInput(
      { queryId: s.nonEmptyString("The Seq saved query identifier."), ...savedQueryWriteProperties },
      ["queryId"],
      "Input parameters for updating a Seq saved query while preserving unspecified fields.",
    ),
    outputSchema: s.actionOutput(
      {
        updated: s.boolean("Whether Seq accepted the saved query update request."),
        status: s.integer("The HTTP status returned by Seq."),
      },
      "The result of updating a Seq saved query.",
    ),
  }),
  defineProviderAction(service, {
    name: "delete_saved_query",
    description: "Delete a saved Seq SQL query; protected queries also require Project permission.",
    providerPermissions: writePermissions,
    inputSchema: s.actionInput(
      { queryId: s.nonEmptyString("The Seq saved query identifier.") },
      ["queryId"],
      "Input parameters for deleting a Seq saved query.",
    ),
    outputSchema: s.actionOutput(
      {
        deleted: s.boolean("Whether Seq accepted the saved query deletion request."),
        status: s.integer("The HTTP status returned by Seq."),
      },
      "The result of deleting a Seq saved query.",
    ),
  }),
];

export type DatalustActionName = (typeof datalustActions)[number]["name"];
