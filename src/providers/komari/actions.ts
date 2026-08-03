import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "komari";

const nodeSchema = s.looseRequiredObject(
  "A Komari node with public inventory fields. Sensitive client tokens are never returned.",
  {
    uuid: s.string("The node UUID."),
    name: s.string("The node display name."),
    cpu_name: s.string("The CPU model reported by the node."),
    cpu_cores: s.integer("The number of logical CPU cores."),
    os: s.string("The node operating system."),
    arch: s.string("The node architecture."),
    region: s.string("The configured node region."),
    mem_total: s.integer("Total memory in bytes."),
    swap_total: s.integer("Total swap in bytes."),
    disk_total: s.integer("Total disk capacity in bytes."),
    group: s.string("The configured node group."),
    tags: s.string("The semicolon-delimited node tags."),
    hidden: s.boolean("Whether the node is hidden from unauthenticated visitors."),
  },
  {
    optional: [
      "uuid",
      "name",
      "cpu_name",
      "cpu_cores",
      "os",
      "arch",
      "region",
      "mem_total",
      "swap_total",
      "disk_total",
      "group",
      "tags",
      "hidden",
    ],
  },
);

const metricRecordSchema = s.looseObject(
  "A Komari metric record. Available fields depend on the requested load type and can include CPU percentage, byte counts, temperatures, network totals, processes, and connection counts.",
);

const pingRecordSchema = s.looseRequiredObject(
  "A Komari ping measurement. A negative value represents packet loss.",
  {
    task_id: s.integer("The ping task ID."),
    time: s.dateTime("When the measurement was recorded."),
    value: s.integer("Latency in milliseconds, or a negative value for packet loss."),
    client: s.string("The reporting node UUID."),
  },
  { optional: ["task_id", "client"] },
);

const pingTaskSchema = s.looseRequiredObject(
  "A Komari ping task or task summary.",
  {
    id: s.integer("The ping task ID."),
    name: s.string("The ping task name."),
    type: s.string("The ping protocol, such as icmp, tcp, or http."),
    interval: s.integer("The collection interval in seconds."),
    default_on: s.boolean("Whether the task applies to newly registered nodes by default."),
  },
  { optional: ["default_on"] },
);

const hoursSchema = s.integer("Number of recent hours to query.", { minimum: 1, maximum: 168, default: 4 });

const pingHistoryOutputSchema = s.object("Komari ping measurements and aggregate summaries.", {
  count: s.nonNegativeInteger("Number of returned measurements."),
  records: s.array("Ping measurements returned by Komari.", pingRecordSchema),
  basicInfo: s.array("Per-node loss and latency summaries.", s.looseObject("A per-node ping summary.")),
  tasks: s.array("Task-level loss and latency summaries.", pingTaskSchema),
});

export const komariActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_version",
    description: "Get the Komari server version and build hash.",
    inputSchema: s.object("Input for reading the Komari version.", {}),
    outputSchema: s.object("Komari server version information.", {
      version: s.string("The Komari release version."),
      hash: s.nullableString("The build or commit hash when available."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_nodes",
    description: "List nodes visible to the configured Komari API key without exposing client tokens.",
    inputSchema: s.object("Input for listing Komari nodes.", {}),
    outputSchema: s.object("Nodes returned by Komari.", {
      nodes: s.array("Komari nodes.", nodeSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_recent_metrics",
    description: "Get the short in-memory window of recent reports for a Komari node.",
    inputSchema: s.object("Input for reading recent node reports.", {
      uuid: s.uuid("The Komari node UUID."),
    }),
    outputSchema: s.object("Recent reports for the node.", {
      records: s.array("Recent report objects returned by Komari.", metricRecordSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_load_history",
    description: "Get persisted load and resource metrics for a Komari node over a recent time window.",
    inputSchema: s.object(
      "Input for reading historical node metrics.",
      {
        uuid: s.uuid("The Komari node UUID."),
        loadType: s.stringEnum("Metric projection to return. Use all for complete records.", [
          "all",
          "cpu",
          "ram",
          "swap",
          "load",
          "temp",
          "disk",
          "network",
          "process",
          "connections",
        ]),
        hours: hoursSchema,
      },
      { optional: ["loadType", "hours"] },
    ),
    outputSchema: s.object(
      "Historical metrics returned by Komari.",
      {
        count: s.nonNegativeInteger("Number of returned metric records."),
        records: s.array("Metric records returned by Komari.", metricRecordSchema),
        loadType: s.nullableString("The metric projection applied by Komari."),
        hasGpuData: s.boolean("Whether Komari included GPU device history."),
        gpuDevices: s.unknownObject("GPU histories keyed by device index when available."),
      },
      { optional: ["loadType", "hasGpuData", "gpuDevices"] },
    ),
  }),
  defineProviderAction(service, {
    name: "list_ping_tasks",
    description: "List public Komari latency-monitoring tasks.",
    inputSchema: s.object("Input for listing Komari ping tasks.", {}),
    outputSchema: s.object("Komari ping tasks.", {
      tasks: s.array("Configured public ping tasks.", pingTaskSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_node_ping_history",
    description: "Get recent ping measurements and task summaries for one Komari node.",
    inputSchema: s.object(
      "Input for reading ping history by node.",
      {
        uuid: s.uuid("The Komari node UUID."),
        hours: hoursSchema,
      },
      { optional: ["hours"] },
    ),
    outputSchema: pingHistoryOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_task_ping_history",
    description: "Get recent ping measurements and per-node summaries for one Komari ping task.",
    inputSchema: s.object(
      "Input for reading ping history by task.",
      {
        taskId: s.positiveInteger("The Komari ping task ID."),
        hours: hoursSchema,
      },
      { optional: ["hours"] },
    ),
    outputSchema: pingHistoryOutputSchema,
  }),
];
