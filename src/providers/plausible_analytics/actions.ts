import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "plausible_analytics";

const dateRange = s.union(
  [
    s.nonEmptyString("A relative date range such as 7d, 30d, or month."),
    s.array("A custom [from, to] ISO date tuple.", s.nonEmptyString("One date boundary."), {
      minItems: 2,
      maxItems: 2,
    }),
  ],
  { description: "Date range to query, such as '7d', '30d', 'month', or a custom [from, to] ISO date tuple." },
);
const metrics = s.stringArray("Metrics to calculate for the query.", { minItems: 1 });
const filters = s.array(
  "Plausible filter expression array passed through to the Stats API.",
  s.unknown("One filter expression."),
);
const orderBy = s.array(
  "Plausible order_by expression array passed through to the Stats API.",
  s.unknown("One order expression."),
);
const include = s.object("Optional include flags supported by the Plausible Stats API.", {
  imports: s.boolean("Whether imported stats should be included when supported."),
  time_labels: s.boolean("Whether the response should include rendered time_labels."),
  total_rows: s.boolean("Whether the response should include total_rows metadata."),
});
const pagination = s.object("Pagination options passed through to the Plausible Stats API.", {
  limit: s.positiveInteger("Maximum number of rows to return."),
  offset: s.nonNegativeInteger("Zero-based offset for paginated queries."),
});

const statsResult = s.looseRequiredObject("Single Plausible stats result row.", {
  dimensions: s.array(
    "Dimension values returned for this row, in the same order as the query dimensions.",
    s.union([s.string(), s.number(), { type: "null" }]),
  ),
  metrics: s.array(
    "Metric values returned for this row, in the same order as the query metrics.",
    s.union([s.string(), s.number(), { type: "null" }]),
  ),
});

const statsResponse = s.object(
  "Plausible Stats API query response.",
  {
    results: s.array("Ordered result rows returned by the query.", statsResult),
    meta: s.looseObject("Metadata returned by the Plausible Stats API."),
    query: s.looseObject("Resolved query payload returned by the Plausible Stats API."),
  },
  { optional: ["meta", "query"] },
);

const statsBaseInput = {
  site_id: s.nonEmptyString(
    "Site identifier in Plausible. When omitted, the provider falls back to the default site configured on the connection.",
  ),
  date_range: dateRange,
  metrics,
  filters,
  order_by: orderBy,
  include,
  pagination,
};

export const plausibleAnalyticsActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "query_stats",
    operationType: "read",
    description: "Query historical or real-time analytics for a Plausible site using the Stats API v2.",
    followUpActions: ["plausible_analytics.get_breakdown_stats", "plausible_analytics.get_timeseries_stats"],
    inputSchema: s.actionInput(
      {
        ...statsBaseInput,
        dimensions: s.stringArray("Dimensions to group the query results by."),
      },
      ["date_range", "metrics"],
    ),
    outputSchema: statsResponse,
  }),
  defineProviderAction(service, {
    name: "get_timeseries_stats",
    operationType: "read",
    description: "Query Plausible analytics as a timeseries grouped by a time dimension such as day or hour.",
    followUpActions: ["plausible_analytics.get_breakdown_stats"],
    inputSchema: s.actionInput(
      {
        ...statsBaseInput,
        interval: s.stringEnum("Time dimension used to build a timeseries query.", [
          "time:hour",
          "time:day",
          "time:week",
          "time:month",
        ]),
      },
      ["date_range", "metrics", "interval"],
    ),
    outputSchema: statsResponse,
  }),
  defineProviderAction(service, {
    name: "get_breakdown_stats",
    operationType: "read",
    description: "Query Plausible analytics grouped by a single dimension such as source, page, country, or browser.",
    inputSchema: s.actionInput(
      {
        ...statsBaseInput,
        dimension: s.nonEmptyString("Dimension identifier accepted by the Plausible Stats API."),
      },
      ["date_range", "metrics", "dimension"],
    ),
    outputSchema: statsResponse,
  }),
  defineProviderAction(service, {
    name: "record_event",
    operationType: "write",
    description: "Record a pageview or custom event through the Plausible Events API for server-side or app tracking.",
    followUpActions: ["plausible_analytics.query_stats"],
    inputSchema: s.actionInput(
      {
        domain: s.nonEmptyString(
          "Site identifier used by Plausible for the event. When omitted, the provider falls back to the default site configured on the connection.",
        ),
        name: s.nonEmptyString("Event name. Use 'pageview' for a pageview event or any custom event name."),
        url: s.nonEmptyString("Absolute URL of the page or screen where the event happened."),
        referrer: s.nonEmptyString("Referrer URL to associate with the event."),
        props: s.record(
          "Custom event properties to attach to the recorded event.",
          s.union([s.string(), s.number(), s.boolean(), { type: "null" }]),
        ),
        revenue: s.actionInput(
          {
            currency: s.nonEmptyString("ISO 4217 currency code, such as USD or EUR."),
            amount: s.union([
              s.number("Revenue amount as a number."),
              s.nonEmptyString("Revenue amount as a numeric string."),
            ]),
          },
          ["currency", "amount"],
        ),
        interactive: s.boolean("Whether the event should count as interactive for bounce calculations."),
        userAgent: s.nonEmptyString("Custom User-Agent header to send with the event request."),
        forwardedFor: s.nonEmptyString("IP address or X-Forwarded-For chain to send with the event request."),
        debugRequest: s.boolean("Whether to enable Plausible debug mode with the X-Debug-Request header."),
      },
      ["name", "url"],
    ),
    outputSchema: s.looseObject(
      "Raw Plausible Events API response. Successful non-debug requests usually return an empty object.",
    ),
  }),
];
