import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "openstatus";

const regionValues: string[] = [
  "REGION_FLY_AMS",
  "REGION_FLY_ARN",
  "REGION_FLY_BOM",
  "REGION_FLY_CDG",
  "REGION_FLY_DFW",
  "REGION_FLY_EWR",
  "REGION_FLY_FRA",
  "REGION_FLY_GRU",
  "REGION_FLY_IAD",
  "REGION_FLY_JNB",
  "REGION_FLY_LAX",
  "REGION_FLY_LHR",
  "REGION_FLY_NRT",
  "REGION_FLY_ORD",
  "REGION_FLY_SJC",
  "REGION_FLY_SIN",
  "REGION_FLY_SYD",
  "REGION_FLY_YYZ",
  "REGION_KOYEB_FRA",
  "REGION_KOYEB_PAR",
  "REGION_KOYEB_SFO",
  "REGION_KOYEB_SIN",
  "REGION_KOYEB_TYO",
  "REGION_KOYEB_WAS",
  "REGION_RAILWAY_US_WEST2",
  "REGION_RAILWAY_US_EAST4",
  "REGION_RAILWAY_EUROPE_WEST4",
  "REGION_RAILWAY_ASIA_SOUTHEAST1",
];

const methodValues: string[] = [
  "HTTP_METHOD_GET",
  "HTTP_METHOD_POST",
  "HTTP_METHOD_HEAD",
  "HTTP_METHOD_PUT",
  "HTTP_METHOD_PATCH",
  "HTTP_METHOD_DELETE",
  "HTTP_METHOD_TRACE",
  "HTTP_METHOD_CONNECT",
  "HTTP_METHOD_OPTIONS",
];

const periodicityValues: string[] = [
  "PERIODICITY_30S",
  "PERIODICITY_1M",
  "PERIODICITY_5M",
  "PERIODICITY_10M",
  "PERIODICITY_30M",
  "PERIODICITY_1H",
];

const numberComparatorValues: string[] = [
  "NUMBER_COMPARATOR_EQUAL",
  "NUMBER_COMPARATOR_NOT_EQUAL",
  "NUMBER_COMPARATOR_GREATER_THAN",
  "NUMBER_COMPARATOR_GREATER_THAN_OR_EQUAL",
  "NUMBER_COMPARATOR_LESS_THAN",
  "NUMBER_COMPARATOR_LESS_THAN_OR_EQUAL",
];

const stringComparatorValues: string[] = [
  "STRING_COMPARATOR_CONTAINS",
  "STRING_COMPARATOR_NOT_CONTAINS",
  "STRING_COMPARATOR_EQUAL",
  "STRING_COMPARATOR_NOT_EQUAL",
  "STRING_COMPARATOR_EMPTY",
  "STRING_COMPARATOR_NOT_EMPTY",
  "STRING_COMPARATOR_GREATER_THAN",
  "STRING_COMPARATOR_GREATER_THAN_OR_EQUAL",
  "STRING_COMPARATOR_LESS_THAN",
  "STRING_COMPARATOR_LESS_THAN_OR_EQUAL",
];

const monitorIdSchema = s.nonEmptyString("OpenStatus monitor ID.");
const limitSchema = s.integer("Maximum number of records to return.", { minimum: 1, maximum: 100 });
const offsetSchema = s.nonNegativeInteger("Number of records to skip for pagination.");
const regionSchema = s.stringEnum("OpenStatus monitor region.", regionValues);
const regionsSchema = s.array("Regions used to run or filter monitor checks.", regionSchema, {
  minItems: 1,
  maxItems: 28,
});
const methodSchema = s.stringEnum("HTTP method used by the monitor.", methodValues);
const periodicitySchema = s.stringEnum("How often OpenStatus should run the monitor.", periodicityValues);
const timeRangeSchema = s.stringEnum("Metrics aggregation window.", [
  "TIME_RANGE_1D",
  "TIME_RANGE_7D",
  "TIME_RANGE_14D",
]);
const numberComparatorSchema = s.stringEnum("Numeric assertion comparator.", numberComparatorValues);
const stringComparatorSchema = s.stringEnum("String assertion comparator.", stringComparatorValues);
const nullSchema = { type: "null", description: "Null value." };
const nullableIntegerOutputSchema = s.anyOf("Integer value returned by OpenStatus.", [
  s.integer("Integer value returned as a JSON number."),
  s.string("Integer value returned as a string."),
  nullSchema,
]);
const integerOutputSchema = s.anyOf("Integer value returned by OpenStatus.", [
  s.integer("Integer value returned as a JSON number."),
  s.string("Integer value returned as a string."),
]);

const headerSchema = s.object("HTTP header key-value pair.", {
  key: s.nonEmptyString("Header name."),
  value: s.string("Header value."),
});

const statusCodeAssertionSchema = s.object("HTTP status code assertion.", {
  target: s.integer("Target HTTP status code.", { minimum: 100, maximum: 599 }),
  comparator: numberComparatorSchema,
});

const bodyAssertionSchema = s.object("HTTP response body assertion.", {
  target: s.string("Target body value to compare against."),
  comparator: stringComparatorSchema,
});

const headerAssertionSchema = s.object("HTTP response header assertion.", {
  key: s.nonEmptyString("Header name to check."),
  target: s.string("Target header value to compare against."),
  comparator: stringComparatorSchema,
});

const openTelemetrySchema = s.object(
  "OpenTelemetry export configuration for monitor metrics.",
  {
    endpoint: s.string({ format: "uri", maxLength: 2048, description: "OpenTelemetry endpoint URL." }),
    headers: s.array("Headers sent to the OpenTelemetry endpoint.", headerSchema, { maxItems: 20 }),
  },
  { optional: ["headers"] },
);

const httpMonitorInputFields = {
  name: s.string("Monitor name.", { minLength: 1, maxLength: 256 }),
  url: s.string({ format: "uri", maxLength: 2048, description: "URL that OpenStatus should monitor." }),
  periodicity: periodicitySchema,
  method: methodSchema,
  body: s.string("Request body to send with the monitor check."),
  timeout: s.integer("Timeout in milliseconds.", { minimum: 0, maximum: 120000 }),
  degradedAt: s.nullableInteger("Latency threshold in milliseconds before the monitor is marked degraded.", {
    minimum: 0,
    maximum: 120000,
  }),
  retry: s.integer("Number of retry attempts.", { minimum: 0, maximum: 10 }),
  followRedirects: s.nullableBoolean("Whether the monitor should follow HTTP redirects."),
  headers: s.array("Custom request headers.", headerSchema, { maxItems: 20 }),
  statusCodeAssertions: s.array("HTTP status code assertions.", statusCodeAssertionSchema, { maxItems: 10 }),
  bodyAssertions: s.array("HTTP response body assertions.", bodyAssertionSchema, { maxItems: 10 }),
  headerAssertions: s.array("HTTP response header assertions.", headerAssertionSchema, { maxItems: 10 }),
  description: s.string("Monitor description.", { maxLength: 1024 }),
  active: s.boolean("Whether the monitor is active."),
  public: s.boolean("Whether the monitor is publicly visible."),
  regions: regionsSchema,
  openTelemetry: openTelemetrySchema,
};

type HttpMonitorInputField = keyof typeof httpMonitorInputFields;

const optionalHttpMonitorFields: HttpMonitorInputField[] = [
  "method",
  "body",
  "timeout",
  "degradedAt",
  "retry",
  "followRedirects",
  "headers",
  "statusCodeAssertions",
  "bodyAssertions",
  "headerAssertions",
  "description",
  "active",
  "public",
  "regions",
  "openTelemetry",
];

const updateHttpMonitorFieldNames: HttpMonitorInputField[] = [
  "name",
  "url",
  "periodicity",
  ...optionalHttpMonitorFields,
];

const monitorSummarySchema = s.looseObject("OpenStatus monitor returned by the API.", {
  id: s.string("Monitor ID."),
  name: s.string("Monitor name."),
  url: s.string("HTTP monitor URL."),
  uri: s.string("TCP or DNS monitor URI."),
  periodicity: s.string("Monitor check periodicity."),
  method: s.string("HTTP method for HTTP monitors."),
  active: s.boolean("Whether the monitor is active."),
  public: s.boolean("Whether the monitor is public."),
  status: s.string("Current monitor status."),
});

const monitorConfigSchema = s.looseObject("Type-specific OpenStatus monitor configuration.", {
  http: monitorSummarySchema,
  tcp: monitorSummarySchema,
  dns: monitorSummarySchema,
});

const regionStatusSchema = s.looseObject("Current monitor status for one region.", {
  region: s.string("OpenStatus region identifier."),
  status: s.string("Current monitor status in this region."),
});

const responseLogSchema = s.looseObject("OpenStatus HTTP response log entry.", {
  id: s.nullableString("Response log ID."),
  monitorId: s.string("Monitor ID."),
  latency: s.integer("Measured latency in milliseconds."),
  statusCode: s.nullableInteger("HTTP status code."),
  requestStatus: s.string("Request status classification."),
  region: s.string("Region where the check ran."),
  timestamp: integerOutputSchema,
});

const paginationSchema = s.looseObject("OpenStatus pagination metadata.", {
  limit: s.integer("Requested page size."),
  offset: s.integer("Requested page offset."),
  hasMore: s.boolean("Whether more records are available."),
  nextOffset: s.nullableInteger("Next offset when more records are available."),
});

const listMonitorsInputSchema = s.object(
  "Input parameters for listing OpenStatus monitors.",
  {
    limit: limitSchema,
    offset: offsetSchema,
  },
  { optional: ["limit", "offset"] },
);

const listMonitorsOutputSchema = s.object("OpenStatus monitor list.", {
  httpMonitors: s.array("HTTP monitors returned by OpenStatus.", monitorSummarySchema),
  tcpMonitors: s.array("TCP monitors returned by OpenStatus.", monitorSummarySchema),
  dnsMonitors: s.array("DNS monitors returned by OpenStatus.", monitorSummarySchema),
  totalSize: s.integer("Total number of monitors across all types."),
});

const getMonitorInputSchema = s.object("Input parameters for retrieving one OpenStatus monitor.", {
  id: monitorIdSchema,
});

const getMonitorOutputSchema = s.object("Single OpenStatus monitor.", {
  monitor: monitorConfigSchema,
});

const getMonitorStatusOutputSchema = s.object("OpenStatus monitor region statuses.", {
  id: s.string("Monitor ID."),
  regions: s.array("Status entries by region.", regionStatusSchema),
});

const getMonitorSummaryInputSchema = s.object(
  "Input parameters for retrieving OpenStatus monitor metrics.",
  {
    id: monitorIdSchema,
    timeRange: timeRangeSchema,
    regions: regionsSchema,
  },
  { optional: ["timeRange", "regions"] },
);

const getMonitorSummaryOutputSchema = s.object("OpenStatus monitor metrics summary.", {
  summary: s.looseObject("Aggregated monitor metrics returned by OpenStatus.", {
    id: s.string("Monitor ID."),
    lastPingAt: s.string("Timestamp of the latest check."),
    totalSuccessful: integerOutputSchema,
    totalDegraded: integerOutputSchema,
    totalFailed: integerOutputSchema,
    p50: integerOutputSchema,
    p75: integerOutputSchema,
    p90: integerOutputSchema,
    p95: integerOutputSchema,
    p99: integerOutputSchema,
    timeRange: s.string("Metrics aggregation window."),
    regions: s.array("Regions included in the metrics.", s.string("OpenStatus region identifier.")),
  }),
});

const listHttpResponseLogsInputSchema = s.object(
  "Input parameters for listing OpenStatus HTTP response logs.",
  {
    id: monitorIdSchema,
    fromTimestamp: nullableIntegerOutputSchema,
    toTimestamp: nullableIntegerOutputSchema,
    limit: limitSchema,
    offset: offsetSchema,
  },
  { optional: ["fromTimestamp", "toTimestamp", "limit", "offset"] },
);

const listHttpResponseLogsOutputSchema = s.object("OpenStatus HTTP response logs.", {
  logs: s.array("HTTP response logs returned by OpenStatus.", responseLogSchema),
  pagination: s.nullable(paginationSchema),
});

const successOutputSchema = s.object("OpenStatus mutation result.", {
  success: s.boolean("Whether OpenStatus completed the operation successfully."),
});

const createHttpMonitorInputSchema = s.object(
  "Input parameters for creating an OpenStatus HTTP monitor.",
  httpMonitorInputFields,
  { optional: optionalHttpMonitorFields },
);

const httpMonitorOutputSchema = s.object("OpenStatus HTTP monitor result.", {
  monitor: monitorSummarySchema,
});

const updateHttpMonitorInputSchema = s.object(
  "Input parameters for updating an OpenStatus HTTP monitor.",
  {
    id: monitorIdSchema,
    ...httpMonitorInputFields,
  },
  { optional: updateHttpMonitorFieldNames },
);
updateHttpMonitorInputSchema.anyOf = updateHttpMonitorFieldNames.map((field) => ({ required: [field] }));

export const openstatusActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_monitors",
    description: "List OpenStatus HTTP, TCP, and DNS monitors in the authenticated workspace.",
    inputSchema: listMonitorsInputSchema,
    outputSchema: listMonitorsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_monitor",
    description: "Retrieve one OpenStatus monitor configuration by ID.",
    inputSchema: getMonitorInputSchema,
    outputSchema: getMonitorOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_monitor_status",
    description: "Retrieve the current OpenStatus monitor status for each configured region.",
    inputSchema: getMonitorInputSchema,
    outputSchema: getMonitorStatusOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_monitor_summary",
    description: "Retrieve aggregated OpenStatus monitor metrics for a time range and regions.",
    inputSchema: getMonitorSummaryInputSchema,
    outputSchema: getMonitorSummaryOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_http_response_logs",
    description: "List recent OpenStatus HTTP response logs for a monitor.",
    inputSchema: listHttpResponseLogsInputSchema,
    outputSchema: listHttpResponseLogsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "trigger_monitor",
    description: "Trigger an immediate OpenStatus monitor check across configured regions.",
    requiredScopes: ["write"],
    inputSchema: getMonitorInputSchema,
    outputSchema: successOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_http_monitor",
    description: "Create a new OpenStatus HTTP monitor.",
    requiredScopes: ["write"],
    inputSchema: createHttpMonitorInputSchema,
    outputSchema: httpMonitorOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_http_monitor",
    description: "Partially update an existing OpenStatus HTTP monitor.",
    requiredScopes: ["write"],
    inputSchema: updateHttpMonitorInputSchema,
    outputSchema: httpMonitorOutputSchema,
  }),
  defineProviderAction(service, {
    name: "delete_monitor",
    description: "Delete an OpenStatus monitor by ID.",
    requiredScopes: ["write"],
    inputSchema: getMonitorInputSchema,
    outputSchema: successOutputSchema,
  }),
];
