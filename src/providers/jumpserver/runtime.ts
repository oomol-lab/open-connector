import type { CredentialValidationResult } from "../../core/types.ts";
import type { JumpServerActionName } from "./actions.ts";

import { UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport, SseError } from "@modelcontextprotocol/sdk/client/sse.js";
import { McpError } from "@modelcontextprotocol/sdk/types.js";
import { createHash } from "node:crypto";
import { requiredString } from "../../core/cast.ts";
import { assertPublicHttpUrl, isPrivateNetworkAccessAllowed } from "../../core/request.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";
import { jumpServerMcpToolNames } from "./actions.ts";

type JumpServerActionHandler = (input: Record<string, unknown>, context: JumpServerMcpContext) => Promise<unknown>;
type JumpServerMcpToolResult = Awaited<ReturnType<Client["callTool"]>>;

export interface JumpServerMcpContext {
  endpoint: URL;
  token: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

const requestTimeoutMs = 60_000;

export const jumpServerActionHandlers: Record<JumpServerActionName, JumpServerActionHandler> = Object.fromEntries(
  jumpServerMcpToolNames.map((toolName) => [
    toolName,
    (input: Record<string, unknown>, context: JumpServerMcpContext) => callJumpServerMcpTool(context, toolName, input),
  ]),
) as Record<JumpServerActionName, JumpServerActionHandler>;

export function createJumpServerMcpContext(
  values: Record<string, string>,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): JumpServerMcpContext {
  return {
    endpoint: normalizeJumpServerMcpEndpoint(values.mcpEndpoint),
    token: requiredString(values.token, "token", credentialError),
    fetcher,
    signal,
  };
}

export async function validateJumpServerCredential(
  values: Record<string, string>,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const context = createJumpServerMcpContext(values, fetcher, signal);
  const discoveredTools = await listJumpServerMcpTools(context);
  const availableActions = jumpServerMcpToolNames.filter((toolName) => discoveredTools.includes(toolName));
  if (availableActions.length === 0) {
    throw credentialError("JumpServer MCP endpoint did not expose any supported tools");
  }
  const endpointHash = createHash("sha256").update(context.endpoint.origin).digest("hex").slice(0, 16);
  return {
    profile: {
      accountId: `jumpserver:mcp:${endpointHash}`,
      displayName: `JumpServer MCP · ${context.endpoint.host}`,
    },
    grantedScopes: [],
    metadata: {
      mcpEndpoint: context.endpoint.toString(),
      discoveredToolCount: discoveredTools.length,
      availableActions,
    },
  };
}

/**
 * Normalize a trusted self-hosted JumpServer MCP endpoint.
 *
 * Private-network HTTP endpoints require the deployment-level private-network
 * opt-in. Loopback, link-local, cloud metadata, reserved, multicast, and IPv6
 * targets remain blocked by the shared provider egress policy.
 */
export function normalizeJumpServerMcpEndpoint(
  value: unknown,
  allowPrivateNetwork: boolean = isPrivateNetworkAccessAllowed(),
): URL {
  const raw = requiredString(value, "mcpEndpoint", credentialError);
  const url = assertPublicHttpUrl(raw, {
    fieldName: "mcpEndpoint",
    createError: credentialError,
    allowPrivateNetwork,
  });
  if (url.username || url.password) {
    throw credentialError("mcpEndpoint must not include credentials");
  }
  if (url.protocol === "http:" && !allowPrivateNetwork) {
    throw credentialError("http mcpEndpoint URLs require private-network access to be enabled");
  }

  url.hash = "";
  url.search = "";
  url.pathname = url.pathname.replace(/\/+$/u, "") || "/sse";
  return url;
}

async function listJumpServerMcpTools(context: JumpServerMcpContext): Promise<string[]> {
  return withJumpServerMcpClient(context, async (client) => {
    const result = await client.listTools({}, { timeout: requestTimeoutMs });
    return result.tools.map((tool) => tool.name);
  });
}

async function callJumpServerMcpTool(
  context: JumpServerMcpContext,
  toolName: JumpServerActionName,
  args: Record<string, unknown>,
): Promise<unknown> {
  return withJumpServerMcpClient(context, async (client) => {
    const result = await client.callTool({ name: toolName, arguments: args }, undefined, { timeout: requestTimeoutMs });
    return normalizeJumpServerMcpToolResult(toolName, result);
  });
}

async function withJumpServerMcpClient<T>(
  context: JumpServerMcpContext,
  run: (client: Client) => Promise<T>,
): Promise<T> {
  const headers = new Headers({
    Authorization: `Bearer ${context.token}`,
    "user-agent": providerUserAgent,
  });
  const transport = new SSEClientTransport(context.endpoint, {
    fetch: context.fetcher,
    requestInit: { headers, signal: context.signal },
  });
  const client = new Client({ name: "oomol-connect-jumpserver", version: "1.0.0" });

  try {
    await client.connect(transport, { timeout: requestTimeoutMs });
    return await run(client);
  } catch (error) {
    throw mapJumpServerMcpError(error);
  } finally {
    await client.close().catch(() => undefined);
  }
}

function normalizeJumpServerMcpToolResult(toolName: string, result: JumpServerMcpToolResult): unknown {
  if ("toolResult" in result) return result;
  if (result.isError) {
    throw new ProviderRequestError(
      502,
      `JumpServer MCP tool ${toolName} returned an error: ${formatMcpToolContent(result)}`,
      result,
    );
  }
  if (result.structuredContent) return result.structuredContent;

  const textItems = result.content.filter((content) => content.type === "text");
  if (textItems.length === 1) {
    try {
      return JSON.parse(textItems[0]!.text) as unknown;
    } catch {
      // Preserve the MCP content envelope when JumpServer returns plain text.
    }
  }
  return result;
}

function formatMcpToolContent(result: Extract<JumpServerMcpToolResult, { content: unknown }>): string {
  const text = result.content
    .map((content) => {
      if (content.type === "text") return content.text;
      if (content.type === "resource") {
        return "text" in content.resource ? content.resource.text : content.resource.uri;
      }
      if (content.type === "resource_link") return content.uri;
      return content.type;
    })
    .filter(Boolean)
    .join("; ");
  return text.slice(0, 300) || "empty error content";
}

function mapJumpServerMcpError(error: unknown): ProviderRequestError {
  if (error instanceof ProviderRequestError) return error;
  if (error instanceof UnauthorizedError) {
    return new ProviderRequestError(401, "JumpServer MCP token is invalid or expired", error);
  }
  if (error instanceof SseError) {
    const status = error.code;
    return new ProviderRequestError(
      status === 401 || status === 403 ? 401 : status && status >= 400 && status < 500 ? 400 : 502,
      `JumpServer MCP connection failed: ${error.message}`,
      error,
    );
  }
  if (error instanceof McpError) {
    return new ProviderRequestError(502, `JumpServer MCP request failed: ${error.message}`, error);
  }
  if (isAbortError(error)) {
    return new ProviderRequestError(504, "JumpServer MCP request timed out", error);
  }
  return new ProviderRequestError(
    502,
    error instanceof Error ? `JumpServer MCP request failed: ${error.message}` : "JumpServer MCP request failed",
    error,
  );
}

function credentialError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
}
