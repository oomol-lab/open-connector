import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderFetch } from "../provider-runtime.ts";

import { UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport, StreamableHTTPError } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { CfWorkerJsonSchemaValidator } from "@modelcontextprotocol/sdk/validation/cfworker";
import { createHash } from "node:crypto";
import { optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { assertPublicHttpUrl, isPrivateNetworkAccessAllowed } from "../../core/request.ts";
import { ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

export interface ExcalidrawMcpContext {
  endpoint: URL;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
}

type ExcalidrawMcpActionHandler = (input: Record<string, unknown>, context: ExcalidrawMcpContext) => Promise<unknown>;
type ExcalidrawMcpToolResult = {
  isError?: boolean;
  content?: Array<{
    type?: string;
    text?: string;
    uri?: string;
    resource?: { text?: string; uri?: string };
  }>;
  structuredContent?: unknown;
  toolResult?: unknown;
};
const defaultEndpoint = "https://mcp.excalidraw.com";
const requestTimeoutMs = 30_000;
const excalidrawMcpJsonSchemaValidator = new CfWorkerJsonSchemaValidator();

export const excalidrawMcpActionHandlers: Record<string, ExcalidrawMcpActionHandler> = {
  read_me(_input, context) {
    return callExcalidrawMcpTool(context, "read_me", {});
  },
  create_view(input, context) {
    return callExcalidrawMcpTool(context, "create_view", {
      elements: requireString(input.elements, "elements"),
    });
  },
};

const excalidrawMcpToolNames = Object.keys(excalidrawMcpActionHandlers);

export function createExcalidrawMcpContext(
  values: Record<string, string>,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
  allowPrivateNetwork: boolean = isPrivateNetworkAccessAllowed(),
): ExcalidrawMcpContext {
  return {
    endpoint: normalizeExcalidrawMcpEndpoint(optionalString(values.mcpEndpoint), allowPrivateNetwork),
    fetcher,
    signal,
  };
}

export async function validateExcalidrawCredential(
  values: Record<string, string>,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const context = createExcalidrawMcpContext(values, fetcher, signal);
  const discoveredTools = await listExcalidrawMcpTools(context);
  const availableActions = excalidrawMcpToolNames.filter((toolName) => discoveredTools.includes(toolName));
  if (availableActions.length < excalidrawMcpToolNames.length) {
    throw new ProviderRequestError(502, "Excalidraw MCP endpoint did not expose the expected tools");
  }

  const endpointId = formatEndpointId(context.endpoint);
  const endpointHash = createHash("sha256").update(endpointId).digest("hex").slice(0, 16);
  return {
    profile: {
      accountId: `excalidraw_mcp:mcp:${endpointHash}`,
      displayName: `Excalidraw MCP · ${context.endpoint.host}`,
    },
    grantedScopes: [],
    metadata: {
      mcpEndpoint: endpointId,
      discoveredToolCount: discoveredTools.length,
      availableActions,
    },
  };
}

export function normalizeExcalidrawMcpEndpoint(
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

export async function callExcalidrawMcpTool(
  context: ExcalidrawMcpContext,
  toolName: "read_me" | "create_view",
  args: Record<string, unknown>,
): Promise<unknown> {
  const result = await withExcalidrawMcpClient(context, async (client) =>
    client.callTool(
      {
        name: toolName,
        arguments: args,
      },
      undefined,
      {
        timeout: requestTimeoutMs,
        signal: context.signal,
      },
    ),
  );

  return toolName === "create_view" ? normalizeCreateViewResult(result) : normalizeReadMeResult(result);
}

async function listExcalidrawMcpTools(context: ExcalidrawMcpContext): Promise<string[]> {
  const result = await withExcalidrawMcpClient(context, async (client) =>
    client.listTools(
      {},
      {
        timeout: requestTimeoutMs,
        signal: context.signal,
      },
    ),
  );
  return result.tools.map((tool) => tool.name);
}

async function withExcalidrawMcpClient<T>(
  context: ExcalidrawMcpContext,
  run: (client: Client) => Promise<T>,
): Promise<T> {
  const transport = new StreamableHTTPClientTransport(context.endpoint, {
    fetch: context.fetcher,
    requestInit: {
      headers: {
        "user-agent": providerUserAgent,
      },
    },
  });
  const client = new Client(
    { name: "oomol-connect-excalidraw-mcp", version: "1.0.0" },
    { jsonSchemaValidator: excalidrawMcpJsonSchemaValidator },
  );

  try {
    await client.connect(transport, { timeout: requestTimeoutMs, signal: context.signal });
    return await run(client);
  } catch (error) {
    throw mapExcalidrawMcpError(error);
  } finally {
    await client.close().catch(() => undefined);
  }
}

function normalizeCreateViewResult(result: ExcalidrawMcpToolResult): Record<string, unknown> {
  if (result.isError) {
    throw new ProviderRequestError(502, `Excalidraw MCP create_view failed: ${formatMcpToolContent(result)}`, result);
  }

  const structured = optionalRecord(result.structuredContent);
  const checkpointId = optionalString(structured?.checkpointId);
  if (!checkpointId) {
    throw new ProviderRequestError(502, "Excalidraw MCP create_view response missing checkpointId", result);
  }

  return {
    checkpointId,
    content: formatMcpToolContent(result),
  };
}

function normalizeReadMeResult(result: ExcalidrawMcpToolResult): Record<string, unknown> {
  if (result.isError) {
    throw new ProviderRequestError(502, `Excalidraw MCP read_me failed: ${formatMcpToolContent(result)}`, result);
  }

  return {
    content: formatMcpToolContent(result),
  };
}

function formatMcpToolContent(result: ExcalidrawMcpToolResult): string {
  const text = (result.content ?? [])
    .map((content) => {
      if (content.type === "text") {
        return content.text;
      }
      if (
        content.type === "resource" &&
        content.resource &&
        typeof content.resource === "object" &&
        "text" in content.resource
      ) {
        return content.resource.text;
      }
      if (content.type === "resource_link") {
        return content.uri;
      }
      return content.type;
    })
    .filter(Boolean)
    .join("\n")
    .trim();

  return text || "empty content";
}

function formatEndpointId(endpoint: URL): string {
  const pathname = endpoint.pathname === "/" ? "" : endpoint.pathname.replace(/\/+$/u, "");
  return `${endpoint.origin}${pathname}`;
}

function mapExcalidrawMcpError(error: unknown): ProviderRequestError {
  if (error instanceof ProviderRequestError) {
    return error;
  }
  if (error instanceof UnauthorizedError) {
    return new ProviderRequestError(401, "Excalidraw MCP endpoint requires authorization", error);
  }
  if (error instanceof StreamableHTTPError) {
    const status = error.code;
    return new ProviderRequestError(
      status === 401 || status === 403 ? 401 : status && status >= 400 && status < 500 ? 400 : 502,
      `Excalidraw MCP request failed: ${error.message}`,
      error,
    );
  }
  if (error instanceof McpError) {
    return error.code === ErrorCode.RequestTimeout
      ? new ProviderRequestError(504, "Excalidraw MCP request timed out", error)
      : new ProviderRequestError(502, `Excalidraw MCP request failed: ${error.message}`, error);
  }
  if (isAbortError(error)) {
    return new ProviderRequestError(504, "Excalidraw MCP request timed out", error);
  }
  return new ProviderRequestError(
    502,
    error instanceof Error ? `Excalidraw MCP request failed: ${error.message}` : "Excalidraw MCP request failed",
    error,
  );
}

function requireString(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, (message) => new ProviderRequestError(400, message));
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
}
