import type { CredentialValidationResult } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderActionHandlers, ProviderRuntimeHandler } from "../provider-runtime.ts";
import type { Client } from "@modelcontextprotocol/client";

import { ProtocolError, SdkError, SdkErrorCode, SdkHttpError, UnauthorizedError } from "@modelcontextprotocol/client";
import { createHash } from "node:crypto";
import { optionalRecord, requiredString } from "../../core/cast.ts";
import { withMcpClient } from "../mcp-client.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

export const mcdonaldsCnMcpEndpoint = "https://mcp.mcd.cn";
const requestTimeoutMs = 60_000;

type McdonaldsCnMcpToolResult = Awaited<ReturnType<Client["callTool"]>>;

export const mcdonaldsCnMcpActionHandlers: ProviderActionHandlers<
  "mcdonalds_cn_mcp",
  ProviderRuntimeHandler<ApiKeyProviderContext>
> = {
  async list_tools(_input, context) {
    return { tools: await discoverMcdonaldsCnMcpTools(context) };
  },
  async call_tool(input, context) {
    const toolName = requiredString(input.toolName, "toolName", providerInputError);
    const argumentsValue = readToolArguments(input.arguments);
    const result = await withMcdonaldsCnMcpClient(context, async (client) => {
      const toolResult = await client.callTool(
        { name: toolName, arguments: argumentsValue },
        { timeout: requestTimeoutMs, signal: context.signal },
      );
      return normalizeMcdonaldsCnMcpToolResult(toolName, toolResult);
    });
    return { result };
  },
};

export async function validateMcdonaldsCnMcpCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const context: ApiKeyProviderContext = { apiKey, fetcher, signal };
  const tools = await discoverMcdonaldsCnMcpTools(context);
  if (tools.length === 0) {
    throw new ProviderRequestError(502, "McDonald's China MCP did not expose any tools for this token");
  }

  const tokenHash = hashMcdonaldsCnMcpToken(apiKey);
  return {
    profile: {
      accountId: `mcdonalds-cn:mcp:${tokenHash}`,
      displayName: `McDonald's China MCP · ${tokenHash.slice(-6)}`,
    },
    grantedScopes: [],
    metadata: {
      mcpEndpoint: mcdonaldsCnMcpEndpoint,
      discoveredToolCount: tools.length,
      mcpTools: tools.map((tool) => tool.name).sort(),
    },
  };
}

async function discoverMcdonaldsCnMcpTools(context: ApiKeyProviderContext): Promise<
  Array<{
    name: string;
    description?: string;
    annotations?: Record<string, unknown>;
    inputSchema: Record<string, unknown>;
  }>
> {
  return withMcdonaldsCnMcpClient(context, async (client) => {
    const result = await client.listTools({}, { timeout: requestTimeoutMs, signal: context.signal });
    return result.tools.map((tool) => {
      const summary: {
        name: string;
        description?: string;
        annotations?: Record<string, unknown>;
        inputSchema: Record<string, unknown>;
      } = {
        name: tool.name,
        inputSchema: tool.inputSchema,
      };
      if (tool.description) summary.description = tool.description;
      if (tool.annotations) summary.annotations = tool.annotations;
      return summary;
    });
  });
}

async function withMcdonaldsCnMcpClient<T>(
  context: ApiKeyProviderContext,
  run: (client: Client) => Promise<T>,
): Promise<T> {
  const headers = new Headers({
    authorization: `Bearer ${context.apiKey}`,
    "user-agent": providerUserAgent,
  });
  return withMcpClient(
    {
      endpoint: new URL(mcdonaldsCnMcpEndpoint),
      transport: "streamable_http",
      fetcher: context.fetcher,
      headers,
      redirect: "error",
      signal: context.signal,
      protocolVersion: "legacy",
      mapError: mapMcdonaldsCnMcpError,
    },
    run,
  );
}

function readToolArguments(value: unknown): Record<string, unknown> {
  if (value === undefined) return {};
  const argumentsValue = optionalRecord(value);
  if (!argumentsValue) {
    throw new ProviderRequestError(400, "arguments must be a JSON object");
  }
  return argumentsValue;
}

function normalizeMcdonaldsCnMcpToolResult(toolName: string, result: McdonaldsCnMcpToolResult): unknown {
  if ("content" in result && result.isError) {
    throw new ProviderRequestError(
      502,
      `McDonald's China MCP tool ${toolName} returned an error: ${formatMcdonaldsCnMcpToolContent(result)}`,
      result,
    );
  }
  if ("toolResult" in result) return result;
  return result.structuredContent ?? result;
}

function formatMcdonaldsCnMcpToolContent(result: McdonaldsCnMcpToolResult): string {
  const content = "content" in result && Array.isArray(result.content) ? result.content : [];
  const text = content
    .map((item) => {
      if (item.type === "text") return item.text;
      if (item.type === "resource") return "text" in item.resource ? item.resource.text : item.resource.uri;
      if (item.type === "resource_link") return item.uri;
      return item.type;
    })
    .filter(Boolean)
    .join("; ");
  return text.slice(0, 300) || "empty error content";
}

function mapMcdonaldsCnMcpError(error: unknown): ProviderRequestError {
  if (error instanceof ProviderRequestError) return error;
  if (error instanceof UnauthorizedError) {
    return new ProviderRequestError(401, "McDonald's China MCP Token is invalid or expired", error);
  }
  if (error instanceof SdkHttpError) {
    const status = error.status;
    return new ProviderRequestError(
      status === 401 || status === 403
        ? 401
        : status === 429
          ? 429
          : status && status >= 400 && status < 500
            ? 400
            : 502,
      `McDonald's China MCP request failed: ${error.message}`,
      error,
    );
  }
  if (error instanceof SdkError && error.code === SdkErrorCode.RequestTimeout) {
    return new ProviderRequestError(504, "McDonald's China MCP request timed out", error);
  }
  if (error instanceof ProtocolError) {
    return new ProviderRequestError(502, `McDonald's China MCP request failed: ${error.message}`, error);
  }
  if (isAbortError(error)) {
    return new ProviderRequestError(504, "McDonald's China MCP request timed out", error);
  }
  return new ProviderRequestError(
    502,
    error instanceof Error
      ? `McDonald's China MCP request failed: ${error.message}`
      : "McDonald's China MCP request failed",
    error,
  );
}

function hashMcdonaldsCnMcpToken(token: string): string {
  return createHash("sha256").update(token).digest("hex").slice(0, 16);
}

function providerInputError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
}
