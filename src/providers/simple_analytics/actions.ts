import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "simple_analytics";

const hostnameField = s.nonEmptyString("The website hostname tracked in Simple Analytics.");
const dateField = s.nonEmptyString("Date or hour range in YYYY-MM-DD or YYYY-MM-DDTHH format.");
const timezoneField = s.nonEmptyString("IANA timezone used to interpret the selected date range.");
const stringArrayField = s.array("A list of non-empty strings.", s.nonEmptyString("A non-empty string value."), {
  minItems: 1,
});
const rawObjectSchema = s.looseObject("The raw JSON payload returned by Simple Analytics.");
const metricBucketSchema = s.object(
  "An aggregated metric bucket returned by Simple Analytics.",
  {
    value: s.string("Bucket label returned by Simple Analytics."),
    pageviews: s.integer("Total pageviews counted for the bucket."),
    visitors: s.integer("Total unique visitors counted for the bucket."),
    seconds_on_page: s.integer("Median seconds on page for the bucket when Simple Analytics includes it."),
  },
  { optional: ["seconds_on_page"] },
);
const histogramEntrySchema = s.object("A histogram bucket returned by the Stats API.", {
  date: s.string("Date label for the histogram bucket in YYYY-MM-DD format."),
  pageviews: s.integer("Total pageviews in the histogram bucket."),
  visitors: s.integer("Total visitors in the histogram bucket."),
});
const eventCountSchema = s.object("An event total returned by Simple Analytics.", {
  name: s.string("Event name returned by Simple Analytics."),
  total: s.integer("Total event count for the selected range."),
});
const websiteSummarySchema = s.object(
  "A website summary returned by the Admin API.",
  {
    hostname: s.string("Tracked website hostname."),
    is_public: s.boolean("Whether the website is publicly accessible."),
    timezone: s.string("Timezone configured for the website."),
    has_ssl: s.boolean("Whether the website serves traffic over HTTPS."),
    has_script: s.boolean("Whether the tracking script was detected on the website."),
    pageviews: s.integer("Total pageviews recorded for the website."),
    events: s.integer("Total custom events recorded for the website."),
    own_hostname: s.string("Custom analytics hostname configured for the website when present."),
  },
  { optional: ["own_hostname"] },
);
const exportDatapointSchema = s.looseObject(
  "A raw datapoint returned by the Export API.",
  {
    added_iso: s.string("ISO 8601 timestamp when the datapoint was recorded."),
    hostname: s.string("Hostname associated with the datapoint."),
    path: s.string("Page path associated with the datapoint."),
    session_id: s.string("Session identifier associated with the datapoint."),
    is_unique: s.boolean("Whether the datapoint is marked as unique."),
  },
  { description: "A raw datapoint returned by the Export API." },
);
const exportMetaSchema = s.looseObject(
  "Export metadata returned by Simple Analytics.",
  {
    amount: s.integer("Number of datapoints returned by the export."),
    finishedInMs: s.integer("Time spent generating the export in milliseconds."),
  },
  { description: "Export metadata returned by Simple Analytics." },
);
const metadataSchema = s.record(
  "Flat metadata values attached to the server-side event.",
  s.anyOf("A flat metadata value supported by Simple Analytics.", [
    s.string("A string metadata value."),
    s.number("A numeric metadata value."),
    s.boolean("A boolean metadata value."),
  ]),
);

export const simpleAnalyticsActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_websites",
    description: "List websites available to the authenticated Simple Analytics account.",
    inputSchema: s.object("The input payload for listing tracked websites.", {}),
    outputSchema: s.object("The website list returned by the Simple Analytics Admin API.", {
      success: s.boolean("Whether the Admin API request succeeded."),
      websites: s.array("Tracked websites returned by the Admin API.", websiteSummarySchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_aggregated_stats",
    description: "Get aggregated website statistics from the Simple Analytics Stats API.",
    inputSchema: s.object(
      "The input payload for the Stats API request.",
      {
        hostname: hostnameField,
        start: dateField,
        end: dateField,
        timezone: timezoneField,
        page: s.string("Filter the response to a specific page path."),
        referrer: s.string("Filter the response to a specific referrer."),
        includeHistogram: s.boolean("Whether to include the histogram field in the response."),
        eventNames: stringArrayField,
      },
      {
        required: ["hostname"],
        optional: ["start", "end", "timezone", "page", "referrer", "includeHistogram", "eventNames"],
      },
    ),
    outputSchema: s.object(
      "The normalized stats response returned by Simple Analytics.",
      {
        ok: s.boolean("Whether the Stats API request succeeded."),
        docs: s.string("Documentation URL returned by the Stats API."),
        hostname: s.string("Hostname used for the stats request."),
        url: s.string("Website URL associated with the hostname."),
        path: s.string("Path scope applied to the stats request."),
        start: s.string("Resolved start timestamp for the stats response."),
        end: s.string("Resolved end timestamp for the stats response."),
        version: s.integer("Stats API version used for the response."),
        timezone: s.string("Timezone used to generate the stats response."),
        pageviews: s.integer("Total pageviews in the selected range."),
        visitors: s.integer("Total visitors in the selected range."),
        seconds_on_page: s.integer("Median seconds on page in the selected range."),
        pages: s.array("Page buckets returned by the Stats API.", metricBucketSchema),
        countries: s.array("Country buckets returned by the Stats API.", metricBucketSchema),
        referrers: s.array("Referrer buckets returned by the Stats API.", metricBucketSchema),
        browser_names: s.array("Browser buckets returned by the Stats API.", metricBucketSchema),
        os_names: s.array("OS buckets returned by the Stats API.", metricBucketSchema),
        device_types: s.array("Device type buckets returned by the Stats API.", metricBucketSchema),
        histogram: s.array("Histogram buckets returned by the Stats API.", histogramEntrySchema),
        events: s.array("Event totals returned by the Stats API.", eventCountSchema),
        generated_in_ms: s.integer("Server-side generation time reported by Simple Analytics."),
        raw: rawObjectSchema,
      },
      {
        optional: [
          "ok",
          "docs",
          "hostname",
          "url",
          "path",
          "start",
          "end",
          "version",
          "timezone",
          "pageviews",
          "visitors",
          "seconds_on_page",
          "pages",
          "countries",
          "referrers",
          "browser_names",
          "os_names",
          "device_types",
          "histogram",
          "events",
          "generated_in_ms",
          "raw",
        ],
      },
    ),
  }),
  defineProviderAction(service, {
    name: "export_data_points",
    description: "Export raw datapoints from the Simple Analytics Export API.",
    inputSchema: s.object(
      "The input payload for exporting raw datapoints.",
      {
        hostname: hostnameField,
        start: dateField,
        end: dateField,
        timezone: timezoneField,
        format: s.stringEnum("Export response format.", ["csv", "json"]),
        fields: stringArrayField,
        type: s.stringEnum("Datapoint type filter used by the export.", ["pageviews", "events", "all"]),
      },
      { required: ["hostname", "start", "end"], optional: ["timezone", "format", "fields", "type"] },
    ),
    outputSchema: s.object(
      "The normalized export response returned by Simple Analytics.",
      {
        format: s.stringEnum("Export response format returned by the provider.", ["csv", "json"]),
        csv: s.string("CSV payload when the export format is csv."),
        datapoints: s.array("Datapoints returned by the Export API when the format is json.", exportDatapointSchema),
        meta: exportMetaSchema,
        raw: s.anyOf("The raw export payload returned by Simple Analytics.", [
          rawObjectSchema,
          s.array("The raw datapoint array returned by Simple Analytics.", exportDatapointSchema),
        ]),
      },
      { required: ["format"], optional: ["csv", "datapoints", "meta", "raw"] },
    ),
  }),
  defineProviderAction(service, {
    name: "send_event",
    description: "Send a server-side event or pageview to Simple Analytics.",
    inputSchema: s.object(
      "The input payload for submitting a server-side event.",
      {
        type: s.stringEnum("Type of server-side submission to send.", ["event", "pageview"]),
        hostname: hostnameField,
        event: s.nonEmptyString("Event name recorded by Simple Analytics."),
        ua: s.nonEmptyString("User agent string sent to the server-side events endpoint."),
        path: s.string("Page path associated with the event."),
        referrer: s.string("Referrer URL associated with the event."),
        source: s.string("UTM source associated with the event."),
        campaign: s.string("UTM campaign associated with the event."),
        metadata: metadataSchema,
      },
      {
        required: ["type", "hostname", "event", "ua"],
        optional: ["path", "referrer", "source", "campaign", "metadata"],
      },
    ),
    outputSchema: s.object(
      "The acknowledgement returned by the server-side events endpoint.",
      {
        success: s.boolean("Whether the event submission was accepted."),
        message: s.string("Optional message returned by the events endpoint."),
      },
      { required: ["success"], optional: ["message"] },
    ),
  }),
];
