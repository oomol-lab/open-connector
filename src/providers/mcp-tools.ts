import type { ProviderFetch } from "./provider-runtime.ts";
import type { ToolAnnotations } from "@modelcontextprotocol/client";

import {
  Client,
  ProtocolError,
  ProtocolErrorCode,
  SdkError,
  SdkErrorCode,
  SdkHttpError,
  SseError,
  UnauthorizedError,
} from "@modelcontextprotocol/client";
import { withMcpClient } from "./mcp-client.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerFetch,
  ProviderRequestError,
  providerUserAgent,
} from "./provider-runtime.ts";
const defaultMcpToolListMaxBytes = 16 * 1024 * 1024;
const defaultMcpToolListMaxPages = 100;
const defaultMcpToolListMaxTools = 10_000;
const defaultMcpToolListTimeoutMs = 60_000;
export type McpClientToolResult = Awaited<ReturnType<Client["callTool"]>>;
export interface McpToolSummary {
  name: string;
  description?: string;
  annotations?: ToolAnnotations;
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
}
export interface McpToolOptions {
  endpoint: string;
  service: string;
  fetcher?: ProviderFetch;
  headers?: Record<string, string>;
  redirect?: RequestRedirect;
  terminateSession?: boolean;
  requestTimeoutMs?: number;
  maxResponseBytes?: number;
  signal?: AbortSignal;
  toolListMaxBytes?: number;
  toolListMaxPages?: number;
  toolListMaxTools?: number;
  toolListTimeoutMs?: number;
}
async function withToolClient<T>(input: McpToolOptions, run: (client: Client) => Promise<T>): Promise<T> {
  const fetcher = input.fetcher ?? providerFetch;
  const limitedFetcher = createLimitedMcpFetch(fetcher, input.service, input.maxResponseBytes);
  return withMcpClient(
    {
      endpoint: new URL(input.endpoint),
      transport: "streamable_http",
      signal: input.signal,
      headers: { "user-agent": providerUserAgent, ...input.headers },
      redirect: input.redirect,
      fetcher: limitedFetcher,
      mapError: (error) => mapMcpError(input.service, error),
      terminateSession: input.terminateSession,
    },
    run,
  );
}

function createLimitedMcpFetch(
  fetcher: ProviderFetch,
  service: string,
  maxResponseBytes: number | undefined,
): ProviderFetch {
  if (maxResponseBytes === undefined) return fetcher;
  return async (url, init) => limitMcpResponse(await fetcher(url, init), service, maxResponseBytes);
}
interface ListMcpToolsOptions {
  includeOutputSchema?: boolean;
  includeAnnotations?: boolean;
}

export async function listMcpTools(
  input: McpToolOptions,
  options: ListMcpToolsOptions = {},
): Promise<McpToolSummary[]> {
  return withToolClient(input, async (client) => {
    const tools = await listAllStreamableHttpMcpTools(client, input);
    return tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      annotations: options.includeAnnotations ? tool.annotations : undefined,
      inputSchema: tool.inputSchema,
      outputSchema: options.includeOutputSchema ? tool.outputSchema : undefined,
    }));
  });
}

interface CallMcpToolOptions extends McpToolOptions {
  toolName: string;
  arguments: Record<string, unknown>;
  authorizeTool?: (tool: McpToolSummary | undefined) => void | Promise<void>;
  transformToolResult?: (result: McpClientToolResult) => McpClientToolResult;
}

export async function callMcpTool(input: CallMcpToolOptions): Promise<unknown> {
  return withToolClient(input, async (client) => {
    if (input.authorizeTool) {
      const tools = await listAllStreamableHttpMcpTools(client, input);
      const matchingTools = tools.filter((tool) => tool.name === input.toolName);
      if (matchingTools.length > 1) {
        throw new ProviderRequestError(
          502,
          `${input.service} MCP tools/list returned multiple definitions for the requested tool`,
          undefined,
          "provider_error",
        );
      }
      await input.authorizeTool(matchingTools[0]);
    }

    const requestTimeout = createProviderTimeout(input.signal, input.requestTimeoutMs);
    let result: McpClientToolResult;
    try {
      result = await client.callTool(
        {
          name: input.toolName,
          arguments: input.arguments,
        },
        { signal: requestTimeout.signal },
      );
    } finally {
      requestTimeout.cleanup();
    }
    const transformedResult = input.transformToolResult ? input.transformToolResult(result) : result;
    return normalizeMcpToolResult(input.service, input.toolName, transformedResult);
  });
}

async function limitMcpResponse(response: Response, service: string, maxBytes: number) {
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    await response.body?.cancel().catch(() => undefined);
    throw createMcpResponseTooLargeError(service, maxBytes);
  }
  if (!response.body) {
    return response;
  }

  let receivedBytes = 0;
  const body = response.body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        receivedBytes += chunk.byteLength;
        if (receivedBytes > maxBytes) {
          throw createMcpResponseTooLargeError(service, maxBytes);
        }
        controller.enqueue(chunk);
      },
    }),
  );
  const limitedResponse = new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
  Object.defineProperties(limitedResponse, {
    url: { value: response.url },
    redirected: { value: response.redirected },
    type: { value: response.type },
  });
  return limitedResponse;
}

function createMcpResponseTooLargeError(service: string, maxBytes: number) {
  return new ProviderRequestError(
    502,
    `${service} MCP response exceeds ${maxBytes} bytes`,
    undefined,
    "provider_error",
  );
}

async function listAllStreamableHttpMcpTools(client: Client, input: McpToolOptions) {
  const tools: Awaited<ReturnType<Client["listTools"]>>["tools"] = [];
  const seenCursors = new Set<string>();
  const maxBytes = input.toolListMaxBytes ?? defaultMcpToolListMaxBytes;
  const maxPages = input.toolListMaxPages ?? defaultMcpToolListMaxPages;
  const maxTools = input.toolListMaxTools ?? defaultMcpToolListMaxTools;
  const deadline = Date.now() + (input.toolListTimeoutMs ?? defaultMcpToolListTimeoutMs);
  let totalBytes = 0;
  let pageCount = 0;
  let cursor: string | undefined;
  do {
    if (pageCount >= maxPages) {
      throw new ProviderRequestError(
        502,
        `${input.service} MCP tools/list exceeded ${maxPages} pages`,
        undefined,
        "provider_error",
      );
    }
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      throw new ProviderRequestError(504, `${input.service} MCP tools/list timed out`, undefined, "provider_error");
    }
    const requestTimeout = createProviderTimeout(input.signal, input.requestTimeoutMs);
    let result: Awaited<ReturnType<Client["listTools"]>>;
    try {
      result = await client.request(
        { method: "tools/list", params: cursor === undefined ? {} : { cursor } },
        { timeout: remainingMs, signal: requestTimeout.signal },
      );
    } finally {
      requestTimeout.cleanup();
    }
    pageCount += 1;
    totalBytes += new TextEncoder().encode(JSON.stringify(result.tools)).byteLength;
    if (totalBytes > maxBytes) {
      throw new ProviderRequestError(
        502,
        `${input.service} MCP tools/list exceeded ${maxBytes} bytes`,
        undefined,
        "provider_error",
      );
    }
    if (tools.length + result.tools.length > maxTools) {
      throw new ProviderRequestError(
        502,
        `${input.service} MCP tools/list exceeded ${maxTools} tools`,
        undefined,
        "provider_error",
      );
    }
    tools.push(...result.tools);
    cursor = result.nextCursor;
    if (cursor !== undefined && seenCursors.has(cursor)) {
      throw new ProviderRequestError(
        502,
        `${input.service} MCP tools/list returned a repeated cursor`,
        undefined,
        "provider_error",
      );
    }
    if (cursor !== undefined) {
      seenCursors.add(cursor);
    }
  } while (cursor !== undefined);
  return tools;
}

function normalizeMcpToolResult(service: string, toolName: string, result: McpClientToolResult) {
  if ("content" in result && result.isError) {
    const message = formatMcpToolContent(result);
    if (message.startsWith("MCP error -32601:") || message.startsWith("MCP error -32602:")) {
      throw new ProviderRequestError(
        400,
        `${service} MCP tool ${toolName} rejected the input: ${message}`,
        undefined,
        "invalid_input",
      );
    }
    throw new ProviderRequestError(
      502,
      `${service} MCP tool ${toolName} returned an error: ${message}`,
      undefined,
      "provider_error",
    );
  }

  if ("toolResult" in result) {
    return result;
  }

  return result.structuredContent !== undefined ? result.structuredContent : result;
}

function formatMcpToolContent(result: McpClientToolResult) {
  const content = "content" in result && Array.isArray(result.content) ? result.content : [];
  const text = content
    .map((content) => {
      if (content.type === "text") {
        return content.text;
      }
      if (content.type === "resource") {
        return "text" in content.resource ? content.resource.text : content.resource.uri;
      }
      if (content.type === "resource_link") {
        return content.uri;
      }
      return content.type;
    })
    .filter(Boolean)
    .join("; ");

  return text.slice(0, 300) || "empty error content";
}

function mapMcpError(service: string, error: unknown) {
  if (error instanceof ProviderRequestError) {
    return error;
  }

  if (isAbortLikeError(error)) {
    return new ProviderRequestError(504, `${service} MCP request timed out`, undefined, "provider_error");
  }

  if (error instanceof SdkError && typeof error.data === "object" && error.data !== null) {
    const cause = "cause" in error.data ? error.data.cause : undefined;
    if (cause instanceof ProviderRequestError) {
      return cause;
    }
  }

  if (error instanceof UnauthorizedError) {
    return new ProviderRequestError(401, `${service} MCP token is invalid or expired`, undefined, "provider_error");
  }

  if (error instanceof SdkHttpError || error instanceof SseError) {
    const status = error instanceof SdkHttpError ? error.status : error.code;
    if (status === 429) {
      return new ProviderRequestError(
        429,
        `${service} MCP request failed: ${error.message}`,
        undefined,
        "rate_limited",
      );
    }
    return new ProviderRequestError(
      status === 401 || status === 403 ? status : status && status >= 400 && status < 500 ? 400 : 502,
      `${service} MCP request failed: ${error.message}`,
      undefined,
      "provider_error",
    );
  }

  if (error instanceof SdkError && error.code === SdkErrorCode.RequestTimeout) {
    return new ProviderRequestError(504, `${service} MCP request timed out`, undefined, "provider_error");
  }

  if (error instanceof ProtocolError) {
    if (error.code === ProtocolErrorCode.MethodNotFound || error.code === ProtocolErrorCode.InvalidParams) {
      return new ProviderRequestError(
        400,
        `${service} MCP request rejected the input: ${error.message}`,
        undefined,
        "invalid_input",
      );
    }
    return new ProviderRequestError(
      502,
      `${service} MCP request failed: ${error.message}`,
      undefined,
      "provider_error",
    );
  }

  return new ProviderRequestError(502, `${service} MCP request failed`, undefined, "provider_error");
}
