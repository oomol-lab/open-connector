import type { CatalogStore, RuntimeActionDefinition } from "./catalog-store.ts";
import type { ConnectionService, ConnectionSummary } from "./connection-service.ts";
import type { ActionPolicyDecision, ActionPolicySnapshot } from "./core/action-policy.ts";
import type { ActionSearchIndexProvider } from "./core/action-search.ts";
import type { JsonSchema, ProviderDefinition } from "./core/types.ts";
import type { IProviderLoader } from "./providers/provider-loader.ts";
import type { ActionRunner, ActionRunResult } from "./server/actions/action-runner.ts";
import type { RuntimeGrant } from "./server/storage/runtime-token-service.ts";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import { ConnectionError } from "./connection-service.ts";
import { ActionPolicyService, emptyPolicyRules } from "./core/action-policy.ts";
import { createActionSearchIndexProvider, searchActions as searchActionIndex } from "./core/action-search.ts";
import { renderActionMarkdown } from "./server/api/action-markdown.ts";

/**
 * Dependencies required by the local MCP server.
 */
export interface IMcpServerOptions {
  catalog: CatalogStore;
  providerLoader: IProviderLoader;
  connections: ConnectionService;
  actions: ActionRunner;
  actionPolicy?: ActionPolicyService;
  actionSearch?: ActionSearchIndexProvider;
  getPolicySnapshot?(): Promise<ActionPolicySnapshot>;
  runtimeGrant?: RuntimeGrant;
}

/**
 * Compact tool descriptor used by HTTP previews and docs.
 */
export interface IMcpToolSummary {
  name: string;
  title: string;
  description: string;
}

const mcpToolSummaries: IMcpToolSummary[] = [
  {
    name: "list_apps",
    title: "List Apps",
    description: "List available provider apps with connection and action counts.",
  },
  {
    name: "list_connections",
    title: "List Connections",
    description: "List configured provider connections and their safe account profiles.",
  },
  {
    name: "search_actions",
    title: "Search Actions",
    description: "Search catalog actions by query and optional provider service id.",
  },
  {
    name: "get_action_guide",
    title: "Get Action Guide",
    description: "Return the compact markdown guide for one action, including examples and parameters.",
  },
  {
    name: "execute_action",
    title: "Execute Action",
    description: "Execute one local provider action by id with a JSON input object.",
  },
];

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
 * Return the fixed discovery-oriented MCP tool list.
 *
 * The local runtime can contain hundreds of provider actions, so MCP exposes a
 * small set of search/read/execute tools instead of one tool per provider
 * action.
 */
export function listMcpToolSummaries(): IMcpToolSummary[] {
  return mcpToolSummaries;
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

  server.registerTool(
    "list_apps",
    {
      title: "List Apps",
      description: "List available provider apps with connection and action counts.",
      inputSchema: {
        query: z.string().optional().describe("Optional case-insensitive app name, service, category, or auth filter."),
      },
    },
    async ({ query }) => toolResult(successPayload(await listApps(options, query))),
  );

  server.registerTool(
    "list_connections",
    {
      title: "List Connections",
      description:
        "List configured provider connections and their safe account profiles, optionally filtered by service id.",
      inputSchema: {
        service: z.string().optional().describe("Optional provider service id such as github, gmail, or notion."),
      },
    },
    async ({ service }) => toolResult(await listConnections(options, service)),
  );

  server.registerTool(
    "search_actions",
    {
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
    async ({ query, service, limit }) => toolResult(await searchActions(options, { query, service, limit })),
  );

  server.registerTool(
    "get_action_guide",
    {
      title: "Get Action Guide",
      description: "Return one action's compact markdown guide, including local execute examples and input parameters.",
      inputSchema: {
        actionId: z.string().describe("Full action id, for example github.get_current_user."),
        connectionName: optionalConnectionNameSchema,
      },
    },
    async ({ actionId, connectionName }) => toolResult(await getActionGuide(options, actionId, connectionName)),
  );

  server.registerTool(
    "execute_action",
    {
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
    async ({ actionId, input, connectionName }) =>
      toolResult(await executeAction(options, actionId, input, connectionName)),
  );

  return server;
}

async function listConnections(options: IMcpServerOptions, service: string | undefined): Promise<ToolPayload> {
  try {
    const connections = service
      ? await options.connections.listConnectionsByService(service)
      : await options.connections.listConnections();
    return successPayload(connections.filter((connection) => !connection.virtual).map(serializeConnection));
  } catch (error) {
    return connectionErrorPayload(error);
  }
}

async function listApps(options: IMcpServerOptions, query: string | undefined): Promise<unknown> {
  const normalized = query?.trim().toLowerCase();
  const connections = await options.connections.listConnections();
  const defaultConnections = new Map(
    connections.filter((connection) => connection.default).map((connection) => [connection.service, connection]),
  );
  return options.catalog.providers
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
    }));
}

async function searchActions(
  options: IMcpServerOptions,
  input: { query?: string; service?: string; limit: number },
): Promise<ToolPayload> {
  let policy: ActionPolicySnapshot;
  try {
    policy = await getPolicySnapshot(options);
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
    capability: await describeActionCapability(options, action, undefined, policy),
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
    policy = await getPolicySnapshot(options);
  } catch {
    return errorPayload("internal_error", "Runtime policy is unavailable.");
  }
  try {
    return successPayload({
      capability: await describeActionCapability(options, action, connectionName, policy),
      markdown: renderActionMarkdown(
        action,
        await describeActionMarkdownContext(options, action, connectionName, policy),
      ),
    });
  } catch (error) {
    return connectionErrorPayload(error);
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
    policy = await getPolicySnapshot(options);
  } catch {
    return errorPayload("internal_error", "Runtime policy is unavailable.");
  }
  if (connectionName && policy.evaluate(action).allowed) {
    try {
      await getSelectedConnectionSummary(options, action.service, connectionName);
    } catch (error) {
      return connectionErrorPayload(error);
    }
  }
  const run = await options.actions.run({
    actionId,
    input,
    caller: "mcp",
    connectionName,
    policy,
    runtimeTokenId: options.runtimeGrant?.tokenId,
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
  const properties =
    schema.properties && typeof schema.properties === "object" ? (schema.properties as Record<string, JsonSchema>) : {};
  const required = new Set(
    Array.isArray(schema.required) ? schema.required.filter((value): value is string => typeof value === "string") : [],
  );

  return Object.entries(properties).map(([name, property]) => ({
    name,
    required: required.has(name),
    type: describeSchemaType(property),
    description: typeof property.description === "string" ? property.description : "",
  }));
}

type ActionCapability = {
  execution: RuntimeActionDefinition["execution"];
  authTypes: ProviderDefinition["authTypes"];
  requiredScopes: string[];
  providerPermissions: string[];
  policy: ActionPolicyDecision;
  connection?: ConnectionSummary;
};

async function describeActionCapability(
  options: IMcpServerOptions,
  action: RuntimeActionDefinition,
  connectionName?: string,
  policy?: ActionPolicySnapshot,
): Promise<ActionCapability> {
  const provider = options.catalog.providers.find((candidate) => candidate.service === action.service);
  return {
    execution: action.execution,
    authTypes: provider?.authTypes ?? [],
    requiredScopes: action.requiredScopes,
    providerPermissions: action.providerPermissions,
    policy: (policy ?? (await getPolicySnapshot(options))).evaluate(action),
    connection: await getSelectedConnectionSummary(options, action.service, connectionName),
  };
}

async function describeActionMarkdownContext(
  options: IMcpServerOptions,
  action: RuntimeActionDefinition,
  connectionName?: string,
  policy?: ActionPolicySnapshot,
): Promise<{ connection?: ConnectionSummary; providerPermissions: string[]; policy: ActionPolicyDecision }> {
  return {
    connection: await getSelectedConnectionSummary(options, action.service, connectionName),
    providerPermissions: action.providerPermissions,
    policy: (policy ?? (await getPolicySnapshot(options))).evaluate(action),
  };
}

async function getPolicySnapshot(options: IMcpServerOptions): Promise<ActionPolicySnapshot> {
  if (options.getPolicySnapshot) {
    return options.getPolicySnapshot();
  }
  return (options.actionPolicy ?? new ActionPolicyService()).createSnapshot(emptyPolicyRules(), options.runtimeGrant);
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

function describeSchemaType(schema: JsonSchema | undefined): string {
  if (!schema) {
    return "unknown";
  }
  if (schema.const !== undefined) {
    return JSON.stringify(schema.const);
  }
  if (Array.isArray(schema.enum)) {
    return schema.enum.map((value) => JSON.stringify(value)).join(" | ");
  }
  if (Array.isArray(schema.anyOf)) {
    return schema.anyOf.map((value) => describeSchemaType(value as JsonSchema)).join(" | ");
  }
  return typeof schema.type === "string" ? schema.type : "unknown";
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

function connectionErrorPayload(error: unknown): ToolPayload {
  if (error instanceof ConnectionError) {
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
