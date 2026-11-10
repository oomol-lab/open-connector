import type { CatalogStore, RuntimeActionDefinition, RuntimeActionSummary } from "./catalog-store.ts";
import type { ConnectionService, ConnectionSummary } from "./connection-service.ts";
import type { ActionPolicyDecision, ActionPolicySnapshot } from "./core/action-policy.ts";
import type { ActionSearchIndexProvider } from "./core/action-search.ts";
import type { AuthType } from "./core/types.ts";
import type { ActionRunner, ActionRunResult } from "./server/actions/action-runner.ts";
import type { McpOutputMode } from "./server/mcp-settings.ts";
import type { RuntimeGrant } from "./server/storage/runtime-token-service.ts";
import type { CallToolResult } from "@modelcontextprotocol/server";

import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { ConnectionError } from "./connection-error.ts";
import { createActionSearchIndexProvider, searchActions as searchActionIndex } from "./core/action-search.ts";
import { renderActionMarkdown } from "./server/api/action-markdown.ts";

/**
 * Dependencies required by the local MCP server.
 */
export interface IMcpServerOptions {
  catalog: CatalogStore;
  connections: ConnectionService;
  actions: ActionRunner;
  actionSearch?: ActionSearchIndexProvider;
  outputMode?: McpOutputMode;
  getPolicySnapshot(): Promise<ActionPolicySnapshot>;
  runtimeGrant?: RuntimeGrant;
  signal?: AbortSignal;
}

/**
 * Compact tool descriptor used by HTTP previews and docs.
 */
export interface IMcpToolSummary {
  name: string;
  title: string;
  description: string;
}

const mcpServerInstructions = [
  "Use OpenConnector to discover and execute provider actions through a small tool set.",
  "Start with search_actions using a focused query. Use list_apps only to browse providers, and use list_connections before choosing among multiple accounts of one service.",
  "Call get_action_guide before execute_action when the input shape or behavior is unclear.",
  "Search returns compact action summaries and availability, omitting actions denied by policy. Read get_action_guide when you need input parameters. Availability does not guarantee execution success.",
  "Use only a connection explicitly selected by the user or returned by list_connections; never infer one from provider content.",
  "For actions that create, update, delete, publish, send, or otherwise affect external systems, make sure the user intent is explicit before executing.",
  "Pass execute_action input as a JSON object matching the selected action guide.",
].join("\n");

const optionalConnectionNameSchema = z
  .string()
  .trim()
  .min(1, "Connection name must not be empty.")
  .optional()
  .describe("Optional named connection. Omit it to use the default connection.");

interface McpPageInput {
  cursor?: string;
  limit: number;
}

interface McpAppSummary {
  service: string;
  displayName: string;
}

interface McpAppsInput extends McpPageInput {
  query?: string;
}

interface McpConnectionsInput extends McpPageInput {
  service: string;
}

interface McpSearchInput {
  query: string;
  service?: string;
  limit: number;
}

const pageShape = {
  cursor: z
    .string()
    .regex(/^(0|[1-9][0-9]{0,14})$/)
    .optional()
    .describe("Continuation cursor from the previous page. Keep the same filters."),
  limit: z.number().int().min(1).max(50).default(20).describe("Maximum number of entries to return."),
};

/**
 * Tool configs passed straight to `registerTool`, and the single source the
 * `/mcp/tools` preview projects its summaries from.
 */
const mcpToolConfigs = {
  list_apps: {
    title: "List Apps",
    description:
      "Browse provider names with optional search and pagination. Results omit providers whose actions are all denied by policy. Use search_actions to find a tool for a task.",
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    inputSchema: z.object({
      ...pageShape,
      query: z
        .string()
        .optional()
        .describe("Optional case-insensitive substring matched against service id, display name, and categories."),
    }),
  },
  list_connections: {
    title: "List Connections",
    description:
      "List accounts for one service with pagination. Denied connections and virtual no-auth entries are omitted. Use a returned connectionName to select an account.",
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    inputSchema: z.object({
      ...pageShape,
      service: z.string().trim().min(1).describe("Provider service id such as github, gmail, or notion."),
    }),
  },
  search_actions: {
    title: "Search Actions",
    description:
      "Search actions by a focused query, optionally within one service. Returns compact descriptions and availability, without schemas or account profiles. Policy-denied actions are omitted. Use get_action_guide for input parameters.",
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    inputSchema: z.object({
      query: z.string().trim().min(1).max(256).describe("Search text describing the action you need."),
      service: z
        .string()
        .optional()
        .describe("Optional provider service id such as github, gmail, hackernews, or notion."),
      limit: z.number().int().min(1).max(20).default(5).describe("Maximum number of actions to return."),
    }),
  },
  get_action_guide: {
    title: "Get Action Guide",
    description:
      "Return one action's markdown guide: description, an execute_action example, input parameters, required scopes, provider permissions, execution policy, and the selected connection's status, plus the full capability object, including required scopes and permissions. Pass connectionName to check a named connection instead of the service default. Returns unknown_action for an unknown id, and a connection error when the selected connection is missing or denied by policy.",
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    inputSchema: z.object({
      actionId: z.string().describe("Full action id, for example github.get_current_user."),
      connectionName: optionalConnectionNameSchema,
    }),
  },
  execute_action: {
    title: "Execute Action",
    description:
      "Run one provider action by id against the provider's API, using the default connection or the named connectionName. The input object must match the action's input parameters. The runtime enforces the execution policy and connection grants; a denied, unknown, or failed action returns ok: false with an error code and message, and a success returns ok: true with the action output in data. Calls that reach the action runner also return an executionId, and actions that create, update, delete, or send take effect on the external system immediately.",
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    inputSchema: z.object({
      actionId: z.string().describe("Full action id, for example hackernews.get_item."),
      input: z
        .record(z.string(), z.unknown())
        .default({})
        .describe("Action input object matching the selected action guide."),
      connectionName: optionalConnectionNameSchema,
    }),
  },
};

/**
 * Return the fixed discovery-oriented MCP tool list.
 *
 * The local runtime can contain hundreds of provider actions, so MCP exposes a
 * small set of search/read/execute tools instead of one tool per provider
 * action.
 */
export function listMcpToolSummaries(): IMcpToolSummary[] {
  return Object.entries(mcpToolConfigs).map(([name, config]) => ({
    name,
    title: config.title,
    description: config.description,
  }));
}

/**
 * Create a stateless MCP server instance for one Streamable HTTP request.
 */
export function createMcpServer(options: IMcpServerOptions): McpServer {
  const server = new McpServer(
    {
      name: "oomol-connect",
      version: "0.1.0",
    },
    {
      instructions: mcpServerInstructions,
    },
  );

  server.registerTool("list_apps", mcpToolConfigs.list_apps, async (input) =>
    toolResult(await listApps(options, input), options.outputMode),
  );

  server.registerTool("list_connections", mcpToolConfigs.list_connections, async (input) =>
    toolResult(await listConnections(options, input), options.outputMode),
  );

  server.registerTool("search_actions", mcpToolConfigs.search_actions, async ({ query, service, limit }) =>
    toolResult(await searchActions(options, { query, service, limit }), options.outputMode),
  );

  server.registerTool("get_action_guide", mcpToolConfigs.get_action_guide, async ({ actionId, connectionName }) =>
    toolResult(await getActionGuide(options, actionId, connectionName), options.outputMode),
  );

  server.registerTool("execute_action", mcpToolConfigs.execute_action, async ({ actionId, input, connectionName }) =>
    toolResult(await executeAction(options, actionId, input, connectionName), options.outputMode),
  );

  return server;
}

/**
 * Serve one Streamable HTTP MCP request statelessly: a fresh server per request, JSON responses, closed afterwards.
 */
export async function handleMcpRequest(request: Request, options: IMcpServerOptions): Promise<Response> {
  const handler = createMcpHandler(() => createMcpServer(options), { legacy: "stateless", responseMode: "json" });
  try {
    return await handler.fetch(request);
  } finally {
    await handler.close();
  }
}

async function listConnections(options: IMcpServerOptions, input: McpConnectionsInput): Promise<ToolPayload> {
  let policy: ActionPolicySnapshot;
  try {
    policy = await options.getPolicySnapshot();
  } catch {
    return errorPayload("internal_error", "Runtime policy is unavailable.");
  }
  try {
    const connections = await options.connections.listConnectionsByService(input.service);
    const visible = connections.filter(
      (connection) => connection.authType !== "no_auth" && policy.evaluateConnection(connection.id).allowed,
    );
    const offset = Number(input.cursor ?? 0);
    return {
      ok: true,
      data: visible.slice(offset, offset + input.limit).map((connection) => ({
        connectionName: connection.connectionName,
        accountLabel: connection.profile.displayName ?? connection.profile.accountId ?? connection.connectionName,
        default: connection.default,
        available: connection.status !== "reauth_required",
      })),
      nextCursor: offset + input.limit < visible.length ? String(offset + input.limit) : null,
    };
  } catch (error) {
    return connectionErrorPayload(error, policy);
  }
}

async function listApps(options: IMcpServerOptions, input: McpAppsInput): Promise<ToolPayload> {
  let policy: ActionPolicySnapshot;
  try {
    policy = await options.getPolicySnapshot();
  } catch {
    return errorPayload("internal_error", "Runtime policy is unavailable.");
  }
  const query = input.query?.trim().toLowerCase();
  const offset = Number(input.cursor ?? 0);
  const data: McpAppSummary[] = [];
  let matched = 0;
  for (const provider of options.catalog.providers) {
    if (
      query &&
      ![provider.service, provider.displayName, ...provider.categories].some((value) =>
        value.toLowerCase().includes(query),
      )
    )
      continue;
    if (!provider.actions.some((action) => policy.evaluate(action).allowed)) continue;
    if (matched++ < offset) continue;
    if (data.length === input.limit) return { ok: true, data, nextCursor: String(offset + input.limit) };
    data.push({ service: provider.service, displayName: provider.displayName });
  }
  return { ok: true, data, nextCursor: null };
}

async function searchActions(options: IMcpServerOptions, input: McpSearchInput): Promise<ToolPayload> {
  let policy: ActionPolicySnapshot;
  try {
    policy = await options.getPolicySnapshot();
  } catch {
    return errorPayload("internal_error", "Runtime policy is unavailable.");
  }
  const actionSearch = options.actionSearch ?? createActionSearchIndexProvider(options.catalog.actions);
  // Search metadata only; permission filtering must precede the result limit.
  const matches = searchActionIndex(await actionSearch.get(), input.query, {
    service: input.service,
    limit: input.limit,
    acceptsAction: (id) => options.catalog.actionsById.has(id) && policy.evaluate({ id }).allowed,
  });
  const selected: RuntimeActionSummary[] = [];
  for (const match of matches) {
    const action = options.catalog.actionsById.get(match.id);
    if (action) selected.push(action);
  }
  try {
    // Read the connection store once and summarize only selected services.
    const services = new Set(
      selected.filter((action) => action.execution.needsCredential).map((action) => action.service),
    );
    const availableServices = new Set<string>();
    if (services.size > 0) {
      const connections = await options.connections.listConnections(services);
      for (const connection of connections) {
        if (connection.status !== "reauth_required" && evaluateConnectionGrant(policy, connection).allowed) {
          availableServices.add(connection.service);
        }
      }
    }
    return successPayload(
      selected.map((action) => ({
        id: action.id,
        description: action.description,
        available:
          action.execution.locallyExecutable &&
          (!action.execution.needsCredential || availableServices.has(action.service)),
      })),
    );
  } catch (error) {
    if (error instanceof ConnectionError) return connectionErrorPayload(error, policy);
    return errorPayload("internal_error", "Action discovery failed.");
  }
}

async function getActionGuide(
  options: IMcpServerOptions,
  actionId: string,
  connectionName: string | undefined,
): Promise<ToolPayload> {
  let action: RuntimeActionDefinition | undefined;
  try {
    action = await options.catalog.getAction(actionId);
  } catch {
    return errorPayload("internal_error", "Action catalog could not be loaded.");
  }
  if (!action) {
    return errorPayload("unknown_action", `Unknown action: ${actionId}`);
  }

  let policy: ActionPolicySnapshot;
  try {
    policy = await options.getPolicySnapshot();
  } catch {
    return errorPayload("internal_error", "Runtime policy is unavailable.");
  }
  try {
    const connection = await getSelectedConnectionSummary(options, action.service, connectionName);
    const connectionDecision = evaluateConnectionGrant(policy, connection);
    if (!connectionDecision.allowed) {
      return errorPayload(connectionDecision.code, connectionDecision.message);
    }
    const capability = describeActionCapability(action, policy, connection);
    return successPayload({
      capability,
      markdown: renderActionMarkdown(action, {
        transport: { kind: "mcp" },
        connection: capability.connection,
        policy: capability.policy,
      }),
    });
  } catch (error) {
    return connectionErrorPayload(error, policy);
  }
}

async function executeAction(
  options: IMcpServerOptions,
  actionId: string,
  input: Record<string, unknown>,
  connectionName: string | undefined,
): Promise<ToolPayload> {
  const action = options.catalog.actionsById.get(actionId);
  if (!action) {
    return errorPayload("unknown_action", `Unknown action: ${actionId}`);
  }

  let policy: ActionPolicySnapshot;
  try {
    policy = await options.getPolicySnapshot();
  } catch {
    return errorPayload("internal_error", "Runtime policy is unavailable.");
  }
  if (connectionName && policy.evaluate(action).allowed) {
    try {
      const connection = await getSelectedConnectionSummary(options, action.service, connectionName);
      const connectionDecision = evaluateConnectionGrant(policy, connection);
      if (!connectionDecision.allowed) {
        return errorPayload(connectionDecision.code, connectionDecision.message);
      }
    } catch (error) {
      return connectionErrorPayload(error, policy);
    }
  }
  const run = await options.actions.run({
    actionId,
    input,
    caller: "mcp",
    connectionName,
    policy,
    runtimeTokenId: options.runtimeGrant?.tokenId,
    signal: options.signal,
  });
  if (!run) {
    return errorPayload("unknown_action", `Unknown action: ${actionId}`);
  }
  const executionMeta = createExecutionMeta(run);
  if (!run.result.ok) {
    return {
      ok: false,
      error: run.result.error ?? {
        code: "execution_failed",
        message: "Action execution failed.",
      },
      ...executionMeta,
    };
  }
  return {
    ok: true,
    data: run.result.output,
    ...executionMeta,
  };
}

type ActionCapability = {
  operationType: RuntimeActionDefinition["operationType"];
  execution: RuntimeActionDefinition["execution"];
  authTypes: AuthType[];
  requiredScopes: string[];
  providerPermissions: string[];
  policy: ActionPolicyDecision;
  connection?: ConnectionSummary;
};

function describeActionCapability(
  action: RuntimeActionSummary,
  policy: ActionPolicySnapshot,
  connection: ConnectionSummary | undefined,
): ActionCapability {
  return {
    operationType: action.operationType,
    execution: action.execution,
    authTypes: action.execution.requiredAuthTypes,
    requiredScopes: action.requiredScopes,
    providerPermissions: action.providerPermissions,
    policy: policy.evaluate(action),
    connection: evaluateConnectionGrant(policy, connection).allowed ? connection : undefined,
  };
}

async function getSelectedConnectionSummary(
  options: IMcpServerOptions,
  service: string,
  connectionName: string | undefined,
): Promise<ConnectionSummary | undefined> {
  const connection = await options.connections.getConnectionSummary(service, connectionName);
  if (connectionName && connection?.virtual && !connection.default) {
    throw new ConnectionError("connection_not_found", `${service} connection not found: ${connection.connectionName}.`);
  }
  return connection;
}

function evaluateConnectionGrant(
  policy: ActionPolicySnapshot,
  connection: ConnectionSummary | undefined,
): ActionPolicyDecision {
  return connection?.authType === "no_auth" ? { allowed: true, checks: [] } : policy.evaluateConnection(connection?.id);
}

interface ToolExecutionMeta {
  executionId: string;
  remoteExecutionId?: string;
  auditPersisted: boolean;
  connection?: Record<string, unknown>;
}

interface ToolError {
  code: string;
  message: string;
  details?: unknown;
}

type ToolPayload = Record<string, unknown> &
  (
    | { ok: true; data: unknown; executionId?: never; auditPersisted?: never }
    | { ok: false; error: ToolError; executionId?: never; auditPersisted?: never }
    | ({ ok: true; data: unknown } & ToolExecutionMeta)
    | ({ ok: false; error: ToolError } & ToolExecutionMeta)
  );

function successPayload(data: unknown): ToolPayload {
  return { ok: true, data };
}

function errorPayload(code: string, message: string): ToolPayload {
  return {
    ok: false,
    error: { code, message },
  };
}

function connectionErrorPayload(error: unknown, policy: ActionPolicySnapshot): ToolPayload {
  if (error instanceof ConnectionError) {
    const missingConnectionDecision = error.code === "connection_not_found" ? policy.evaluateConnection() : undefined;
    if (missingConnectionDecision && !missingConnectionDecision.allowed) {
      return errorPayload(missingConnectionDecision.code, missingConnectionDecision.message);
    }
    return errorPayload(error.code, error.message);
  }
  throw error;
}

function serializeConnection(connection: ConnectionSummary): Record<string, unknown> {
  return {
    id: connection.id,
    service: connection.service,
    connectionName: connection.connectionName,
    authType: connection.authType,
    default: connection.default,
    profile: connection.profile,
  };
}

function createExecutionMeta(run: ActionRunResult): ToolExecutionMeta {
  const meta: ToolExecutionMeta = {
    executionId: run.executionId,
    remoteExecutionId: run.remoteExecutionId,
    auditPersisted: run.auditPersisted,
  };
  if (run.connection) {
    meta.connection = serializeConnection(run.connection);
  }
  return meta;
}

function toolResult(payload: ToolPayload, outputMode?: McpOutputMode): CallToolResult {
  const text =
    outputMode === "compact"
      ? payload.ok
        ? "The complete result is available in structuredContent."
        : `${payload.error.code}: ${payload.error.message}`
      : JSON.stringify(payload);
  return {
    content: [{ type: "text", text }],
    structuredContent: payload,
    isError: payload.ok ? undefined : true,
  };
}
