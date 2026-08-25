import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { datadogMetricsReadScope, datadogMonitorsReadScope, datadogTimeseriesQueryScope } from "./scopes.ts";

const service = "datadog";

const rawObject = s.looseObject({}, { description: "The raw Datadog API object." });
const nullableRawObject = s.nullable(rawObject);
const monitorGroupState = s.stringEnum(["all", "alert", "warn", "no data", "ok"], {
  description: "One Datadog monitor group state.",
});
const monitor = looseRequiredObject(
  {
    id: s.nullable(s.integer({ description: "The Datadog monitor ID." })),
    name: s.nullable(s.string({ description: "The monitor name." })),
    type: s.nullable(s.string({ description: "The monitor type." })),
    query: s.nullable(s.string({ description: "The monitor query." })),
    message: s.nullable(s.string({ description: "The monitor notification message." })),
    tags: s.array(s.string({ description: "A Datadog monitor tag." }), {
      description: "The monitor tags returned by Datadog.",
    }),
    overallState: s.nullable(s.string({ description: "The monitor overall_state value returned by Datadog." })),
    creator: nullableRawObject,
    options: nullableRawObject,
  },
  "A normalized Datadog monitor.",
);
const monitorSearchResult = looseRequiredObject(
  {
    id: s.nullable(s.integer({ description: "The Datadog monitor ID." })),
    name: s.nullable(s.string({ description: "The monitor name." })),
    type: s.nullable(s.string({ description: "The monitor type." })),
    query: s.nullable(s.string({ description: "The monitor query." })),
    tags: s.array(s.string({ description: "A Datadog monitor tag." }), {
      description: "The monitor tags returned by Datadog.",
    }),
    overallState: s.nullable(s.string({ description: "The monitor overall_state value returned by Datadog." })),
  },
  "A Datadog monitor search result.",
);
const timeseries = looseRequiredObject(
  {
    metric: s.nullable(s.string({ description: "The metric name for the timeseries." })),
    scope: s.nullable(s.string({ description: "The metric scope returned by Datadog." })),
    expression: s.nullable(s.string({ description: "The query expression that produced the timeseries." })),
    displayName: s.nullable(s.string({ description: "The display name returned by Datadog." })),
    unit: s.array(rawObject, { description: "The unit metadata returned by Datadog." }),
    pointlist: s.array(
      s.array(s.nullable(s.number({ description: "A timestamp or value." })), {
        description: "One Datadog timestamp-value pair.",
      }),
      { description: "The points returned by Datadog as timestamp-value pairs." },
    ),
  },
  "A Datadog timeseries returned by the query API.",
);
const metricMetadata = looseRequiredObject(
  {
    metric: s.nullable(s.string({ description: "The Datadog metric name." })),
    type: s.nullable(s.string({ description: "The Datadog metric type." })),
    description: s.nullable(s.string({ description: "The metric description when available." })),
    integration: s.nullable(s.string({ description: "The integration that owns the metric when available." })),
    unit: s.nullable(s.string({ description: "The metric unit when available." })),
  },
  "Datadog metric metadata.",
);

export const datadogActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "validate_api_key",
    description: "Validate the configured Datadog API key.",
    inputSchema: s.actionInput({}, [], "Input for validating the configured Datadog API key."),
    outputSchema: s.actionOutput(
      {
        valid: s.boolean({ description: "Whether Datadog accepted the API key." }),
        raw: rawObject,
      },
      "Datadog API key validation result.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_monitors",
    description: "List Datadog monitors with optional group state and tag filters.",
    requiredScopes: [datadogMonitorsReadScope],
    providerPermissions: [datadogMonitorsReadScope],
    inputSchema: s.actionInput(
      {
        groupStates: s.array(monitorGroupState, { minItems: 1, description: "Monitor group states to include." }),
        name: s.string({ minLength: 1, description: "Filter monitors by name." }),
        tags: s.stringArray("Filter monitors by tags.", { minItems: 1, itemDescription: "A Datadog monitor tag." }),
        monitorTags: s.stringArray("Filter monitors by monitor tags.", {
          minItems: 1,
          itemDescription: "A Datadog monitor tag.",
        }),
        withDowntimes: s.boolean({ description: "Whether to include monitor downtimes in the response." }),
      },
      [],
      "Input for listing Datadog monitors.",
    ),
    outputSchema: s.actionOutput(
      {
        monitors: s.array(monitor, { description: "Monitors returned by Datadog." }),
        raw: s.array(rawObject, { description: "Raw Datadog monitor objects." }),
      },
      "Datadog monitor list response.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_monitor",
    description: "Retrieve one Datadog monitor by ID.",
    requiredScopes: [datadogMonitorsReadScope],
    providerPermissions: [datadogMonitorsReadScope],
    inputSchema: s.actionInput(
      {
        monitorId: s.integer({ description: "The Datadog monitor ID." }),
        groupStates: s.array(monitorGroupState, { minItems: 1, description: "Monitor group states to include." }),
        withDowntimes: s.boolean({ description: "Whether to include monitor downtimes in the response." }),
      },
      ["monitorId"],
      "Input for retrieving one Datadog monitor.",
    ),
    outputSchema: s.actionOutput({ monitor }, "Datadog monitor detail response."),
  }),
  defineProviderAction(service, {
    name: "search_monitors",
    description: "Search Datadog monitors by query, page, and sort options.",
    requiredScopes: [datadogMonitorsReadScope],
    providerPermissions: [datadogMonitorsReadScope],
    inputSchema: s.actionInput(
      {
        query: s.string({ minLength: 1, description: "Search query for monitors." }),
        page: s.integer({ minimum: 1, description: "Search results page number." }),
        perPage: s.integer({ minimum: 1, description: "Maximum number of monitors per page." }),
        sort: s.string({ minLength: 1, description: "Datadog monitor search sort field." }),
      },
      [],
      "Input for searching Datadog monitors.",
    ),
    outputSchema: s.actionOutput(
      {
        monitors: s.array(monitorSearchResult, { description: "Monitor search results returned by Datadog." }),
        counts: nullableRawObject,
        metadata: nullableRawObject,
        raw: rawObject,
      },
      "Datadog monitor search response.",
    ),
  }),
  defineProviderAction(service, {
    name: "query_timeseries_points",
    description: "Query Datadog timeseries points for a metric expression and time window.",
    requiredScopes: [datadogTimeseriesQueryScope],
    providerPermissions: [datadogTimeseriesQueryScope],
    inputSchema: s.actionInput(
      {
        from: s.integer({ description: "Unix timestamp in seconds for the query start." }),
        to: s.integer({ description: "Unix timestamp in seconds for the query end." }),
        query: s.string({ minLength: 1, description: "Datadog metric query expression." }),
      },
      ["from", "to", "query"],
      "Input for querying Datadog timeseries points.",
    ),
    outputSchema: s.actionOutput(
      {
        status: s.nullable(s.string({ description: "The Datadog query status." })),
        resType: s.nullable(s.string({ description: "The Datadog response type." })),
        series: s.array(timeseries, { description: "Timeseries returned by Datadog." }),
        raw: rawObject,
      },
      "Datadog timeseries query response.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_metrics",
    description: "List Datadog metric names active since a given Unix timestamp.",
    requiredScopes: [datadogMetricsReadScope],
    providerPermissions: [datadogMetricsReadScope],
    inputSchema: s.actionInput(
      {
        from: s.integer({ description: "Unix timestamp in seconds for the earliest active metric time." }),
        host: s.string({ minLength: 1, description: "Filter metrics by host." }),
        tagFilter: s.string({ minLength: 1, description: "Filter metrics by Datadog tag expression." }),
      },
      ["from"],
      "Input for listing Datadog metrics.",
    ),
    outputSchema: s.actionOutput(
      {
        metrics: s.array(s.string({ description: "A Datadog metric name." }), {
          description: "Metric names returned by Datadog.",
        }),
        raw: rawObject,
      },
      "Datadog metrics list response.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_metric_metadata",
    description: "Retrieve Datadog metadata for one metric.",
    requiredScopes: [datadogMetricsReadScope],
    providerPermissions: [datadogMetricsReadScope],
    inputSchema: s.actionInput(
      {
        metricName: s.string({ minLength: 1, description: "The Datadog metric name." }),
      },
      ["metricName"],
      "Input for retrieving Datadog metric metadata.",
    ),
    outputSchema: s.actionOutput({ metric: metricMetadata }, "Datadog metric metadata response."),
  }),
];

function looseRequiredObject(properties: Record<string, JsonSchema>, description: string): JsonSchema {
  return s.object(properties, {
    required: Object.keys(properties),
    additionalProperties: true,
    description,
  });
}
