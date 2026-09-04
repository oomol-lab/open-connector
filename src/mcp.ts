import type { CatalogStore, RuntimeActionDefinition } from "./catalog-store.ts";
import type { ConnectionService, ConnectionSummary } from "./connection-service.ts";
import type { ActionPolicyDecision, ActionPolicySnapshot } from "./core/action-policy.ts";
import type { ActionSearchIndexProvider } from "./core/action-search.ts";
import type { AuthType, JsonSchema } from "./core/types.ts";
import type { ActionRunner, ActionRunResult } from "./server/actions/action-runner.ts";
import type { RuntimeGrant } from "./server/storage/runtime-token-service.ts";
import type { CallToolResult } from "@modelcontextprotocol/server";

import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { ConnectionError } from "./connection-service.ts";
import { createActionSearchIndexProvider, searchActions as searchActionIndex } from "./core/action-search.ts";
import { describeSchemaType, readSchemaProperties, readSchemaRequired } from "./core/json-schema.ts";
import { renderActionMarkdown } from "./server/api/action-markdown.ts";

/**
 * Dependencies required by the local MCP server.
 */
export interface IMcpServerOptions {
  catalog: CatalogStore;
  connections: ConnectionService;
  actions: ActionRunner;
  actionSearch?: ActionSearchIndexProvider;
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
  "Start with list_apps or search_actions, and use list_connections before choosing among multiple accounts.",
  "Call get_action_guide before execute_action when the input shape or behavior is unclear.",
  "Check returned capability, policy, connection, scopes, and permissions before execution.",
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

/**
 * Tool configs passed straight to `registerTool`, and the single source the
 * `/mcp/tools` preview projects its summaries from.
 */
const mcpToolConfigs = {
  list_apps: {
    title: "List Apps",
    description: "List available provider apps with connection and action counts.",
    inputSchema: {
      query: z.string().optional().describe("Optional case-insensitive app name, service, category, or auth filter."),
    },
  },
  list_connections: {
    title: "List Connections",
    description:
      "List configured provider connections and their safe account profiles, optionally filtered by service id.",
    inputSchema: {
      service: z.string().optional().describe("Optional provider service id such as github, gmail, or notion."),
    },
  },
  search_actions: {
    title: "Search Actions",
    description:
      "Search catalog actions by query and optional provider service id. Use this before requesting an action guide.",
    inputSchema: {
      query: z
        .string()
        .optional()
        .describe("Optional case-insensitive search text matched against action id, name, description, and scopes."),
      service: z
        .string()
        .optional()
        .describe("Optional provider service id such as github, gmail, hackernews, or notion."),
      limit: z.number().int().min(1).max(50).default(20).describe("Maximum number of actions to return."),
    },
  },
  get_action_guide: {
    title: "Get Action Guide",
    description: "Return one action's compact markdown guide, including local execute examples and input parameters.",
    inputSchema: {
      actionId: z.string().describe("Full action id, for example github.get_current_user."),
      connectionName: optionalConnectionNameSchema,
    },
  },
  execute_action: {
    title: "Execute Action",
    description:
      "Execute one local provider action by id with a JSON input object. Call get_action_guide first if the input shape is unclear.",
    inputSchema: {
      actionId: z.string().describe("Full action id, for example hackernews.get_item."),
      input: z
        .record(z.string(), z.unknown())
        .default({})
        .describe("Action input object matching the selected action guide."),
      connectionName: optionalConnectionNameSchema,
    },
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

  server.registerTool("list_apps", mcpToolConfigs.list_apps, async ({ query }) =>
    toolResult(await listApps(options, query)),
  );

  server.registerTool("list_connections", mcpToolConfigs.list_connections, async ({ service }) =>
    toolResult(await listConnections(options, service)),
  );

  server.registerTool("search_actions", mcpToolConfigs.search_actions, async ({ query, service, limit }) =>
    toolResult(await searchActions(options, { query, service, limit })),
  );

  server.registerTool("get_action_guide", mcpToolConfigs.get_action_guide, async ({ actionId, connectionName }) =>
    toolResult(await getActionGuide(options, actionId, connectionName)),
  );

  server.registerTool("execute_action", mcpToolConfigs.execute_action, async ({ actionId, input, connectionName }) =>
    toolResult(await executeAction(options, actionId, input, connectionName)),
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

async function listConnections(options: IMcpServerOptions, service: string | undefined): Promise<ToolPayload> {
  let policy: ActionPolicySnapshot;
  try {
    policy = await options.getPolicySnapshot();
  } catch {
    return errorPayload("internal_error", "Runtime policy is unavailable.");
  }
  try {
    const connections = service
      ? await options.connections.listConnectionsByService(service)
      : await options.connections.listConnections();
    return successPayload(
      connections
        .filter((connection) => connection.authType === "no_auth" || policy.evaluateConnection(connection.id).allowed)
        .map(serializeConnection),
    );
  } catch (error) {
    return connectionErrorPayload(error, policy);
  }
}

async function listApps(options: IMcpServerOptions, query: string | undefined): Promise<ToolPayload> {
  let policy: ActionPolicySnapshot;
  try {
    policy = await options.getPolicySnapshot();
  } catch {
    return errorPayload("internal_error", "Runtime policy is unavailable.");
  }
  const normalized = query?.trim().toLowerCase();
  const connections = (await options.connections.listConnections()).filter(
    (connection) => connection.authType === "no_auth" || policy.evaluateConnection(connection.id).allowed,
  );
  const defaultConnections = new Map(
    connections.filter((connection) => connection.default).map((connection) => [connection.service, connection]),
  );
  return successPayload(
    options.catalog.providers
      .filter((provider) => {
        if (!normalized) {
          return true;
        }

        return [provider.service, provider.displayName, provider.categories.join(" "), provider.authTypes.join(" ")]
          .join(" ")
          .toLowerCase()
          .includes(normalized);
      })
      .map((provider) => ({
        service: provider.service,
        displayName: provider.displayName,
        categories: provider.categories,
        authTypes: provider.authTypes,
        actionCount: provider.actions.length,
        executableActionCount: provider.actions.filter((action) => action.execution.locallyExecutable).length,
        connection: defaultConnections.get(provider.service),
      })),
  );
}

async function searchActions(
  options: IMcpServerOptions,
  input: { query?: string; service?: string; limit: number },
): Promise<ToolPayload> {
  let policy: ActionPolicySnapshot;
  try {
    policy = await options.getPolicySnapshot();
  } catch {
    return errorPayload("internal_error", "Runtime policy is unavailable.");
  }
  const query = input.query?.trim();
  const actionSearch = options.actionSearch ?? createActionSearchIndexProvider(options.catalog.actions);
  const rankedActions = query
    ? searchActionIndex(await actionSearch.get(), query, { service: input.service, limit: input.limit })
        .map((result) => options.catalog.actionsById.get(result.id))
        .filter((action): action is RuntimeActionDefinition => Boolean(action))
    : options.catalog.actions
        .filter((action) => !input.service || action.service === input.service)
        .slice(0, input.limit);
  const actions = rankedActions.map(async (action) => ({
    id: action.id,
    service: action.service,
    name: action.name,
    description: action.description,
    capability: describeActionCapability(
      action,
      policy,
      await getSelectedConnectionSummary(options, action.service, undefined),
    ),
    inputSummary: summarizeInputSchema(action.inputSchema),
  }));

  return successPayload(await Promise.all(actions));
}

async function getActionGuide(
  options: IMcpServerOptions,
  actionId: string,
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
  try {
    const connection = await getSelectedConnectionSummary(options, action.service, connectionName);
    const connectionDecision = evaluateConnectionGrant(policy, connection);
    if (!connectionDecision.allowed) {
      return errorPayload(connectionDecision.code, connectionDecision.message);
    }
    const capability = describeActionCapability(action, policy, connection);
    return successPayload({
      capability,
      markdown: renderActionMarkdown(action, { connection: capability.connection, policy: capability.policy }),
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

function summarizeInputSchema(schema: JsonSchema): unknown {
  const properties = readSchemaProperties(schema);
  const required = new Set(readSchemaRequired(schema));

  return Object.entries(properties).map(([name, property]) => ({
    name,
    required: required.has(name),
    type: describeSchemaType(property),
    description: typeof property.description === "string" ? property.description : "",
  }));
}

type ActionCapability = {
  execution: RuntimeActionDefinition["execution"];
  authTypes: AuthType[];
  requiredScopes: string[];
  providerPermissions: string[];
  policy: ActionPolicyDecision;
  connection?: ConnectionSummary;
};

function describeActionCapability(
  action: RuntimeActionDefinition,
  policy: ActionPolicySnapshot,
  connection: ConnectionSummary | undefined,
): ActionCapability {
  return {
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
    auditPersisted: run.auditPersisted,
  };
  if (run.connection) {
    meta.connection = serializeConnection(run.connection);
  }
  return meta;
}

function toolResult(payload: ToolPayload): CallToolResult {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(payload, null, 2),
      },
    ],
    structuredContent: payload,
    ...(payload.ok ? {} : { isError: true }),
  };
}
