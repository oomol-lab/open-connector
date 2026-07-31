import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderFetch, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport, StreamableHTTPError } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { CfWorkerJsonSchemaValidator } from "@modelcontextprotocol/sdk/validation/cfworker";
import { createHash } from "node:crypto";
import { optionalRecord, optionalString } from "../../core/cast.ts";
import { assertPublicHttpUrl, isPrivateNetworkAccessAllowed } from "../../core/request.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

export interface WandbMcpContext {
  endpoint: URL;
  apiKey: string;
  availableActions?: ReadonlySet<string>;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
}

type WandbMcpToolResult = Awaited<ReturnType<Client["callTool"]>>;

const defaultEndpoint = "https://mcp.withwandb.com/mcp";
const requestTimeoutMs = 60_000;
const wandbMcpJsonSchemaValidator = new CfWorkerJsonSchemaValidator();

export const wandbMcpTools: Record<string, string> = {
  query_weave_traces: "query_weave_traces_tool",
  count_weave_traces: "count_weave_traces_tool",
  resolve_trace_roots: "resolve_trace_roots_tool",
  query_wandb: "query_wandb_tool",
  create_report: "create_wandb_report_tool",
  log_analysis: "log_analysis_to_wandb",
  list_entities: "list_entities_tool",
  list_projects: "query_wandb_entity_projects",
  list_automations: "list_wandb_automations_tool",
  list_integrations: "list_wandb_integrations_tool",
  infer_trace_schema: "infer_trace_schema_tool",
  search_docs: "search_wandb_docs_tool",
  get_run_history: "get_run_history_tool",
  list_registries: "list_registries_tool",
  list_registry_collections: "list_registry_collections_tool",
  list_artifact_versions: "list_artifact_versions_tool",
  get_artifact_details: "get_artifact_details_tool",
  compare_artifact_versions: "compare_artifact_versions_tool",
  compare_runs: "compare_runs_tool",
  summarize_evaluation: "summarize_evaluation_tool",
  diagnose_run: "diagnose_run_tool",
  probe_project: "probe_project_tool",
};

export const wandbMcpActionHandlers: Record<string, ProviderRuntimeHandler<WandbMcpContext>> = {};
for (const [actionName, toolName] of Object.entries(wandbMcpTools)) {
  wandbMcpActionHandlers[actionName] = async (input: Record<string, unknown>, context: WandbMcpContext) => {
    if (context.availableActions && !context.availableActions.has(actionName)) {
      throw new ProviderRequestError(400, `W&B MCP action ${actionName} is not available for this connection`);
    }
    return callWandbMcpTool(context, toolName, input);
  };
}

export function createWandbMcpContext(
  apiKey: string,
  values: Record<string, string>,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
  availableActions?: readonly string[],
  allowPrivateNetwork: boolean = isPrivateNetworkAccessAllowed(),
): WandbMcpContext {
  return {
    endpoint: normalizeWandbMcpEndpoint(optionalString(values.mcpEndpoint), allowPrivateNetwork),
    apiKey,
    availableActions: availableActions ? new Set(availableActions) : undefined,
    fetcher,
    signal,
  };
}

export async function validateWandbMcpCredential(
  apiKey: string,
  values: Record<string, string>,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const context = createWandbMcpContext(apiKey, values, fetcher, signal);
  const discoveredTools = await listWandbMcpTools(context);
  const discoveredToolNames = new Set(discoveredTools);
  const availableActions = Object.entries(wandbMcpTools)
    .filter(([, toolName]) => discoveredToolNames.has(toolName))
    .map(([actionName]) => actionName);
  if (availableActions.length === 0) {
    throw new ProviderRequestError(502, "W&B MCP endpoint did not expose any supported tools");
  }

  const endpointId = formatEndpointId(context.endpoint);
  const credentialHash = createHash("sha256").update(endpointId).update("\0").update(apiKey).digest("hex").slice(0, 16);
  return {
    profile: {
      accountId: `wandb:mcp:${credentialHash}`,
      displayName: `W&B MCP · ${context.endpoint.host}`,
    },
    grantedScopes: [],
    metadata: {
      mcpEndpoint: endpointId,
      discoveredToolCount: discoveredTools.length,
      availableActions,
    },
  };
}

export function normalizeWandbMcpEndpoint(
  value: unknown,
  allowPrivateNetwork: boolean = isPrivateNetworkAccessAllowed(),
): URL {
  const raw = optionalString(value) ?? defaultEndpoint;
  const url = assertPublicHttpUrl(raw, {
    fieldName: "mcpEndpoint",
    createError: (message) => new ProviderRequestError(400, message),
    allowPrivateNetwork,
  });
  if (url.username || url.password) {
    throw new ProviderRequestError(400, "mcpEndpoint must not include username or password");
  }
  if (url.protocol === "http:" && !allowPrivateNetwork) {
    throw new ProviderRequestError(400, "http mcpEndpoint URLs require private-network access to be enabled");
  }
  url.search = "";
  url.hash = "";
  return url;
}

export async function callWandbMcpTool(
  context: WandbMcpContext,
  toolName: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  return withWandbMcpClient(context, async (client) => {
    const result = await client.callTool({ name: toolName, arguments: args }, undefined, {
      timeout: requestTimeoutMs,
      signal: context.signal,
    });
    return normalizeWandbMcpToolResult(toolName, result);
  });
}

async function listWandbMcpTools(context: WandbMcpContext): Promise<string[]> {
  return withWandbMcpClient(context, async (client) => {
    const result = await client.listTools(
      {},
      {
        timeout: requestTimeoutMs,
        signal: context.signal,
      },
    );
    return result.tools.map((tool) => tool.name);
  });
}

async function withWandbMcpClient<T>(context: WandbMcpContext, run: (client: Client) => Promise<T>): Promise<T> {
  const headers = new Headers({
    authorization: `Bearer ${context.apiKey}`,
    "user-agent": providerUserAgent,
  });
  const transport = new StreamableHTTPClientTransport(context.endpoint, {
    fetch: context.fetcher,
    requestInit: { headers },
  });
  const client = new Client(
    { name: "oomol-connect-wandb", version: "1.0.0" },
    { jsonSchemaValidator: wandbMcpJsonSchemaValidator },
  );

  try {
    await client.connect(transport, { timeout: requestTimeoutMs, signal: context.signal });
    return await run(client);
  } catch (error) {
    throw mapWandbMcpError(error);
  } finally {
    await client.close().catch(() => undefined);
  }
}

function normalizeWandbMcpToolResult(toolName: string, result: WandbMcpToolResult): unknown {
  if ("toolResult" in result) {
    return result;
  }
  if (result.isError) {
    throw new ProviderRequestError(
      502,
      `W&B MCP tool ${toolName} returned an error: ${formatWandbMcpToolContent(result)}`,
      result,
    );
  }
  if (result.structuredContent) {
    const structured = optionalRecord(result.structuredContent);
    const payload =
      structured && Object.keys(structured).length === 1 && typeof structured.result === "string"
        ? parseWandbMcpText(structured.result)
        : result.structuredContent;
    return normalizeWandbMcpPayload(toolName, payload);
  }

  const textItems = result.content.filter((content) => content.type === "text");
  if (textItems.length === 1) {
    return normalizeWandbMcpPayload(toolName, parseWandbMcpText(textItems[0]!.text));
  }
  return result;
}

function parseWandbMcpText(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function normalizeWandbMcpPayload(toolName: string, payload: unknown): unknown {
  const record = optionalRecord(payload);
  const error = optionalString(record?.error);
  if (!error) {
    return payload;
  }

  const status =
    error === "timeout"
      ? 504
      : error === "quota_exceeded"
        ? 429
        : ["invalid_input", "query_too_complex", "query_too_large", "read_only_violation"].includes(error)
          ? 400
          : 502;
  throw new ProviderRequestError(
    status,
    `W&B MCP tool ${toolName} returned an error: ${optionalString(record?.message) ?? error}`,
    payload,
  );
}

function formatWandbMcpToolContent(result: Extract<WandbMcpToolResult, { content: unknown }>): string {
  const text = result.content
    .map((content) => {
      if (content.type === "text") return content.text;
      if (content.type === "resource") return "text" in content.resource ? content.resource.text : content.resource.uri;
      if (content.type === "resource_link") return content.uri;
      return content.type;
    })
    .filter(Boolean)
    .join("; ");
  return text.slice(0, 300) || "empty error content";
}

function formatEndpointId(endpoint: URL): string {
  const pathname = endpoint.pathname === "/" ? "" : endpoint.pathname.replace(/\/+$/u, "");
  return `${endpoint.origin}${pathname}`;
}

function mapWandbMcpError(error: unknown): ProviderRequestError {
  if (error instanceof ProviderRequestError) return error;
  if (error instanceof UnauthorizedError) {
    return new ProviderRequestError(401, "W&B API key is invalid or expired", error);
  }
  if (error instanceof StreamableHTTPError) {
    const status = error.code;
    let providerStatus = 502;
    if (status === 401 || status === 403) {
      providerStatus = 401;
    } else if (status === 429) {
      providerStatus = 429;
    } else if (status && status >= 400 && status < 500) {
      providerStatus = 400;
    }
    return new ProviderRequestError(providerStatus, `W&B MCP request failed: ${error.message}`, error);
  }
  if (error instanceof McpError) {
    return error.code === ErrorCode.RequestTimeout
      ? new ProviderRequestError(504, "W&B MCP request timed out", error)
      : new ProviderRequestError(502, `W&B MCP request failed: ${error.message}`, error);
  }
  if (isAbortError(error)) {
    return new ProviderRequestError(504, "W&B MCP request timed out", error);
  }
  return new ProviderRequestError(
    502,
    error instanceof Error ? `W&B MCP request failed: ${error.message}` : "W&B MCP request failed",
    error,
  );
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
}
