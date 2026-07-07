import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
  ProxyExecutionResult,
} from "../../core/types.ts";
import type { FlomoActionName, FlomoMcpToolName } from "./actions.ts";

import { UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport, StreamableHTTPError } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { McpError } from "@modelcontextprotocol/sdk/types.js";
import { createHash } from "node:crypto";
import { optionalString, requiredString } from "../../core/cast.ts";
import {
  createProviderProxyUrl,
  defineProviderExecutors,
  normalizeProviderProxyHeaders,
  providerUserAgent,
  ProviderRequestError,
  readProviderProxyResponse,
  toProviderProxyError,
} from "../provider-runtime.ts";

const service = "flomo";
const flomoWebhookHost = "flomoapp.com";
const flomoWebhookPathPrefix = "/iwh/";
const flomoMcpEndpoint = "https://flomoapp.com/mcp";
const flomoMcpTokenField = "token";
const flomoRequestTimeoutMs = 30_000;

type FlomoActionHandler = (input: Record<string, unknown>, context: FlomoActionContext) => Promise<unknown>;
type FlomoMcpToolResult = Awaited<ReturnType<Client["callTool"]>>;

interface FlomoWebhookContext {
  authType: "api_key";
  webhookUrl: URL;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

interface FlomoMcpContext {
  authType: "custom_credential";
  token: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

type FlomoActionContext = FlomoWebhookContext | FlomoMcpContext;

interface FlomoMcpToolSummary {
  name: string;
  description?: string;
}

export const flomoActionHandlers: Record<FlomoActionName, FlomoActionHandler> = {
  create_memo(input, context) {
    if (context.authType === "custom_credential") {
      return callFlomoMcpTool({
        context,
        toolName: "memo_create",
        arguments: buildCreateMemoMcpArguments(input),
      });
    }

    return createFlomoMemo({
      webhookUrl: context.webhookUrl,
      input,
      fetcher: context.fetcher,
      signal: context.signal,
    });
  },
  memo_update(input, context) {
    return callRequiredMcpAction("memo_update", input, context);
  },
  memo_search(input, context) {
    return callRequiredMcpAction("memo_search", input, context);
  },
  memo_batch_get(input, context) {
    return callRequiredMcpAction("memo_batch_get", input, context);
  },
  memo_recommended(input, context) {
    return callRequiredMcpAction("memo_recommended", input, context);
  },
  tag_tree(input, context) {
    return callRequiredMcpAction("tag_tree", input, context);
  },
  tag_search(input, context) {
    return callRequiredMcpAction("tag_search", input, context);
  },
  tag_rename(input, context) {
    return callRequiredMcpAction("tag_rename", input, context);
  },
  memory_user(input, context) {
    return callRequiredMcpAction("memory_user", input, context);
  },
  memory_context(input, context) {
    return callRequiredMcpAction("memory_context", input, context);
  },
  get_daily_review(input, context) {
    return callRequiredMcpAction("get_daily_review", input, context);
  },
  get_format_guide(input, context) {
    return callRequiredMcpAction("get_format_guide", input, context);
  },
  get_tag_guide(input, context) {
    return callRequiredMcpAction("get_tag_guide", input, context);
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<FlomoActionContext>({
  service,
  handlers: flomoActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<FlomoActionContext> {
    const credential = await context.getCredential(service);
    if (credential?.authType === "custom_credential") {
      return {
        authType: "custom_credential",
        token: requireFlomoMcpToken(credential.values),
        fetcher,
        signal: context.signal,
      };
    }
    if (credential?.authType === "api_key") {
      return {
        authType: "api_key",
        webhookUrl: parseFlomoWebhookUrl(credential.apiKey),
        fetcher,
        signal: context.signal,
      };
    }

    throw new ProviderRequestError(401, "Configure flomo credentials first.");
  },
});

export const proxy: ProviderProxyExecutor = async (input, context) => {
  try {
    const credential = await context.getCredential(service);
    if (credential?.authType === "api_key") {
      const endpointUrl = createProviderProxyUrl(`https://${flomoWebhookHost}`, input.endpoint, input.query);
      if (endpointUrl.pathname !== flomoWebhookPathPrefix.slice(0, -1)) {
        throw new ProviderRequestError(400, "flomo webhook proxy endpoint must be /iwh");
      }

      const webhookUrl = parseFlomoWebhookUrl(credential.apiKey);
      for (const [key, value] of endpointUrl.searchParams) {
        webhookUrl.searchParams.set(key, value);
      }
      return await requestFlomoProxy(webhookUrl, input, new Headers(), context.signal);
    }

    if (credential?.authType === "custom_credential") {
      const url = createProviderProxyUrl(`https://${flomoWebhookHost}`, input.endpoint, input.query);
      if (url.pathname !== new URL(flomoMcpEndpoint).pathname) {
        throw new ProviderRequestError(400, "flomo MCP proxy endpoint must be /mcp");
      }

      const headers = new Headers();
      headers.set("authorization", `Bearer ${requireFlomoMcpToken(credential.values)}`);
      return await requestFlomoProxy(url, input, headers, context.signal);
    }

    throw new ProviderRequestError(401, "Configure flomo credentials first.");
  } catch (error) {
    return toProviderProxyError(error, "flomo request failed");
  }
};

export const credentialValidators: CredentialValidators = {
  async apiKey(input) {
    const webhookUrl = parseFlomoWebhookUrl(input.apiKey);
    const suffix = buildFlomoWebhookLabel(webhookUrl);

    return {
      profile: {
        accountId: `flomo:${hashFlomoWebhookUrl(webhookUrl)}`,
        displayName: `flomo · ${suffix}`,
      },
      grantedScopes: [],
      metadata: {
        webhookHost: webhookUrl.host,
        webhookPathSuffix: suffix,
      },
    };
  },
  async customCredential(input, { fetcher, signal }) {
    const token = requireFlomoMcpToken(input.values);
    const tools = await listFlomoMcpTools({
      token,
      fetcher,
      signal,
    });
    const tokenHash = hashFlomoMcpToken(token);

    return {
      profile: {
        accountId: `flomo:mcp:${tokenHash}`,
        displayName: `flomo MCP · ${tokenHash.slice(-6)}`,
      },
      grantedScopes: [],
      metadata: {
        mcpEndpoint: flomoMcpEndpoint,
        mcpTools: tools.map((tool) => tool.name).sort(),
      },
    };
  },
};

async function callRequiredMcpAction(
  toolName: FlomoMcpToolName,
  input: Record<string, unknown>,
  context: FlomoActionContext,
): Promise<unknown> {
  if (context.authType !== "custom_credential") {
    throw new ProviderRequestError(400, `flomo action ${toolName} requires custom_credential auth`);
  }

  return callFlomoMcpTool({
    context,
    toolName,
    arguments: input,
  });
}

async function createFlomoMemo(input: {
  webhookUrl: URL;
  input: Record<string, unknown>;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}): Promise<unknown> {
  const timeoutSignal = AbortSignal.timeout(flomoRequestTimeoutMs);
  const signal = input.signal ? AbortSignal.any([input.signal, timeoutSignal]) : timeoutSignal;

  try {
    const response = await input.fetcher(input.webhookUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": providerUserAgent,
      },
      body: JSON.stringify({
        content: requiredString(input.input.content, "content", flomoInputError),
        ...(input.input.contentType === "markdown" || input.input.format === "markdown"
          ? { content_type: "markdown" }
          : {}),
      }),
      signal,
    });

    const text = await response.text();
    const body = parseFlomoResponseBody(text);
    if (!response.ok) {
      throw new ProviderRequestError(
        response.status >= 400 && response.status < 500 ? 400 : 502,
        buildFlomoHttpErrorMessage(response.status, text),
        body,
      );
    }

    return body;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeoutSignal.aborted && isAbortError(error)) {
      throw new ProviderRequestError(504, "flomo webhook request timed out", error);
    }

    throw new ProviderRequestError(
      502,
      error instanceof Error ? `flomo webhook request failed: ${error.message}` : "flomo webhook request failed",
      error,
    );
  }
}

async function requestFlomoProxy(
  url: URL,
  input: { method: string; headers?: Record<string, unknown>; body?: unknown },
  headers: Headers,
  signal?: AbortSignal,
): Promise<ProxyExecutionResult> {
  const proxyHeaders = normalizeProviderProxyHeaders(input.headers);
  for (const [key, value] of headers) {
    proxyHeaders.set(key, value);
  }
  proxyHeaders.set("user-agent", providerUserAgent);

  const init: RequestInit = {
    method: input.method,
    headers: proxyHeaders,
  };
  if (input.body !== undefined) {
    init.body = typeof input.body === "string" ? input.body : JSON.stringify(input.body);
    if (!proxyHeaders.has("content-type") && typeof input.body !== "string") {
      proxyHeaders.set("content-type", "application/json");
    }
  }

  const timeoutSignal = AbortSignal.timeout(flomoRequestTimeoutMs);
  init.signal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;

  try {
    const response = await fetch(url, init);
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new ProviderRequestError(
        response.status >= 400 && response.status < 500 ? 400 : 502,
        buildFlomoHttpErrorMessage(response.status, text),
        text,
      );
    }

    return { ok: true, response: await readProviderProxyResponse(response) };
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeoutSignal.aborted && isAbortError(error)) {
      throw new ProviderRequestError(504, "flomo request timed out", error);
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `flomo request failed: ${error.message}` : "flomo request failed",
      error,
    );
  }
}

function parseFlomoWebhookUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new ProviderRequestError(400, "a valid flomo incoming webhook URL is required");
  }

  if (url.protocol !== "https:" || url.host !== flomoWebhookHost) {
    throw new ProviderRequestError(400, "flomo incoming webhook URL must start with https://flomoapp.com/iwh/");
  }
  if (!url.pathname.startsWith(flomoWebhookPathPrefix) || url.pathname.length <= flomoWebhookPathPrefix.length) {
    throw new ProviderRequestError(400, "flomo incoming webhook URL must include the /iwh/ webhook path");
  }

  return url;
}

function buildFlomoWebhookLabel(webhookUrl: URL): string {
  const path = webhookUrl.pathname.endsWith("/") ? webhookUrl.pathname.slice(0, -1) : webhookUrl.pathname;
  const token = path.slice(flomoWebhookPathPrefix.length);
  return token.slice(-6);
}

function hashFlomoWebhookUrl(webhookUrl: URL): string {
  return createHash("sha256").update(webhookUrl.toString()).digest("hex").slice(0, 16);
}

function hashFlomoMcpToken(token: string): string {
  return createHash("sha256").update(token).digest("hex").slice(0, 16);
}

function requireFlomoMcpToken(values: Record<string, string>): string {
  const token = optionalString(values[flomoMcpTokenField]);
  if (!token) {
    throw new ProviderRequestError(400, "flomo MCP token is required");
  }
  return token;
}

function buildCreateMemoMcpArguments(input: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (key !== "contentType") {
      output[key] = value;
    }
  }
  if (output.format == null && input.contentType === "markdown") {
    output.format = "markdown";
  }
  return output;
}

async function listFlomoMcpTools(input: {
  token: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}): Promise<FlomoMcpToolSummary[]> {
  return withFlomoMcpClient(input, async (client) => {
    const result = await client.listTools(
      {},
      {
        timeout: flomoRequestTimeoutMs,
      },
    );
    return result.tools.map((tool) => ({
      name: tool.name,
      ...(tool.description ? { description: tool.description } : {}),
    }));
  });
}

async function callFlomoMcpTool(input: {
  context: FlomoMcpContext;
  toolName: FlomoMcpToolName | "memo_create";
  arguments: Record<string, unknown>;
}): Promise<unknown> {
  return withFlomoMcpClient(input.context, async (client) => {
    const result = await client.callTool(
      {
        name: input.toolName,
        arguments: input.arguments,
      },
      undefined,
      {
        timeout: flomoRequestTimeoutMs,
      },
    );
    return normalizeMcpToolResult(input.toolName, result);
  });
}

async function withFlomoMcpClient<T>(
  input: {
    token: string;
    fetcher: typeof fetch;
    signal?: AbortSignal;
  },
  run: (client: Client) => Promise<T>,
): Promise<T> {
  const headers = new Headers();
  headers.set("Authorization", `Bearer ${input.token}`);
  headers.set("user-agent", providerUserAgent);

  const transport = new StreamableHTTPClientTransport(new URL(flomoMcpEndpoint), {
    fetch: input.fetcher,
    requestInit: {
      headers,
      signal: input.signal,
    },
  });
  const client = new Client({
    name: "oomol-connect-flomo",
    version: "1.0.0",
  });

  try {
    await client.connect(transport, {
      timeout: flomoRequestTimeoutMs,
    });
    return await run(client);
  } catch (error) {
    throw mapFlomoMcpError(error);
  } finally {
    await client.close().catch(() => undefined);
  }
}

function normalizeMcpToolResult(toolName: string, result: FlomoMcpToolResult): unknown {
  if ("toolResult" in result) {
    return result;
  }
  if (result.isError) {
    throw new ProviderRequestError(
      502,
      `flomo MCP tool ${toolName} returned an error: ${formatMcpToolContent(result)}`,
      result,
    );
  }

  return result.structuredContent ?? result;
}

function formatMcpToolContent(result: Extract<FlomoMcpToolResult, { content: unknown }>): string {
  const text = result.content
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

function mapFlomoMcpError(error: unknown): ProviderRequestError {
  if (error instanceof ProviderRequestError) {
    return error;
  }
  if (error instanceof UnauthorizedError) {
    return new ProviderRequestError(401, "flomo MCP token is invalid or expired", error);
  }
  if (error instanceof StreamableHTTPError) {
    const status = error.code;
    return new ProviderRequestError(
      status === 401 || status === 403 ? 401 : status && status >= 400 && status < 500 ? 400 : 502,
      `flomo MCP request failed: ${error.message}`,
      error,
    );
  }
  if (error instanceof McpError) {
    return new ProviderRequestError(502, `flomo MCP request failed: ${error.message}`, error);
  }

  return new ProviderRequestError(
    502,
    error instanceof Error ? `flomo MCP request failed: ${error.message}` : "flomo MCP request failed",
    error,
  );
}

function parseFlomoResponseBody(text: string): unknown {
  if (!text) {
    throw new ProviderRequestError(502, "flomo webhook returned an empty response");
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "flomo webhook returned non-JSON response");
  }
}

function buildFlomoHttpErrorMessage(status: number, text: string): string {
  const trimmed = text.trim();
  if (!trimmed) {
    return `flomo webhook request failed with HTTP ${status}`;
  }

  return `flomo webhook request failed with HTTP ${status}: ${trimmed.slice(0, 200)}`;
}

function flomoInputError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
}
