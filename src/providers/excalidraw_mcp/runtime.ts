import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderFetch } from "../provider-runtime.ts";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
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
  const tools = await listExcalidrawMcpTools(context);
  if (!tools.includes("read_me") || !tools.includes("create_view")) {
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
      mcpTools: [...tools].sort(),
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
      signal: context.signal,
    },
  });
  const client = new Client({ name: "oomol-connect-excalidraw-mcp", version: "1.0.0" });

  try {
    await client.connect(transport, { timeout: requestTimeoutMs });
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
