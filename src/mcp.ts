import type { CatalogStore, RuntimeActionDefinition } from "./catalog-store.ts";
import type { ConnectionService, ConnectionSummary } from "./connection-service.ts";
import type { ActionPolicyService } from "./core/action-policy.ts";
import type { ActionSearchIndexProvider } from "./core/action-search.ts";
import type { JsonSchema, ProviderDefinition } from "./core/types.ts";
import type { IProviderLoader } from "./providers/provider-loader.ts";
import type { ActionRunner } from "./server/actions/action-runner.ts";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
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
  "Start with list_apps or search_actions.",
  "Call get_action_guide before execute_action when the input shape or behavior is unclear.",
  "Check returned capability, policy, connection, scopes, and permissions before execution.",
  "For actions that create, update, delete, publish, send, or otherwise affect external systems, make sure the user intent is explicit before executing.",
  "Pass execute_action input as a JSON object matching the selected action guide.",
].join("\n");

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
    async ({ query, service, limit }) =>
      toolResult(successPayload(await searchActions(options, { query, service, limit }))),
  );

  server.registerTool(
    "get_action_guide",
    {
      title: "Get Action Guide",
      description: "Return one action's compact markdown guide, including local execute examples and input parameters.",
      inputSchema: {
        actionId: z.string().describe("Full action id, for example github.get_current_user."),
      },
    },
    async ({ actionId }) => toolResult(await getActionGuide(options, actionId)),
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
      },
    },
    async ({ actionId, input }) => toolResult(await executeAction(options, actionId, input)),
  );

  return server;
}

async function listApps(options: IMcpServerOptions, query: string | undefined): Promise<unknown> {
  const normalized = query?.trim().toLowerCase();
  const providers = options.catalog.providers
    .filter((provider) => {
      if (!normalized) {
        return true;
      }

      return [provider.service, provider.displayName, provider.categories.join(" "), provider.authTypes.join(" ")]
        .join(" ")
        .toLowerCase()
        .includes(normalized);
    })
    .map(async (provider) => {
      const connection = await options.connections.getConnectionSummary(provider.service);
      return {
        service: provider.service,
        displayName: provider.displayName,
        categories: provider.categories,
        authTypes: provider.authTypes,
        actionCount: provider.actions.length,
        executableActionCount: provider.actions.filter((action) => action.execution.locallyExecutable).length,
        connection,
      };
    });

  return Promise.all(providers);
}

async function searchActions(
  options: IMcpServerOptions,
  input: { query?: string; service?: string; limit: number },
): Promise<unknown> {
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
    capability: await describeActionCapability(options, action),
    inputSummary: summarizeInputSchema(action.inputSchema),
  }));

  return Promise.all(actions);
}

async function getActionGuide(options: IMcpServerOptions, actionId: string): Promise<ToolPayload> {
  const action = options.catalog.actionsById.get(actionId);
  if (!action) {
    return errorPayload("unknown_action", `Unknown action: ${actionId}`);
  }

  return successPayload({
    capability: await describeActionCapability(options, action),
    markdown: renderActionMarkdown(action, await describeActionMarkdownContext(options, action)),
  });
}

async function executeAction(
  options: IMcpServerOptions,
  actionId: string,
  input: Record<string, unknown>,
): Promise<ToolPayload> {
  const action = options.catalog.actionsById.get(actionId);
  if (!action) {
    return errorPayload("unknown_action", `Unknown action: ${actionId}`);
  }

  const run = await options.actions.run({
    actionId,
    input,
    caller: "mcp",
  });
  if (!run) {
    return errorPayload("unknown_action", `Unknown action: ${actionId}`);
  }
  if (!run.result.ok) {
    return {
      ok: false,
      error: run.result.error ?? {
        code: "execution_failed",
        message: "Action execution failed.",
      },
    };
  }
  return successPayload(run.result.output);
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
  policy: ReturnType<ActionPolicyService["evaluate"]> | { allowed: true };
  connection?: ConnectionSummary;
};

async function describeActionCapability(
  options: IMcpServerOptions,
  action: RuntimeActionDefinition,
): Promise<ActionCapability> {
  const provider = options.catalog.providers.find((candidate) => candidate.service === action.service);
  return {
    execution: action.execution,
    authTypes: provider?.authTypes ?? [],
    requiredScopes: action.requiredScopes,
    providerPermissions: action.providerPermissions,
    policy: options.actionPolicy?.evaluate(action) ?? { allowed: true },
    connection: await options.connections.getConnectionSummary(action.service),
  };
}

async function describeActionMarkdownContext(
  options: IMcpServerOptions,
  action: RuntimeActionDefinition,
): Promise<{ connection?: ConnectionSummary; providerPermissions: string[] }> {
  return {
    connection: await options.connections.getConnectionSummary(action.service),
    providerPermissions: action.providerPermissions,
  };
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

type ToolPayload =
  | {
      ok: true;
      data: unknown;
    }
  | {
      ok: false;
      error: {
        code: string;
        message: string;
        details?: unknown;
      };
    };

function successPayload(data: unknown): ToolPayload {
  return { ok: true, data };
}

function errorPayload(code: string, message: string): ToolPayload {
  return {
    ok: false,
    error: { code, message },
  };
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
