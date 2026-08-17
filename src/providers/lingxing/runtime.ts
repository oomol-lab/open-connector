import type { CredentialValidationResult, ExecutionResult } from "../../core/types.ts";
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

const lingxingMcpHost = "openmcp.lingxing.com";
const lingxingRequestTimeoutMs = 30_000;
const lingxingToolIntervalMs = 1_000;
const maximumTrackedRateLimitKeys = 1_024;

interface LingxingCredential {
  endpoint: URL;
  mcpKey: string;
}

export interface LingxingContext extends LingxingCredential {
  fetcher: ProviderFetch;
  signal?: AbortSignal;
}

interface LingxingMcpRateLimiterOptions {
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
}

export interface LingxingMcpRateLimiter {
  run<T>(key: string, task: () => Promise<T>): Promise<T>;
}

type LingxingRequestPhase = "validate" | "execute";
type LingxingMcpToolResult = Awaited<ReturnType<Client["callTool"]>>;

class InMemoryLingxingMcpRateLimiter implements LingxingMcpRateLimiter {
  private readonly nextStartByKey = new Map<string, number>();
  private readonly tails = new Map<string, Promise<unknown>>();
  private readonly now: () => number;
  private readonly sleep: (milliseconds: number) => Promise<void>;

  constructor(options: LingxingMcpRateLimiterOptions) {
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
        this.nextStartByKey.set(key, this.now() + lingxingToolIntervalMs);
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

const lingxingMcpRateLimiter = createLingxingMcpRateLimiter();

class LingxingRequestError extends ProviderRequestError {
  readonly code: string;

  constructor(code: string, status: number, message: string, details?: unknown) {
    super(status, message, details);
    this.code = code;
  }
}

export const lingxingActionHandlers: Record<string, ProviderRuntimeHandler<LingxingContext>> = {
  list_tools(_input, context) {
    return listLingxingTools(context);
  },
  call_tool(input, context) {
    return callLingxingTool(context, input);
  },
};

export function createLingxingMcpRateLimiter(options: LingxingMcpRateLimiterOptions = {}): LingxingMcpRateLimiter {
  return new InMemoryLingxingMcpRateLimiter(options);
}

export function createLingxingRateLimitedFetch(
  fetcher: ProviderFetch,
  rateLimitKey: string,
  rateLimiter: LingxingMcpRateLimiter = lingxingMcpRateLimiter,
): ProviderFetch {
  return ((...arguments_: Parameters<ProviderFetch>) =>
    rateLimiter.run(rateLimitKey, () => fetcher(...arguments_))) as ProviderFetch;
}

export function createLingxingContext(
  values: Record<string, string>,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): LingxingContext {
  const credential = readLingxingCredential(values);
  return {
    ...credential,
    fetcher,
    signal,
  };
}

export function normalizeLingxingMcpEndpoint(value: unknown): URL {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ProviderRequestError(400, "Lingxing MCP Server URL is required");
  }

  let endpoint: URL;
  try {
    endpoint = new URL(value.trim());
  } catch {
    throw new ProviderRequestError(400, "Lingxing MCP Server URL must be a valid URL");
  }

  if (
    endpoint.protocol !== "https:" ||
    endpoint.hostname !== lingxingMcpHost ||
    (endpoint.port !== "" && endpoint.port !== "443")
  ) {
    throw new ProviderRequestError(400, `Lingxing MCP Server URL must use https://${lingxingMcpHost}`);
  }
  if (endpoint.username || endpoint.password) {
    throw new ProviderRequestError(400, "Lingxing MCP Server URL must not include username or password");
  }

  endpoint = assertPublicHttpUrl(endpoint.toString(), {
    fieldName: "serverUrl",
    createError: (message) => new ProviderRequestError(400, message),
  });
  endpoint.hash = "";
  return endpoint;
}

export async function validateLingxingCredential(
  values: Record<string, string>,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const context = createLingxingContext(values, fetcher, signal);
  const tools = await runLingxingMcp("validate", () => discoverLingxingTools(context));
  if (tools.length === 0) {
    throw new ProviderRequestError(502, "Lingxing MCP did not expose any tools for this account");
  }

  const credentialHash = hashLingxingCredential(context);
  return {
    profile: {
      accountId: `lingxing:mcp:${credentialHash}`,
      displayName: `Lingxing MCP · ${credentialHash.slice(-6)}`,
    },
    grantedScopes: [],
    metadata: {
      mcpHost: context.endpoint.hostname,
      discoveredToolCount: tools.length,
    },
  };
}

export async function listLingxingTools(context: LingxingContext): Promise<{
  tools: Array<{
    name: string;
    description?: string;
    annotations?: Record<string, unknown>;
    inputSchema: Record<string, unknown>;
  }>;
}> {
  return {
    tools: await runLingxingMcp("execute", () => discoverLingxingTools(context)),
  };
}

export async function callLingxingTool(
  context: LingxingContext,
  input: Record<string, unknown>,
): Promise<{ result: unknown }> {
  const toolName = requiredString(input.toolName, "toolName", (message) => new ProviderRequestError(400, message));
  const argumentsValue = readToolArguments(input.arguments);
  const result = await runLingxingMcp("execute", () =>
    withLingxingMcpClient(context, async (client) => {
      const toolResult = await client.callTool(
        {
          name: toolName,
          arguments: argumentsValue,
        },
        {
          timeout: lingxingRequestTimeoutMs,
          signal: context.signal,
        },
      );
      return normalizeLingxingMcpToolResult(toolName, toolResult);
    }),
  );
  return { result };
}

async function discoverLingxingTools(context: LingxingContext): Promise<
  Array<{
    name: string;
    description?: string;
    annotations?: Record<string, unknown>;
    inputSchema: Record<string, unknown>;
  }>
> {
  return withLingxingMcpClient(context, async (client) => {
    const result = await client.listTools(
      {},
      {
        timeout: lingxingRequestTimeoutMs,
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

async function withLingxingMcpClient<T>(context: LingxingContext, run: (client: Client) => Promise<T>): Promise<T> {
  const headers = new Headers();
  headers.set("X-Mcp-Key", context.mcpKey);
  headers.set("user-agent", providerUserAgent);
  return withMcpClient(
    {
      endpoint: context.endpoint,
      transport: "streamable_http",
      fetcher: createLingxingRateLimitedFetch(context.fetcher, hashLingxingRateLimitKey(context)),
      headers,
      redirect: "error",
      signal: context.signal,
      mapError: mapLingxingMcpError,
    },
    run,
  );
}

function readLingxingCredential(values: Record<string, string>): LingxingCredential {
  const mcpKey = values.mcpKey?.trim();
  if (!mcpKey) {
    throw new ProviderRequestError(400, "Lingxing X-Mcp-Key is required");
  }
  return {
    endpoint: normalizeLingxingMcpEndpoint(values.serverUrl),
    mcpKey,
  };
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

function normalizeLingxingMcpToolResult(toolName: string, result: LingxingMcpToolResult): unknown {
  if ("content" in result && result.isError) {
    throw new ProviderRequestError(
      502,
      `Lingxing MCP tool ${toolName} returned an error: ${formatLingxingMcpToolContent(result)}`,
      result,
    );
  }
  if ("toolResult" in result) {
    return result;
  }
  return result.structuredContent ?? result;
}

function formatLingxingMcpToolContent(result: LingxingMcpToolResult): string {
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

function mapLingxingMcpError(error: unknown): ProviderRequestError {
  if (error instanceof ProviderRequestError) {
    return error;
  }
  if (error instanceof UnauthorizedError) {
    return new ProviderRequestError(401, "Lingxing MCP token is invalid or expired", error);
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
      `Lingxing MCP request failed: ${error.message}`,
      error,
    );
  }
  if (error instanceof SdkError && error.code === SdkErrorCode.RequestTimeout) {
    return new ProviderRequestError(504, "Lingxing MCP request timed out", error);
  }
  if (error instanceof ProtocolError) {
    return new ProviderRequestError(502, `Lingxing MCP request failed: ${error.message}`, error);
  }
  if (isAbortError(error)) {
    return new ProviderRequestError(504, "Lingxing MCP request timed out", error);
  }
  return new ProviderRequestError(
    502,
    error instanceof Error ? `Lingxing MCP request failed: ${error.message}` : "Lingxing MCP request failed",
    error,
  );
}

async function runLingxingMcp<T>(phase: LingxingRequestPhase, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof ProviderRequestError && error.status === 401) {
      throw new LingxingRequestError(
        phase === "validate" ? "invalid_input" : "credential_expired",
        phase === "validate" ? 400 : 401,
        "Lingxing MCP Server URL or X-Mcp-Key is invalid",
        error,
      );
    }
    throw error;
  }
}

function hashLingxingCredential(credential: LingxingCredential): string {
  return createHash("sha256").update(credential.endpoint.toString()).digest("hex").slice(0, 16);
}

function hashLingxingRateLimitKey(credential: LingxingCredential): string {
  return createHash("sha256")
    .update(credential.endpoint.toString())
    .update("\0")
    .update(credential.mcpKey)
    .digest("hex");
}

export function toLingxingExecutionError(error: unknown): ExecutionResult {
  if (error instanceof LingxingRequestError) {
    return {
      ok: false,
      error: {
        code: error.code,
        message: error.message,
        details: { status: error.status, details: error.details },
      },
    };
  }
  return toProviderExecutionError(error, "Lingxing MCP request failed");
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
}
