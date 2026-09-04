import type { CredentialValidationResult, ExecutionResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ProviderFetch, ProviderRuntimeHandler } from "../provider-runtime.ts";
import type { Client } from "@modelcontextprotocol/client";

import { UnauthorizedError } from "@modelcontextprotocol/client";
import { SdkHttpError } from "@modelcontextprotocol/client";
import { ProtocolError, SdkError, SdkErrorCode } from "@modelcontextprotocol/client";
import { createHash } from "node:crypto";
import { optionalRecord, requiredString } from "../../core/cast.ts";
import { assertPublicHttpUrl } from "../../core/request.ts";
import { withMcpClient } from "../mcp-client.ts";
import {
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
  toProviderExecutionError,
} from "../provider-runtime.ts";

const dingTalkMcpHost = "mcp-gw.dingtalk.com";

interface DingTalkMcpContext {
  endpoint: URL;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
}

type DingTalkMcpRequestPhase = "validate" | "execute";
type DingTalkMcpToolResult = Awaited<ReturnType<Client["callTool"]>>;

export const dingTalkMcpActionHandlers: ProviderActionHandlers<
  "dingtalk_mcp",
  ProviderRuntimeHandler<DingTalkMcpContext>
> = {
  list_tools(_input, context) {
    return listDingTalkMcpTools(context);
  },
  call_tool(input, context) {
    return callDingTalkMcpTool(context, input);
  },
};

export function createDingTalkMcpContext(
  values: Record<string, string>,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): DingTalkMcpContext {
  return {
    endpoint: normalizeDingTalkMcpEndpoint(values.mcpUrl),
    fetcher,
    signal,
  };
}

function normalizeDingTalkMcpEndpoint(value: unknown): URL {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ProviderRequestError(400, "DingTalk MCP Server URL is required");
  }

  let endpoint: URL;
  try {
    endpoint = new URL(value.trim());
  } catch {
    throw new ProviderRequestError(400, "DingTalk MCP Server URL must be a valid URL");
  }

  if (
    endpoint.protocol !== "https:" ||
    endpoint.hostname !== dingTalkMcpHost ||
    (endpoint.port !== "" && endpoint.port !== "443")
  ) {
    throw new ProviderRequestError(400, `DingTalk MCP Server URL must use https://${dingTalkMcpHost}`);
  }
  if (endpoint.username || endpoint.password) {
    throw new ProviderRequestError(400, "DingTalk MCP Server URL must not include username or password");
  }

  endpoint = assertPublicHttpUrl(endpoint.toString(), {
    fieldName: "mcpUrl",
    createError: (message) => new ProviderRequestError(400, message),
  });
  endpoint.hash = "";
  return endpoint;
}

export async function validateDingTalkMcpCredential(
  values: Record<string, string>,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const context = createDingTalkMcpContext(values, fetcher, signal);
  const tools = await withDingTalkMcpAuthRemap("validate", () => discoverDingTalkMcpTools(context));
  if (tools.length === 0) {
    throw new ProviderRequestError(502, "DingTalk MCP did not expose any tools for this account");
  }

  const credentialHash = createHash("sha256").update(context.endpoint.toString()).digest("hex").slice(0, 16);
  return {
    profile: {
      accountId: `dingtalk_mcp:mcp:${credentialHash}`,
      displayName: `DingTalk MCP · ${credentialHash.slice(-6)}`,
    },
    grantedScopes: [],
    metadata: {
      mcpHost: context.endpoint.hostname,
      discoveredToolCount: tools.length,
    },
  };
}

async function listDingTalkMcpTools(context: DingTalkMcpContext): Promise<{
  tools: Array<{
    name: string;
    description?: string;
    annotations?: Record<string, unknown>;
    inputSchema: Record<string, unknown>;
  }>;
}> {
  return {
    tools: await withDingTalkMcpAuthRemap("execute", () => discoverDingTalkMcpTools(context)),
  };
}

async function callDingTalkMcpTool(
  context: DingTalkMcpContext,
  input: Record<string, unknown>,
): Promise<{ result: unknown }> {
  const toolName = requiredString(input.toolName, "toolName", (message) => new ProviderRequestError(400, message));
  const argumentsValue = readToolArguments(input.arguments);
  const result = await withDingTalkMcpAuthRemap("execute", () =>
    withDingTalkMcpClient(context, async (client) => {
      const toolResult = await client.callTool(
        {
          name: toolName,
          arguments: argumentsValue,
        },
        {
          signal: context.signal,
        },
      );
      return normalizeDingTalkMcpToolResult(toolName, toolResult);
    }),
  );
  return { result };
}

async function discoverDingTalkMcpTools(context: DingTalkMcpContext): Promise<
  Array<{
    name: string;
    description?: string;
    annotations?: Record<string, unknown>;
    inputSchema: Record<string, unknown>;
  }>
> {
  return withDingTalkMcpClient(context, async (client) => {
    const result = await client.listTools(
      {},
      {
        signal: context.signal,
      },
    );
    return result.tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      annotations: tool.annotations,
      inputSchema: tool.inputSchema,
    }));
  });
}

async function withDingTalkMcpClient<T>(context: DingTalkMcpContext, run: (client: Client) => Promise<T>): Promise<T> {
  const headers = new Headers();
  headers.set("user-agent", providerUserAgent);
  return withMcpClient(
    {
      endpoint: context.endpoint,
      transport: "streamable_http",
      fetcher: context.fetcher,
      headers,
      redirect: "error",
      signal: context.signal,
      mapError: mapDingTalkMcpError,
    },
    run,
  );
}

function readToolArguments(value: unknown): Record<string, unknown> {
  if (value === undefined) {
    return {};
  }
  const argumentsValue = optionalRecord(value);
  if (!argumentsValue) {
    throw new ProviderRequestError(400, "arguments must be a JSON object");
  }
  return argumentsValue;
}

function normalizeDingTalkMcpToolResult(toolName: string, result: DingTalkMcpToolResult): unknown {
  if ("content" in result && result.isError) {
    throw new ProviderRequestError(
      502,
      `DingTalk MCP tool ${toolName} returned an error: ${formatDingTalkMcpToolContent(result)}`,
      result,
    );
  }
  if ("toolResult" in result) {
    return result;
  }
  return result.structuredContent ?? result;
}

function formatDingTalkMcpToolContent(result: DingTalkMcpToolResult): string {
  const content = "content" in result && Array.isArray(result.content) ? result.content : [];
  const text = content
    .map((item) => {
      if (item.type === "text") {
        return item.text;
      }
      if (item.type === "resource") {
        return "text" in item.resource ? item.resource.text : item.resource.uri;
      }
      if (item.type === "resource_link") {
        return item.uri;
      }
      return item.type;
    })
    .filter(Boolean)
    .join("; ");

  return text.slice(0, 300) || "empty error content";
}

function mapDingTalkMcpError(error: unknown): ProviderRequestError {
  if (error instanceof ProviderRequestError) {
    return error;
  }
  if (error instanceof UnauthorizedError) {
    return new ProviderRequestError(401, "DingTalk MCP URL is invalid or expired", error);
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
      `DingTalk MCP request failed: ${error.message}`,
      error,
    );
  }
  if (error instanceof SdkError && error.code === SdkErrorCode.RequestTimeout) {
    return new ProviderRequestError(504, "DingTalk MCP request timed out", error);
  }
  if (error instanceof ProtocolError) {
    return new ProviderRequestError(502, `DingTalk MCP request failed: ${error.message}`, error);
  }
  if (isAbortLikeError(error)) {
    return new ProviderRequestError(504, "DingTalk MCP request timed out", error);
  }
  return new ProviderRequestError(
    502,
    error instanceof Error ? `DingTalk MCP request failed: ${error.message}` : "DingTalk MCP request failed",
    error,
  );
}

async function withDingTalkMcpAuthRemap<T>(phase: DingTalkMcpRequestPhase, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof ProviderRequestError && error.status === 401) {
      throw new ProviderRequestError(phase === "validate" ? 400 : 401, "DingTalk MCP URL is invalid or expired", error);
    }
    throw error;
  }
}

export function toDingTalkMcpExecutionError(error: unknown): ExecutionResult {
  return toProviderExecutionError(error, "DingTalk MCP request failed");
}
