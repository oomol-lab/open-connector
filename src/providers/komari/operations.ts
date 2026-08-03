import type { JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";

export type KomariResultMode =
  | "passthrough"
  | "success"
  | "safe_node"
  | "safe_nodes"
  | "safe_admin_node"
  | "safe_admin_nodes"
  | "safe_sessions"
  | "load_history"
  | "ping_history";

export interface KomariOperation {
  name: string;
  rpcMethod: `public:${string}` | `admin:${string}`;
  description: string;
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
  resultMode?: KomariResultMode;
  resultKey?: string;
  paramsArrayField?: string;
  stringifyFields?: readonly string[];
}

const emptyInput = s.object("This operation takes no input.", {});
const successOutput = s.object("Operation result.", { success: s.boolean("Whether Komari completed the operation.") });
const looseItem = s.looseObject("A Komari resource object.");
const uuidInput = s.requiredObject("Select a Komari client.", { uuid: s.uuid("The client UUID.") });
const taskIdInput = s.requiredObject("Select an execution task.", {
  task_id: s.string("The execution task ID."),
});
const idsInput = s.requiredObject("Select resources by ID.", {
  id: s.array("Resource IDs.", s.positiveInteger("A resource ID."), { minItems: 1 }),
});
const clientsInput = s.requiredObject("Select Komari clients.", {
  clients: s.array("Client UUIDs.", s.uuid("A client UUID."), { minItems: 1 }),
});

const nodeSchema = s.looseObject("A Komari node. Client tokens are omitted unless get_client_token is used.", {
  uuid: s.uuid("The node UUID."),
  name: s.string("The node display name."),
  os: s.string("The node operating system."),
  arch: s.string("The node architecture."),
  region: s.string("The configured region."),
});
const metricRecordSchema = s.looseObject("A Komari monitoring metric record.");
const pingRecordSchema = s.looseObject("A ping measurement.", {
  task_id: s.integer("The ping task ID."),
  time: s.dateTime("Measurement time."),
  value: s.integer("Latency in milliseconds, or a negative value for packet loss."),
  client: s.uuid("The reporting client UUID."),
});
const pingTaskSchema = s.looseObject("A configured ping task.", {
  id: s.integer("The ping task ID."),
  name: s.string("The task name."),
  type: s.string("The ping protocol."),
  target: s.string("The ping target."),
  interval: s.integer("The interval in seconds."),
});
const pingTaskSummarySchema = s.looseObject("A task-level ping summary.", {
  id: s.integer("The ping task ID."),
  name: s.string("The task name."),
  type: s.string("The ping protocol."),
  interval: s.integer("The interval in seconds."),
  default_on: s.boolean("Whether the task applies to new clients by default."),
  clients: s.array("Assigned client UUIDs when returned.", s.uuid("A client UUID.")),
  total: s.integer("Number of measurements."),
  loss: s.number("Packet-loss percentage."),
  min: s.integer("Minimum successful latency."),
  max: s.integer("Maximum successful latency."),
  avg: s.integer("Average successful latency."),
});
const metricDefinitionSchema = s.looseObject("A metric definition and retention policy.", {
  name: s.string("The metric name."),
  type: s.string("The metric type."),
  unit: s.string("The metric unit."),
  retention_days: s.nonNegativeInteger("Retention period in days; zero disables storage."),
});
const sessionSummarySchema = s.object(
  "A login session with its secret token and IP addresses redacted.",
  {
    session_id: s.string("Stable SHA-256 identifier derived from the session token."),
    uuid: s.uuid("The user UUID."),
    login_method: s.string("The login method."),
    latest_online: s.dateTime("Most recent activity time."),
    expires: s.dateTime("Session expiration time."),
    created_at: s.dateTime("Session creation time."),
    current: s.boolean("Whether this is the current session."),
  },
  { optional: ["uuid", "login_method", "latest_online", "expires", "created_at"] },
);

function listOutput(key: string, description: string, item: JsonSchema = looseItem): JsonSchema {
  return s.object(description, { [key]: s.array(description, item) });
}

function dataOutput(description: string): JsonSchema {
  return s.object(description, { data: s.unknown(description) });
}

function operation(
  name: string,
  rpcMethod: KomariOperation["rpcMethod"],
  description: string,
  inputSchema: JsonSchema = emptyInput,
  outputSchema: JsonSchema = dataOutput("Komari response."),
  options: Omit<KomariOperation, "name" | "rpcMethod" | "description" | "inputSchema" | "outputSchema"> = {},
): KomariOperation {
  return { name, rpcMethod, description, inputSchema, outputSchema, ...options };
}

export const komariOperations: readonly KomariOperation[] = [
  // Public monitoring API.
  operation(
    "get_current_user",
    "public:getMe",
    "Get the current Komari user or guest identity.",
    emptyInput,
    s.looseObject("Current user identity."),
  ),
  operation(
    "list_nodes",
    "public:getNodesInformation",
    "List visible Komari nodes without client tokens or private address fields.",
    emptyInput,
    listOutput("nodes", "Visible Komari nodes.", nodeSchema),
    { resultMode: "safe_nodes" },
  ),
  operation(
    "get_public_settings",
    "public:getPublicSettings",
    "Get settings that Komari exposes to its public frontend.",
    emptyInput,
    s.looseObject("Public Komari settings."),
  ),
  operation(
    "get_version",
    "public:getVersion",
    "Get the Komari server version and build hash.",
    emptyInput,
    s.object("Komari version.", {
      version: s.string("Release version."),
      hash: s.nullableString("Build hash when available."),
    }),
  ),
  operation(
    "get_recent_metrics",
    "public:getClientRecentRecords",
    "Get the short in-memory window of recent reports for a node.",
    uuidInput,
    listOutput("records", "Recent node reports.", metricRecordSchema),
    { resultKey: "records" },
  ),
  operation(
    "get_load_history",
    "public:getRecordsByUUID",
    "Get persisted resource metrics for a node.",
    s.object(
      "Historical metric query.",
      {
        uuid: s.uuid("Client UUID."),
        load_type: s.stringEnum("Metric projection.", [
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
        hours: s.positiveInteger("Recent hours to query.", { maximum: 168 }),
      },
      { optional: ["load_type", "hours"] },
    ),
    s.object(
      "Historical metrics.",
      {
        count: s.nonNegativeInteger("Record count."),
        records: s.array("Metric records.", metricRecordSchema),
        load_type: s.nullableString("Applied projection."),
        has_gpu_data: s.boolean("Whether GPU history is present."),
        gpu_devices: s.unknownObject("GPU histories keyed by device index."),
      },
      { optional: ["load_type", "has_gpu_data", "gpu_devices"] },
    ),
    { resultMode: "load_history", stringifyFields: ["hours"] },
  ),
  operation(
    "get_ping_history",
    "public:getPingRecords",
    "Get ping records by node, task, or both.",
    {
      type: "object",
      description: "Select ping history by client UUID, task ID, or both, with an optional recent-hours window.",
      properties: {
        uuid: s.uuid("Client UUID."),
        task_id: s.positiveInteger("Ping task ID."),
        hours: s.positiveInteger("Recent hours to query.", { maximum: 168 }),
      },
      anyOf: [{ required: ["uuid"] }, { required: ["task_id"] }],
      additionalProperties: false,
    },
    s.object("Ping records and summaries.", {
      count: s.nonNegativeInteger("Record count."),
      records: s.array("Ping measurements.", pingRecordSchema),
      basic_info: s.array("Per-client summaries.", looseItem),
      tasks: s.array("Per-task summaries.", pingTaskSummarySchema),
    }),
    { resultMode: "ping_history", stringifyFields: ["task_id", "hours"] },
  ),
  operation(
    "list_public_ping_tasks",
    "public:getPublicPingTasks",
    "List ping tasks using the public response shape.",
    emptyInput,
    listOutput("tasks", "Public ping tasks.", pingTaskSchema),
    { resultKey: "tasks" },
  ),
  operation(
    "list_public_metric_definitions",
    "public:listMetricDefinitions",
    "List public metric definitions and retention policies.",
    emptyInput,
    listOutput("metrics", "Public metric definitions.", metricDefinitionSchema),
    { resultKey: "metrics" },
  ),
  operation(
    "query_metrics",
    "public:queryMetrics",
    "Query metric time-series points with filters, aggregation, and downsampling.",
    s.looseRequiredObject(
      "Komari metric query. Use metric_keys plus optional entity_ids, time bounds, tags, aggregation, and point limits.",
      { metric_keys: s.array("Metric keys to query.", s.string("A metric key."), { minItems: 1 }) },
    ),
    s.looseObject("Metric query response."),
  ),
  operation(
    "get_ping_metric_stats",
    "public:getPingMetricStats",
    "Get aggregate latency, loss, percentile, and standard-deviation statistics.",
    s.looseObject("Ping statistics query with optional entity, task, time, and point filters."),
    s.looseObject("Ping metric statistics."),
  ),
  operation(
    "record_visitor_event",
    "public:recordVisitorEvent",
    "Record a bounded visitor audit event in Komari.",
    s.object(
      "Visitor event.",
      {
        event: s.string("Short event name.", { maxLength: 64 }),
        path: s.string("Frontend path.", { maxLength: 512 }),
        route: s.string("Frontend route.", { maxLength: 128 }),
        target: s.string("Optional target identifier.", { maxLength: 128 }),
        detail: s.looseObject("Bounded event metadata."),
      },
      { optional: ["path", "route", "target", "detail"] },
    ),
    s.looseObject("Visitor audit status."),
  ),

  // Client administration.
  operation(
    "add_client",
    "admin:addClient",
    "Create a Komari client. The response contains its enrollment token.",
    s.object("New client.", { name: s.string("Optional client name.") }, { optional: ["name"] }),
    s.looseObject("Created client identity and token."),
  ),
  operation(
    "edit_client",
    "admin:editClient",
    "Update client fields. This changes Komari configuration.",
    s.looseRequiredObject("Partial client fields to update.", { uuid: s.uuid("The client UUID.") }),
    successOutput,
    { resultMode: "success" },
  ),
  operation(
    "remove_client",
    "admin:removeClient",
    "Permanently delete a client and its runtime state.",
    uuidInput,
    successOutput,
    { resultMode: "success" },
  ),
  operation(
    "get_client",
    "admin:getClient",
    "Get one client without returning its enrollment token.",
    uuidInput,
    s.object("Client details.", { client: nodeSchema }),
    { resultMode: "safe_admin_node", resultKey: "client" },
  ),
  operation(
    "list_clients",
    "admin:listClients",
    "List all clients without returning enrollment tokens.",
    emptyInput,
    listOutput("clients", "Komari clients.", nodeSchema),
    { resultMode: "safe_admin_nodes", resultKey: "clients" },
  ),
  operation(
    "get_client_token",
    "admin:getClientToken",
    "Get a client enrollment token. Treat the response as a secret.",
    uuidInput,
    s.looseObject("Client enrollment token."),
  ),
  operation("clear_records", "admin:clearRecords", "Permanently delete all load records.", emptyInput, successOutput, {
    resultMode: "success",
  }),

  // Clipboard.
  operation(
    "get_clipboard",
    "admin:getClipboard",
    "Get one clipboard entry.",
    s.requiredObject("Clipboard selector.", { id: s.positiveInteger("Clipboard ID.") }),
    s.looseObject("Clipboard entry."),
    { stringifyFields: ["id"] },
  ),
  operation(
    "list_clipboard",
    "admin:listClipboard",
    "List clipboard entries.",
    emptyInput,
    listOutput("entries", "Clipboard entries."),
    { resultKey: "entries" },
  ),
  operation(
    "create_clipboard",
    "admin:createClipboard",
    "Create a clipboard entry.",
    s.looseObject("Clipboard fields such as name, text, weight, and remark."),
    s.looseObject("Created clipboard entry."),
  ),
  operation(
    "update_clipboard",
    "admin:updateClipboard",
    "Update a clipboard entry.",
    s.looseRequiredObject("Clipboard ID and fields to update.", { id: s.positiveInteger("Clipboard ID.") }),
    successOutput,
    { resultMode: "success", stringifyFields: ["id"] },
  ),
  operation(
    "delete_clipboard",
    "admin:deleteClipboard",
    "Delete a clipboard entry.",
    s.requiredObject("Clipboard selector.", { id: s.positiveInteger("Clipboard ID.") }),
    successOutput,
    { resultMode: "success", stringifyFields: ["id"] },
  ),
  operation(
    "batch_delete_clipboard",
    "admin:batchDeleteClipboard",
    "Delete multiple clipboard entries.",
    s.requiredObject("Clipboard selectors.", {
      ids: s.array("Clipboard IDs.", s.positiveInteger("Clipboard ID."), { minItems: 1 }),
    }),
    successOutput,
    { resultMode: "success" },
  ),

  // Database and metrics administration.
  operation(
    "get_database_size",
    "admin:getDatabaseSize",
    "Inspect main and monitoring database storage.",
    emptyInput,
    s.looseObject("Database storage status."),
  ),
  operation(
    "vacuum_database",
    "admin:vacuumDatabase",
    "Run database maintenance and reclaim storage space.",
    emptyInput,
    s.looseObject("Database maintenance result."),
  ),
  operation(
    "list_metric_definitions",
    "admin:listMetricDefinitions",
    "List all metric definitions and retention policies.",
    emptyInput,
    listOutput("metrics", "Metric definitions.", metricDefinitionSchema),
    { resultKey: "metrics" },
  ),
  operation(
    "update_metric_definition",
    "admin:updateMetricDefinition",
    "Change a metric retention policy; zero deletes stored data for that metric.",
    s.requiredObject("Metric retention update.", {
      name: s.string("Metric name."),
      retention_days: s.nonNegativeInteger("Retention in days; zero disables storage."),
    }),
    s.looseObject("Updated metric definition."),
  ),
  operation(
    "get_metric_migration_status",
    "admin:getMetricMigrationStatus",
    "Get metric-store migration progress.",
    emptyInput,
    s.looseObject("Migration status."),
  ),
  operation(
    "start_metric_migration",
    "admin:startMetricMigration",
    "Start migrating metrics from a source store into the current store.",
    s.object(
      "Migration source.",
      {
        source_driver: s.string("Optional source driver."),
        source_dsn: s.string("Optional source DSN; treat as sensitive."),
      },
      { optional: ["source_driver", "source_dsn"] },
    ),
    s.looseObject("Migration start status."),
  ),
  operation(
    "cancel_metric_migration",
    "admin:cancelMetricMigration",
    "Cancel the active metric-store migration.",
    emptyInput,
    s.looseObject("Migration cancel status."),
  ),

  // Sessions and global settings.
  operation(
    "list_sessions",
    "admin:getSessions",
    "List login sessions using stable identifiers while redacting session tokens and IP addresses.",
    emptyInput,
    s.object("Redacted login sessions.", {
      current_session_id: s.nullableString("Stable identifier for the current session, when available."),
      sessions: s.array("Redacted login sessions.", sessionSummarySchema),
    }),
    { resultMode: "safe_sessions" },
  ),
  operation(
    "delete_session",
    "admin:deleteSession",
    "Revoke one login session using the stable identifier returned by list_sessions.",
    s.requiredObject("Session selector.", {
      session_id: s.string("Stable session identifier returned by list_sessions.", {
        minLength: 64,
        maxLength: 64,
        pattern: "^[0-9a-f]{64}$",
      }),
    }),
    successOutput,
    { resultMode: "success" },
  ),
  operation("delete_all_sessions", "admin:deleteAllSessions", "Revoke all login sessions.", emptyInput, successOutput, {
    resultMode: "success",
  }),
  operation(
    "get_settings",
    "admin:getSettings",
    "Get all Komari settings. The result can contain secrets and database DSNs.",
    emptyInput,
    s.looseObject("Komari settings."),
  ),
  operation(
    "edit_settings",
    "admin:editSettings",
    "Update arbitrary Komari settings; invalid database settings can disrupt service.",
    s.looseObject("Setting keys and replacement values."),
    successOutput,
    { resultMode: "success" },
  ),
  operation(
    "clear_all_records",
    "admin:clearAllRecords",
    "Permanently delete all load and ping records.",
    emptyInput,
    successOutput,
    { resultMode: "success" },
  ),
  operation(
    "order_clients",
    "admin:orderClients",
    "Set client display weights using a UUID-to-weight map.",
    s.record("Client UUIDs mapped to integer weights.", s.integer("Display weight.")),
    successOutput,
    { resultMode: "success" },
  ),

  // Notifications.
  operation(
    "add_load_notification",
    "admin:addLoadNotification",
    "Create a load notification rule.",
    s.object(
      "Load notification.",
      {
        clients: s.array("Client UUIDs.", s.uuid("Client UUID."), { minItems: 1 }),
        name: s.string("Rule name."),
        metric: s.string("Metric name."),
        threshold: s.number("Trigger threshold."),
        ratio: s.number("Required time ratio from zero to one.", { exclusiveMinimum: 0, maximum: 1 }),
        interval: s.integer("Evaluation interval in minutes.", { minimum: 1, maximum: 240 }),
      },
      { optional: ["name"] },
    ),
    s.looseObject("Created load notification ID."),
  ),
  operation(
    "delete_load_notification",
    "admin:deleteLoadNotification",
    "Delete load notification rules.",
    idsInput,
    successOutput,
    { resultMode: "success" },
  ),
  operation(
    "edit_load_notification",
    "admin:editLoadNotification",
    "Replace load notification rule fields.",
    s.requiredObject("Load notification updates.", {
      notifications: s.array("Rules to update.", looseItem, { minItems: 1 }),
    }),
    successOutput,
    { resultMode: "success" },
  ),
  operation(
    "list_load_notifications",
    "admin:getAllLoadNotifications",
    "List load notification rules.",
    emptyInput,
    listOutput("notifications", "Load notification rules."),
    { resultKey: "notifications" },
  ),
  operation(
    "list_offline_notifications",
    "admin:listOfflineNotifications",
    "List offline notification rules.",
    emptyInput,
    listOutput("notifications", "Offline notification rules."),
    { resultKey: "notifications" },
  ),
  operation(
    "edit_offline_notifications",
    "admin:editOfflineNotification",
    "Replace offline notification rule fields.",
    s.requiredObject("Offline notification updates.", {
      notifications: s.array("Rules to update.", looseItem, { minItems: 1 }),
    }),
    successOutput,
    { resultMode: "success", paramsArrayField: "notifications" },
  ),
  operation(
    "enable_offline_notifications",
    "admin:enableOfflineNotification",
    "Enable offline notifications for clients.",
    clientsInput,
    successOutput,
    { resultMode: "success", paramsArrayField: "clients" },
  ),
  operation(
    "disable_offline_notifications",
    "admin:disableOfflineNotification",
    "Disable offline notifications for clients.",
    clientsInput,
    successOutput,
    { resultMode: "success", paramsArrayField: "clients" },
  ),
  operation(
    "list_traffic_report_notifications",
    "admin:listTrafficReportNotifications",
    "List traffic-report rules.",
    emptyInput,
    listOutput("notifications", "Traffic report rules."),
    { resultKey: "notifications" },
  ),
  operation(
    "edit_traffic_report_notifications",
    "admin:editTrafficReportNotifications",
    "Replace traffic-report rule fields.",
    s.requiredObject("Traffic report updates.", {
      notifications: s.array("Rules to update.", looseItem, { minItems: 1 }),
    }),
    successOutput,
    { resultMode: "success", paramsArrayField: "notifications" },
  ),
  operation(
    "enable_traffic_report_notifications",
    "admin:enableTrafficReportNotifications",
    "Enable traffic reports for clients.",
    clientsInput,
    successOutput,
    { resultMode: "success", paramsArrayField: "clients" },
  ),
  operation(
    "disable_traffic_report_notifications",
    "admin:disableTrafficReportNotifications",
    "Disable traffic reports for clients.",
    clientsInput,
    successOutput,
    { resultMode: "success", paramsArrayField: "clients" },
  ),

  // Ping task administration.
  operation(
    "add_ping_task",
    "admin:addPingTask",
    "Create a ping task.",
    s.object(
      "New ping task.",
      {
        clients: s.array("Client UUIDs.", s.uuid("Client UUID.")),
        default_on: s.boolean("Apply to new clients by default."),
        name: s.string("Task name."),
        target: s.string("Ping target."),
        type: s.stringEnum("Ping protocol.", ["icmp", "tcp", "http"]),
        interval: s.positiveInteger("Interval in seconds."),
      },
      { optional: ["clients", "default_on"] },
    ),
    s.looseObject("Created ping task ID."),
  ),
  operation(
    "delete_ping_tasks",
    "admin:deletePingTask",
    "Delete ping tasks and their records.",
    idsInput,
    successOutput,
    { resultMode: "success" },
  ),
  operation(
    "edit_ping_tasks",
    "admin:editPingTask",
    "Replace ping task fields.",
    s.requiredObject("Ping task updates.", {
      tasks: s.array("Tasks to update.", pingTaskSchema, { minItems: 1 }),
    }),
    successOutput,
    { resultMode: "success" },
  ),
  operation(
    "list_ping_tasks",
    "admin:getAllPingTasks",
    "List all ping tasks including targets.",
    emptyInput,
    listOutput("tasks", "Ping tasks.", pingTaskSchema),
    { resultKey: "tasks" },
  ),
  operation(
    "order_ping_tasks",
    "admin:orderPingTask",
    "Set ping-task weights using an ID-to-weight map.",
    s.record("Ping task IDs mapped to weights.", s.integer("Display weight.")),
    successOutput,
    { resultMode: "success" },
  ),

  // Provider configuration.
  operation(
    "get_message_sender_provider",
    "admin:getMessageSenderProvider",
    "Get one message-sender configuration or list available templates. The result may contain secrets.",
    s.object("Provider selector.", { provider: s.string("Optional provider name.") }, { optional: ["provider"] }),
    dataOutput("Message-sender configuration or templates."),
    { resultKey: "data" },
  ),
  operation(
    "set_message_sender_provider",
    "admin:setMessageSenderProvider",
    "Save and possibly reload a message-sender provider configuration.",
    s.object(
      "Message-sender provider.",
      {
        name: s.string("Provider name."),
        addition: s.string("Provider-specific JSON configuration; may contain secrets."),
      },
      { optional: ["addition"] },
    ),
    s.looseObject("Configuration status."),
  ),
  operation(
    "get_oidc_provider",
    "admin:getOidcProvider",
    "Get one OIDC configuration or list templates. The result may contain client secrets.",
    s.object("Provider selector.", { provider: s.string("Optional provider name.") }, { optional: ["provider"] }),
    dataOutput("OIDC configuration or templates."),
    { resultKey: "data" },
  ),
  operation(
    "set_oidc_provider",
    "admin:setOidcProvider",
    "Save and possibly reload an OIDC provider configuration.",
    s.object(
      "OIDC provider.",
      {
        name: s.string("Provider name."),
        addition: s.string("Provider-specific JSON configuration; may contain secrets."),
      },
      { optional: ["addition"] },
    ),
    s.looseObject("Configuration status."),
  ),

  // System, remote execution, and task results.
  operation(
    "list_audit_logs",
    "admin:getLogs",
    "List paged audit logs.",
    s.object(
      "Audit log page.",
      {
        limit: s.positiveInteger("Page size.", { maximum: 500 }),
        page: s.positiveInteger("One-based page number."),
        msg_type: s.string("Optional exact message type."),
      },
      { optional: ["limit", "page", "msg_type"] },
    ),
    s.looseObject("Audit log page."),
    { stringifyFields: ["limit", "page"] },
  ),
  operation(
    "execute_command",
    "admin:exec",
    "DANGEROUS: execute a shell command on selected clients. Komari API keys bypass interactive 2FA for this sensitive RPC.",
    s.requiredObject("Remote command.", {
      command: s.string("Shell command to execute."),
      clients: s.array("Target client UUIDs.", s.uuid("Client UUID."), { minItems: 1 }),
    }),
    s.looseObject("Execution task and connected clients."),
  ),
  operation(
    "test_message_sender",
    "admin:testSendMessage",
    "Send a test notification through the active message sender.",
    emptyInput,
    successOutput,
    { resultMode: "success" },
  ),
  operation(
    "test_geoip",
    "admin:testGeoip",
    "Test Komari GeoIP lookup.",
    s.object("GeoIP query.", { ip: s.string("IP address; defaults to the caller address.") }, { optional: ["ip"] }),
    s.looseObject("GeoIP lookup result."),
  ),
  operation(
    "list_execution_tasks",
    "admin:getTasks",
    "List remote execution tasks and their results, which may contain command output.",
    emptyInput,
    listOutput("tasks", "Execution tasks."),
    { resultKey: "tasks" },
  ),
  operation(
    "get_execution_task",
    "admin:getTaskById",
    "Get one remote execution task and its results.",
    taskIdInput,
    s.looseObject("Execution task."),
  ),
  operation(
    "list_client_execution_tasks",
    "admin:getTasksByClientId",
    "List execution tasks assigned to a client.",
    uuidInput,
    listOutput("tasks", "Client execution tasks."),
    { resultKey: "tasks" },
  ),
  operation(
    "get_client_task_result",
    "admin:getSpecificTaskResult",
    "Get one client's result for an execution task.",
    s.requiredObject("Task result selector.", {
      task_id: s.string("Execution task ID."),
      uuid: s.uuid("Client UUID."),
    }),
    s.looseObject("Execution result."),
  ),
  operation(
    "list_task_results",
    "admin:getTaskResultsByTaskId",
    "List all client results for an execution task.",
    taskIdInput,
    listOutput("results", "Execution results."),
    { resultKey: "results" },
  ),

  // Terminal appearance.
  operation(
    "get_terminal_settings",
    "admin:getXtermjsSettings",
    "Get xterm.js terminal appearance settings.",
    emptyInput,
    s.looseObject("Terminal settings."),
  ),
  operation(
    "set_terminal_settings",
    "admin:setXtermjsSettings",
    "Update xterm.js terminal appearance settings, including optional custom CSS.",
    s.looseObject("xterm.js terminalOptions, terminalPadding, transparentBackground, and customCss."),
    s.looseObject("Normalized terminal settings."),
  ),
];
