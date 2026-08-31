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
import { providerUserAgent, ProviderRequestError, toProviderExecutionError } from "../provider-runtime.ts";

const wecomMcpHost = "qyapi.weixin.qq.com";
const wecomRequestTimeoutMs = 30_000;
const wecomToolIntervalMs = 1_000;
const maximumTrackedRateLimitKeys = 1_024;

interface WeComCredential {
  endpoint: URL;
}

export interface WeComContext extends WeComCredential {
  fetcher: ProviderFetch;
  signal?: AbortSignal;
}

interface WeComMcpRateLimiterOptions {
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
}

export interface WeComMcpRateLimiter {
  run<T>(key: string, task: () => Promise<T>): Promise<T>;
}

type WeComRequestPhase = "validate" | "execute";
type WeComMcpToolResult = Awaited<ReturnType<Client["callTool"]>>;

class InMemoryWeComMcpRateLimiter implements WeComMcpRateLimiter {
  private readonly nextStartByKey = new Map<string, number>();
  private readonly tails = new Map<string, Promise<unknown>>();
  private readonly now: () => number;
  private readonly sleep: (milliseconds: number) => Promise<void>;

  constructor(options: WeComMcpRateLimiterOptions) {
    this.now = options.now ?? Date.now;
    this.sleep =
      options.sleep ?? ((milliseconds) => new Promise<void>((resolve) => globalThis.setTimeout(resolve, milliseconds)));
  }

  async run<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(key) ?? Promise.resolve();
    const current = previous
      .catch(() => undefined)
      .then(async () => {
        const now = this.now();
        this.pruneExpiredKeys(now);
        const waitMs = Math.max(0, (this.nextStartByKey.get(key) ?? now) - now);
        if (waitMs > 0) {
          await this.sleep(waitMs);
        }
        this.nextStartByKey.delete(key);
        this.nextStartByKey.set(key, this.now() + wecomToolIntervalMs);
        return await task();
      });
    this.tails.set(key, current);

    try {
      return (await current) as T;
    } finally {
      if (this.tails.get(key) === current) {
        this.tails.delete(key);
      }
    }
  }

  private pruneExpiredKeys(now: number): void {
    if (this.nextStartByKey.size < maximumTrackedRateLimitKeys) {
      return;
    }
    for (const [key, nextStart] of this.nextStartByKey) {
      if (nextStart <= now) {
        this.nextStartByKey.delete(key);
      }
    }
  }
}

const wecomMcpRateLimiter = createWeComMcpRateLimiter();

export const wecomActionHandlers: ProviderActionHandlers<"wecom_mcp", ProviderRuntimeHandler<WeComContext>> = {
  list_tools(_input, context) {
    return listWeComTools(context);
  },
  call_tool(input, context) {
    return callWeComTool(context, input);
  },
};

export function createWeComMcpRateLimiter(options: WeComMcpRateLimiterOptions = {}): WeComMcpRateLimiter {
  return new InMemoryWeComMcpRateLimiter(options);
}

export function createWeComRateLimitedFetch(
  fetcher: ProviderFetch,
  rateLimitKey: string,
  rateLimiter: WeComMcpRateLimiter = wecomMcpRateLimiter,
): ProviderFetch {
  return ((...arguments_: Parameters<ProviderFetch>) =>
    rateLimiter.run(rateLimitKey, () => fetcher(...arguments_))) as ProviderFetch;
}

export function createWeComContext(
  values: Record<string, string>,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): WeComContext {
  const credential = readWeComCredential(values);
  return {
    ...credential,
    fetcher,
    signal,
  };
}

export function normalizeWeComMcpEndpoint(value: unknown): URL {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ProviderRequestError(400, "WeCom MCP Server URL is required");
  }

  let endpoint: URL;
  try {
    endpoint = new URL(value.trim());
  } catch {
    throw new ProviderRequestError(400, "WeCom MCP Server URL must be a valid URL");
  }

  if (
    endpoint.protocol !== "https:" ||
    endpoint.hostname !== wecomMcpHost ||
    (endpoint.port !== "" && endpoint.port !== "443")
  ) {
    throw new ProviderRequestError(400, `WeCom MCP Server URL must use https://${wecomMcpHost}`);
  }
  if (endpoint.username || endpoint.password) {
    throw new ProviderRequestError(400, "WeCom MCP Server URL must not include username or password");
  }

  endpoint = assertPublicHttpUrl(endpoint.toString(), {
    fieldName: "mcpUrl",
    createError: (message) => new ProviderRequestError(400, message),
  });
  endpoint.hash = "";
  return endpoint;
}

export async function validateWeComCredential(
  values: Record<string, string>,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const context = createWeComContext(values, fetcher, signal);
  const tools = await runWeComMcp("validate", () => discoverWeComTools(context));
  if (tools.length === 0) {
    throw new ProviderRequestError(502, "WeCom MCP did not expose any tools for this account");
  }

  const credentialHash = hashWeComCredential(context);
  return {
    profile: {
      accountId: `wecom_mcp:mcp:${credentialHash}`,
      displayName: `WeCom MCP · ${credentialHash.slice(-6)}`,
    },
    grantedScopes: [],
    metadata: {
      mcpHost: context.endpoint.hostname,
      discoveredToolCount: tools.length,
    },
  };
}

export async function listWeComTools(context: WeComContext): Promise<{
  tools: Array<{
    name: string;
    description?: string;
    annotations?: Record<string, unknown>;
    inputSchema: Record<string, unknown>;
  }>;
}> {
  return {
    tools: await runWeComMcp("execute", () => discoverWeComTools(context)),
  };
}

export async function callWeComTool(
  context: WeComContext,
  input: Record<string, unknown>,
): Promise<{ result: unknown }> {
  const toolName = requiredString(input.toolName, "toolName", (message) => new ProviderRequestError(400, message));
  const argumentsValue = readToolArguments(input.arguments);
  const result = await runWeComMcp("execute", () =>
    withWeComMcpClient(context, async (client) => {
      const toolResult = await client.callTool(
        {
          name: toolName,
          arguments: argumentsValue,
        },
        {
          timeout: wecomRequestTimeoutMs,
          signal: context.signal,
        },
      );
      return normalizeWeComMcpToolResult(toolName, toolResult);
    }),
  );
  return { result };
}

async function discoverWeComTools(context: WeComContext): Promise<
  Array<{
    name: string;
    description?: string;
    annotations?: Record<string, unknown>;
    inputSchema: Record<string, unknown>;
  }>
> {
  return withWeComMcpClient(context, async (client) => {
    const result = await client.listTools(
      {},
      {
        timeout: wecomRequestTimeoutMs,
        signal: context.signal,
      },
    );
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
      if (tool.description) {
        summary.description = tool.description;
      }
      if (tool.annotations) {
        summary.annotations = tool.annotations;
      }
      return summary;
    });
  });
}

async function withWeComMcpClient<T>(context: WeComContext, run: (client: Client) => Promise<T>): Promise<T> {
  const headers = new Headers();
  headers.set("user-agent", providerUserAgent);
  return withMcpClient(
    {
      endpoint: context.endpoint,
      transport: "streamable_http",
      fetcher: createWeComRateLimitedFetch(context.fetcher, hashWeComRateLimitKey(context)),
      headers,
      redirect: "error",
      signal: context.signal,
      mapError: mapWeComMcpError,
    },
    run,
  );
}

function readWeComCredential(values: Record<string, string>): WeComCredential {
  return { endpoint: normalizeWeComMcpEndpoint(values.mcpUrl) };
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

function normalizeWeComMcpToolResult(toolName: string, result: WeComMcpToolResult): unknown {
  if ("content" in result && result.isError) {
    throw new ProviderRequestError(
      502,
      `WeCom MCP tool ${toolName} returned an error: ${formatWeComMcpToolContent(result)}`,
      result,
    );
  }
  if ("toolResult" in result) {
    return result;
  }
  return result.structuredContent ?? result;
}

function formatWeComMcpToolContent(result: WeComMcpToolResult): string {
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

function mapWeComMcpError(error: unknown): ProviderRequestError {
  if (error instanceof ProviderRequestError) {
    return error;
  }
  if (error instanceof UnauthorizedError) {
    return new ProviderRequestError(401, "WeCom MCP token is invalid or expired", error);
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
      `WeCom MCP request failed: ${error.message}`,
      error,
    );
  }
  if (error instanceof SdkError && error.code === SdkErrorCode.RequestTimeout) {
    return new ProviderRequestError(504, "WeCom MCP request timed out", error);
  }
  if (error instanceof ProtocolError) {
    return new ProviderRequestError(502, `WeCom MCP request failed: ${error.message}`, error);
  }
  if (isAbortError(error)) {
    return new ProviderRequestError(504, "WeCom MCP request timed out", error);
  }
  return new ProviderRequestError(
    502,
    error instanceof Error ? `WeCom MCP request failed: ${error.message}` : "WeCom MCP request failed",
    error,
  );
}

async function runWeComMcp<T>(phase: WeComRequestPhase, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof ProviderRequestError && error.status === 401) {
      throw new ProviderRequestError(phase === "validate" ? 400 : 401, "WeCom MCP URL is invalid or expired", error);
    }
    throw error;
  }
}

function hashWeComCredential(credential: WeComCredential): string {
  return createHash("sha256").update(credential.endpoint.toString()).digest("hex").slice(0, 16);
}

function hashWeComRateLimitKey(credential: WeComCredential): string {
  return createHash("sha256").update(credential.endpoint.toString()).update("\0").digest("hex");
}

export function toWeComExecutionError(error: unknown): ExecutionResult {
  return toProviderExecutionError(error, "WeCom MCP request failed");
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
}
