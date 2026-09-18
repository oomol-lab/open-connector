import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { jsonSchema as s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "speedtest_tracker";

const speedtestTrackerAbilities = {
  resultsRead: "results:read",
  speedtestsRun: "speedtests:run",
  ooklaListServers: "ookla:list-servers",
} as const;

const speedtestTrackerResultStatuses = [
  "waiting",
  "started",
  "checking",
  "benchmarking",
  "running",
  "completed",
  "failed",
  "skipped",
] as const;

const resultSortValues = [
  "ping",
  "-ping",
  "download",
  "-download",
  "upload",
  "-upload",
  "created_at",
  "-created_at",
  "updated_at",
  "-updated_at",
] as const;

const resultSchema = s.object(
  "A Speedtest Tracker result with upstream field names. Bandwidth fields use bytes per second unless the name says bits.",
  {
    id: s.integer("The result ID."),
    service: s.string("The speedtest service that produced the result, currently `ookla`."),
    ping: s.nullableNumber("Ping latency in milliseconds, null until the test completes."),
    download: s.nullableInteger("Download bandwidth in bytes per second, null until the test completes."),
    upload: s.nullableInteger("Upload bandwidth in bytes per second, null until the test completes."),
    download_bits: s.number("Download bandwidth in bits per second, omitted when download is empty."),
    upload_bits: s.number("Upload bandwidth in bits per second, omitted when upload is empty."),
    download_bits_human: s.string(
      "Human readable download bandwidth such as `934.51 Mbps`, omitted when download is empty.",
    ),
    upload_bits_human: s.string("Human readable upload bandwidth such as `41.20 Mbps`, omitted when upload is empty."),
    download_bytes: s.nullableInteger("Total bytes transferred during the download phase."),
    upload_bytes: s.nullableInteger("Total bytes transferred during the upload phase."),
    download_bytes_human: s.string("Human readable download transfer size, omitted when download_bytes is empty."),
    upload_bytes_human: s.string("Human readable upload transfer size, omitted when upload_bytes is empty."),
    benchmarks: s.unknown("The benchmark evaluation payload, null when no benchmarks were configured."),
    healthy: s.nullableBoolean("Whether the result passed the configured benchmarks, null when not evaluated."),
    status: s.stringEnum(
      "The result status. waiting, started, checking, benchmarking, and running mean the test is still in progress.",
      speedtestTrackerResultStatuses,
    ),
    scheduled: s.boolean(
      "Whether the test ran from the schedule or the API (true) instead of a manual dashboard run (false).",
    ),
    dispatched_by: s.nullableInteger(
      "The ID of the user whose token or dashboard session dispatched the test, null for scheduled runs.",
    ),
    comments: s.nullableString("Free-form comments attached to the result."),
    data: s.nullable(
      s.looseObject(
        "The raw Ookla Speedtest CLI payload, including isp, server, ping, download, upload, interface, packetLoss, and result URL fields.",
      ),
    ),
    created_at: s.string("When the result was created, formatted as `YYYY-MM-DD HH:mm:ss` in the instance timezone."),
    updated_at: s.string(
      "When the result was last updated, formatted as `YYYY-MM-DD HH:mm:ss` in the instance timezone.",
    ),
  },
  { required: ["id", "status"], additionalProperties: true },
);

const comparisonFilterDescription = (metric: string) =>
  `Filter by ${metric}. Prefix the value with a comparison operator (<, <=, >, >=, or <>) for range queries, for example \`>=20\`; a bare number means equals.`;

const dateRangeFields = {
  startAt: s.optional(
    s.string(
      "Only include results created on or after this ISO 8601 date or date-time, for example `2026-09-01` or `2026-09-01T00:00:00Z`.",
    ),
  ),
  endAt: s.optional(
    s.string(
      "Only include results created on or before this ISO 8601 date or date-time. A date without a time covers the whole day.",
    ),
  ),
};

const resultFilterFields = {
  ping: s.optional(
    s.union([s.string(), s.number()], { description: comparisonFilterDescription("ping in milliseconds") }),
  ),
  download: s.optional(
    s.union([s.string(), s.number()], {
      description: comparisonFilterDescription("download bandwidth in bytes per second"),
    }),
  ),
  upload: s.optional(
    s.union([s.string(), s.number()], {
      description: comparisonFilterDescription("upload bandwidth in bytes per second"),
    }),
  ),
  healthy: s.optional(s.boolean("Only include results whose benchmark evaluation matched this healthy flag.")),
  status: s.optional(s.stringEnum("Only include results with this status.", speedtestTrackerResultStatuses)),
  scheduled: s.optional(
    s.boolean(
      "Only include scheduled results (true) or manual dashboard results (false). Tests started through the API are stored as scheduled.",
    ),
  ),
  ...dateRangeFields,
};

const statsBandwidthSchema = (metric: string) =>
  s.object(
    `Aggregated ${metric} bandwidth statistics in bytes per second, with bits variants when the value is non-zero.`,
    {
      avg: s.number(`Average ${metric} bandwidth in bytes per second, rounded.`),
      avg_bits: s.number(`Average ${metric} bandwidth in bits per second, omitted when avg is 0.`),
      avg_bits_human: s.string(`Human readable average ${metric} bandwidth, omitted when avg is 0.`),
      min: s.number(`Minimum ${metric} bandwidth in bytes per second, rounded.`),
      min_bits: s.number(`Minimum ${metric} bandwidth in bits per second, omitted when min is 0.`),
      min_bits_human: s.string(`Human readable minimum ${metric} bandwidth, omitted when min is 0.`),
      max: s.number(`Maximum ${metric} bandwidth in bytes per second, rounded.`),
      max_bits: s.number(`Maximum ${metric} bandwidth in bits per second, omitted when max is 0.`),
      max_bits_human: s.string(`Human readable maximum ${metric} bandwidth, omitted when max is 0.`),
    },
    { required: ["avg", "min", "max"], additionalProperties: true },
  );

const statsSchema = s.looseRequiredObject(
  "Aggregated statistics with upstream field names. All averages are 0 when no result matches.",
  {
    total_results: s.integer("The number of results in the selected range."),
    ping: s.looseRequiredObject("Aggregated ping statistics in milliseconds.", {
      avg: s.number("Average ping, rounded to two decimals."),
      min: s.number("Minimum ping, rounded to two decimals."),
      max: s.number("Maximum ping, rounded to two decimals."),
    }),
    download: statsBandwidthSchema("download"),
    upload: statsBandwidthSchema("upload"),
  },
);

const serverSchema = s.looseRequiredObject("An Ookla speedtest server.", {
  id: s.union([s.integer(), s.string()], {
    description: "The Ookla server ID. Numeric IDs are returned as integers so they can be passed to run_speedtest.",
  }),
  host: s.string("The server host and port, for example `speedtest.example.net:8080`."),
  name: s.string("The server sponsor name."),
  location: s.string("The server city or location label."),
  country: s.string("The server country."),
});

export const speedtestTrackerActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_results",
    operationType: "read",
    description:
      "List speedtest results with optional filters, sorting, and pagination. Requires a token with the Read Results ability.",
    requiredScopes: [],
    providerPermissions: [speedtestTrackerAbilities.resultsRead],
    followUpActions: ["speedtest_tracker.get_result", "speedtest_tracker.get_stats"],
    inputSchema: s.object("The filters, sorting, and pagination for listing results.", {
      ...resultFilterFields,
      sort: s.optional(
        s.stringEnum(
          "The sort field; prefix with `-` for descending. Defaults to the instance insertion order, so use `-created_at` for newest first.",
          resultSortValues,
        ),
      ),
      page: s.optional(s.integer("The 1-based page number. Defaults to 1.", { minimum: 1 })),
      pageSize: s.optional(
        s.integer(
          "Results per page, from 1 to 500. Defaults to 25. The instance can lower the maximum through API_MAX_RESULTS.",
          { minimum: 1, maximum: 500 },
        ),
      ),
    }),
    outputSchema: s.object("The paginated result list.", {
      results: s.array("The matching results in the requested order.", resultSchema),
      pagination: s.object("Pagination details normalized from the upstream meta block.", {
        currentPage: s.integer("The current 1-based page number."),
        lastPage: s.integer("The last available page number."),
        perPage: s.integer("The page size applied by the instance."),
        total: s.integer("The total number of matching results."),
        from: s.nullableInteger("The 1-based position of the first result on this page, null when the page is empty."),
        to: s.nullableInteger("The 1-based position of the last result on this page, null when the page is empty."),
        nextPage: s.nullableInteger("The next page number, null on the last page."),
      }),
    }),
  }),
  defineProviderAction(service, {
    name: "get_result",
    operationType: "read",
    description:
      "Retrieve one speedtest result by ID. Use it to poll a test queued by run_speedtest until its status leaves the in-progress states. Requires a token with the Read Results ability.",
    requiredScopes: [],
    providerPermissions: [speedtestTrackerAbilities.resultsRead],
    asyncLifecycle: {
      startActionId: "speedtest_tracker.run_speedtest",
      statusActionId: "speedtest_tracker.get_result",
    },
    inputSchema: s.object("The result to retrieve.", {
      id: s.positiveInteger("The result ID."),
    }),
    outputSchema: s.object("The retrieved result.", {
      result: resultSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_latest_result",
    operationType: "read",
    description:
      "Retrieve the most recent speedtest result, optionally narrowed by the same filters as list_results, for example status `completed` for the last successful test. Requires a token with the Read Results ability.",
    requiredScopes: [],
    providerPermissions: [speedtestTrackerAbilities.resultsRead],
    followUpActions: ["speedtest_tracker.list_results", "speedtest_tracker.run_speedtest"],
    inputSchema: s.object("Optional filters applied before picking the newest result.", {
      ...resultFilterFields,
    }),
    outputSchema: s.object("The newest matching result.", {
      result: s.nullable(resultSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "run_speedtest",
    operationType: "write",
    description:
      "Queue a new Ookla speedtest on the instance and return the queued result immediately. Poll get_result with the returned ID until the status is completed, failed, or skipped. Requires a token with the Run Speedtest ability.",
    requiredScopes: [],
    providerPermissions: [speedtestTrackerAbilities.speedtestsRun],
    followUpActions: ["speedtest_tracker.get_result"],
    asyncLifecycle: {
      startActionId: "speedtest_tracker.run_speedtest",
      statusActionId: "speedtest_tracker.get_result",
    },
    inputSchema: s.object("The speedtest to queue.", {
      serverId: s.optional(
        s.positiveInteger(
          "The Ookla server ID to test against, from list_servers. Omit to let the instance choose a server.",
        ),
      ),
    }),
    outputSchema: s.object("The queued speedtest.", {
      result: resultSchema,
      message: s.string("The upstream confirmation message, normally `Speedtest added to the queue.`."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_stats",
    operationType: "read",
    description:
      "Retrieve aggregated ping, download, and upload statistics, optionally limited to a date range. Requires a token with the Read Results ability.",
    requiredScopes: [],
    providerPermissions: [speedtestTrackerAbilities.resultsRead],
    followUpActions: ["speedtest_tracker.list_results"],
    inputSchema: s.object("The optional date range for the statistics.", {
      ...dateRangeFields,
    }),
    outputSchema: s.object("The aggregated statistics.", {
      stats: statsSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_servers",
    operationType: "read",
    description:
      "List nearby Ookla speedtest servers as seen by the instance, for choosing a serverId for run_speedtest. Requires a token with the List Servers ability.",
    requiredScopes: [],
    providerPermissions: [speedtestTrackerAbilities.ooklaListServers],
    followUpActions: ["speedtest_tracker.run_speedtest"],
    inputSchema: s.object("Listing servers needs no input.", {}),
    outputSchema: s.object("The available Ookla servers.", {
      servers: s.array("The servers returned by the instance, empty when it cannot reach Ookla.", serverSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "check_health",
    operationType: "read",
    description:
      "Check that the Speedtest Tracker instance is reachable and running through its unauthenticated health check endpoint.",
    requiredScopes: [],
    inputSchema: s.object("The health check needs no input.", {}),
    outputSchema: s.object("The health check response.", {
      message: s.string("The upstream health message, normally `Speedtest Tracker is running!`."),
    }),
  }),
];
