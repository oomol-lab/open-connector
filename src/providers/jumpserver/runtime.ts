import type { CredentialValidationResult } from "../../core/types.ts";
import type { JumpServerActionName } from "./actions.ts";

import { UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport, SseError } from "@modelcontextprotocol/sdk/client/sse.js";
import { McpError } from "@modelcontextprotocol/sdk/types.js";
import { createHash } from "node:crypto";
import { optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

type JumpServerActionHandler = (input: Record<string, unknown>, context: JumpServerMcpContext) => Promise<unknown>;
type JumpServerMcpToolResult = Awaited<ReturnType<Client["callTool"]>>;

export interface JumpServerMcpContext {
  endpoint: URL;
  token: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

interface JumpServerMcpToolSummary {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
}

interface JumpServerMcpToolPage {
  tools: JumpServerMcpToolSummary[];
  nextCursor?: string;
}

const requestTimeoutMs = 60_000;
const blockedMetadataHosts = new Set([
  "100.100.100.200",
  "169.254.169.254",
  "fd00:ec2::254",
  "instance-data.ec2.internal",
  "metadata",
  "metadata.azure.internal",
  "metadata.google.internal",
  "metadata.goog",
]);

export const jumpServerActionHandlers: Record<JumpServerActionName, JumpServerActionHandler> = {
  list_tools(input, context) {
    return listJumpServerMcpTools(context, optionalString(input.cursor));
  },
  call_tool(input, context) {
    return callJumpServerMcpTool(
      context,
      requiredString(input.toolName, "toolName", inputError),
      optionalRecord(input.arguments) ?? {},
    );
  },
};

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
  const page = await listJumpServerMcpTools(context);
  const endpointHash = createHash("sha256").update(context.endpoint.origin).digest("hex").slice(0, 16);
  return {
    profile: {
      accountId: `jumpserver:mcp:${endpointHash}`,
      displayName: `JumpServer MCP · ${context.endpoint.host}`,
    },
    grantedScopes: [],
    metadata: {
      mcpEndpoint: context.endpoint.toString(),
      discoveredToolCount: page.tools.length,
      hasMoreTools: Boolean(page.nextCursor),
    },
  };
}

/**
 * Normalize a trusted self-hosted JumpServer MCP endpoint.
 *
 * Loopback and private-network HTTP endpoints are intentional for the official
 * Docker deployment. Public endpoints must use HTTPS, and cloud metadata
 * targets are always rejected.
 */
export function normalizeJumpServerMcpEndpoint(value: unknown): URL {
  const raw = requiredString(value, "mcpEndpoint", credentialError);
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw credentialError("mcpEndpoint must be a valid URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw credentialError("mcpEndpoint must use http or https");
  }
  if (url.username || url.password) {
    throw credentialError("mcpEndpoint must not include credentials");
  }

  const hostname = normalizeHostname(url.hostname);
  if (isBlockedMetadataHost(hostname)) {
    throw credentialError("mcpEndpoint must not target a cloud metadata service");
  }
  if (isUnsafeIpAddress(hostname)) {
    throw credentialError("mcpEndpoint must not target a reserved, link-local, multicast, or IPv6 address");
  }
  if (url.protocol === "http:" && !isTrustedPrivateHostname(hostname)) {
    throw credentialError("public mcpEndpoint URLs must use https");
  }

  url.hash = "";
  url.search = "";
  url.pathname = url.pathname.replace(/\/+$/u, "") || "/sse";
  return url;
}

async function listJumpServerMcpTools(context: JumpServerMcpContext, cursor?: string): Promise<JumpServerMcpToolPage> {
  return withJumpServerMcpClient(context, async (client) => {
    const result = await client.listTools(cursor ? { cursor } : {}, { timeout: requestTimeoutMs });
    return {
      tools: result.tools.map((tool) => ({
        name: tool.name,
        ...(tool.description ? { description: tool.description } : {}),
        inputSchema: tool.inputSchema,
        ...(tool.outputSchema ? { outputSchema: tool.outputSchema } : {}),
      })),
      ...(result.nextCursor ? { nextCursor: result.nextCursor } : {}),
    };
  });
}

async function callJumpServerMcpTool(
  context: JumpServerMcpContext,
  toolName: string,
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

function normalizeHostname(value: string): string {
  const unwrapped = value.startsWith("[") && value.endsWith("]") ? value.slice(1, -1) : value;
  return unwrapped.toLowerCase().replace(/\.+$/u, "");
}

function isBlockedMetadataHost(hostname: string): boolean {
  return blockedMetadataHosts.has(hostname) || hostname.endsWith(".metadata.google.internal");
}

function isUnsafeIpAddress(hostname: string): boolean {
  if (hostname.includes(":")) return true;
  const octets = parseIpv4(hostname);
  if (!octets) return false;
  const [first, second, third, fourth] = octets;
  if (first === 127) return false;
  return (
    first === 0 ||
    (first === 169 && second === 254) ||
    (first === 192 && second === 0 && third === 0) ||
    (first === 192 && second === 0 && third === 2) ||
    (first === 198 && (second === 18 || second === 19)) ||
    (first === 198 && second === 51 && third === 100) ||
    (first === 203 && second === 0 && third === 113) ||
    first >= 224 ||
    (first === 100 && second === 100 && third === 100 && fourth === 200)
  );
}

function isTrustedPrivateHostname(hostname: string): boolean {
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".localdomain") ||
    hostname.endsWith(".internal") ||
    hostname.endsWith(".home") ||
    hostname.endsWith(".lan")
  ) {
    return true;
  }
  if (hostname.includes(":")) return false;

  const octets = parseIpv4(hostname);
  if (!octets) return false;
  const [first, second] = octets;
  return (
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
}

function parseIpv4(hostname: string): [number, number, number, number] | undefined {
  const parts = hostname.split(".");
  if (parts.length !== 4 || parts.some((part) => !/^\d+$/u.test(part))) return undefined;
  const octets = parts.map(Number);
  if (octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) return undefined;
  return octets as [number, number, number, number];
}

function credentialError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}

function inputError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
}
