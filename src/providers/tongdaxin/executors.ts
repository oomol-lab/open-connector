import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";
import type { Client } from "@modelcontextprotocol/client";

import { ProtocolError, SdkHttpError, UnauthorizedError } from "@modelcontextprotocol/client";
import { createHash } from "node:crypto";
import { optionalNumber, optionalRecord, optionalString } from "../../core/cast.ts";
import { readBoundedResponseBytes } from "../../core/request.ts";
import { withMcpClient } from "../mcp-client.ts";
import {
  defineApiKeyProviderExecutors,
  providerUserAgent,
  ProviderRequestError,
  requiredInputString,
} from "../provider-runtime.ts";
import { tongdaxinActions, tongdaxinReadOnlyToolNames } from "./actions.ts";
import { normalizeTongdaxinNamedActionOutput } from "./named-action-output.ts";
import { isTongdaxinNamedActionName, resolveTongdaxinNamedToolCall } from "./named-action-routing.ts";

const service = "tongdaxin";
const endpoint = new URL("https://txmcp.tdx.com.cn:3001/txmcp");
const requestTimeoutMs = 60_000;
const errorResponseMaxBytes = 64 * 1024;
const insufficientPointsToolError = "MCP error -32603: Your usage quota has been reached";
const insufficientPointsDescription = "TDX MCP quota is below 10. Please recharge before continuing.";
const rechargeOrigin = "https://vip.tdx.com.cn";
const rechargePath = "/site/app/pc-mall/main.html";
const supportedToolNames = new Set(tongdaxinReadOnlyToolNames);

interface TongdaxinTool {
  name: string;
  description?: string;
  annotations?: Record<string, unknown>;
  inputSchema: Record<string, unknown>;
}

const handlers: Record<string, ProviderRuntimeHandler<ApiKeyProviderContext>> = {
  async list_tools(_input, context) {
    return { tools: await discoverSupportedTools(context) };
  },
  async call_tool(input, context) {
    const toolName = requiredInputString(input.toolName, "toolName");
    const argumentsValue = input.arguments === undefined ? {} : optionalRecord(input.arguments);
    if (!argumentsValue) throw new ProviderRequestError(400, "arguments must be a JSON object");
    assertToolArgumentsSize(argumentsValue);
    const result = await withTongdaxinClient(context, false, (client) =>
      client.callTool(
        { name: toolName, arguments: argumentsValue },
        { timeout: requestTimeoutMs, signal: context.signal },
      ),
    );
    assertSufficientTongdaxinCredit(result);
    if (!("toolResult" in result) && result.isError) {
      throw new ProviderRequestError(502, `Tongdaxin MCP tool ${toolName} returned an error`, result);
    }
    if ("toolResult" in result || result.structuredContent) {
      return { result: "toolResult" in result ? result : result.structuredContent };
    }
    const text = result.content.find((item) => item.type === "text");
    return { result: text?.type === "text" ? text.text : result.content };
  },
};

for (const actionName of Object.keys(resolveNamedHandlers())) {
  handlers[actionName] = async (input, context) => {
    if (!isTongdaxinNamedActionName(actionName)) throw new ProviderRequestError(400, `Unknown action: ${actionName}`);
    const toolCall = resolveTongdaxinNamedToolCall(actionName, input);
    assertToolArgumentsSize(toolCall.arguments);
    const tools = await discoverSupportedTools(context);
    const tool = tools.find((candidate) => candidate.name === toolCall.toolName);
    if (!tool && toolCall.toolName !== "wenda_macro_query") {
      throw new ProviderRequestError(
        409,
        `Tongdaxin action ${actionName} is unavailable because this connection does not expose ${toolCall.toolName}`,
      );
    }
    if (
      tool &&
      (!supportedToolNames.has(tool.name) ||
        tool.annotations?.readOnlyHint !== true ||
        tool.annotations.destructiveHint === true)
    ) {
      throw new ProviderRequestError(
        403,
        `Tongdaxin MCP does not currently affirm ${tool.name} as a non-destructive read-only tool`,
      );
    }
    const result = await withTongdaxinClient(context, true, (client) =>
      client.callTool(
        { name: toolCall.toolName, arguments: toolCall.arguments },
        { timeout: requestTimeoutMs, signal: context.signal },
      ),
    );
    assertSufficientTongdaxinCredit(result);
    if (!("toolResult" in result) && result.isError) {
      throw new ProviderRequestError(502, `Tongdaxin MCP tool ${toolCall.toolName} returned an error`, result);
    }
    const normalized =
      "toolResult" in result ? result : (result.structuredContent ?? extractTextContent(result.content));
    return normalizeTongdaxinNamedActionOutput(actionName, normalized);
  };
}

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, handlers, {
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const context = { apiKey: input.apiKey, fetcher, signal };
    const tools = await discoverSupportedTools(context);
    if (tools.length === 0) {
      throw new ProviderRequestError(400, "Tongdaxin MCP did not expose any supported read-only tools");
    }
    const hash = createHash("sha256").update(input.apiKey).digest("hex").slice(0, 16);
    return {
      profile: {
        accountId: `tongdaxin:mcp:${hash}`,
        displayName: `Tongdaxin · ${hash.slice(-6)}`,
      },
      grantedScopes: [],
      metadata: { mcpEndpoint: endpoint.toString(), discoveredToolCount: tools.length },
    };
  },
};

async function discoverSupportedTools(context: ApiKeyProviderContext): Promise<TongdaxinTool[]> {
  const result = await withTongdaxinClient(context, true, (client) =>
    client.listTools({}, { timeout: requestTimeoutMs, signal: context.signal }),
  );
  return result.tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    annotations: tool.annotations,
    inputSchema: tool.inputSchema,
  }));
}

async function withTongdaxinClient<T>(
  context: ApiKeyProviderContext,
  retryOnSessionNotFound: boolean,
  run: (client: Client) => Promise<T>,
): Promise<T> {
  return withMcpClient(
    {
      endpoint,
      transport: "streamable_http",
      fetcher: createTongdaxinFetcher(context.fetcher),
      headers: {
        authorization: `Bearer ${context.apiKey}`,
        "user-agent": providerUserAgent,
      },
      redirect: "manual",
      signal: context.signal,
      retryOnSessionNotFound,
      mapError: mapTongdaxinError,
    },
    run,
  );
}

function mapTongdaxinError(error: unknown): unknown {
  if (error instanceof ProviderRequestError) return error;
  if (error instanceof UnauthorizedError) {
    return new ProviderRequestError(401, "Tongdaxin MCP denied this request");
  }
  if (error instanceof SdkHttpError) {
    if (error.status === 401) {
      return new ProviderRequestError(401, "Tongdaxin MCP denied this request");
    }
    const status = 400 <= error.status && error.status < 500 ? error.status : 502;
    return new ProviderRequestError(status, `Tongdaxin MCP request failed: ${error.message}`, error);
  }
  if (error instanceof ProtocolError) {
    return new ProviderRequestError(502, `Tongdaxin MCP request failed: ${error.message}`, error);
  }
  return new ProviderRequestError(
    502,
    error instanceof Error ? `Tongdaxin MCP request failed: ${error.message}` : "Tongdaxin MCP request failed",
    error,
  );
}

function createTongdaxinFetcher(fetcher: typeof fetch): typeof fetch {
  return (async (...arguments_: Parameters<typeof fetch>) => {
    const response = await fetcher(...arguments_);
    const details = await readInsufficientPoints(response);
    if (details) {
      void response.body?.cancel().catch(() => undefined);
      throw insufficientCreditError(details);
    }
    return response;
  }) as typeof fetch;
}

interface InsufficientPointsDetails {
  remainingCredit: number;
  rechargeUrl: string;
}

async function readInsufficientPoints(response: Response): Promise<InsufficientPointsDetails | undefined> {
  if (response.status !== 401) return undefined;
  try {
    const bytes = await readBoundedResponseBytes(response.clone(), {
      maxBytes: errorResponseMaxBytes,
      fieldName: "Tongdaxin MCP error response",
      createError: (message) => new Error(message),
    });
    const payload = optionalRecord(JSON.parse(new TextDecoder().decode(bytes)));
    const remainingCredit = optionalNumber(payload?.leftValue);
    const rechargeUrl = optionalString(payload?.recharge_url);
    if (
      payload?.error !== "unauthorized" ||
      payload?.error_description !== insufficientPointsDescription ||
      remainingCredit === undefined ||
      !isOfficialRechargeUrl(rechargeUrl)
    ) {
      return undefined;
    }
    return { remainingCredit, rechargeUrl };
  } catch {
    return undefined;
  }
}

function isOfficialRechargeUrl(value: string | undefined): value is string {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.origin === rechargeOrigin && url.pathname === rechargePath;
  } catch {
    return false;
  }
}

function assertSufficientTongdaxinCredit(result: Awaited<ReturnType<Client["callTool"]>>): void {
  if (!("content" in result) || result.isError !== true) return;
  const exhausted = result.content.some(
    (content) => content.type === "text" && content.text === insufficientPointsToolError,
  );
  if (exhausted) throw insufficientCreditError();
}

function insufficientCreditError(details?: InsufficientPointsDetails): ProviderRequestError {
  return new ProviderRequestError(
    402,
    "Tongdaxin AI points are insufficient. Recharge the account before retrying.",
    details ?? { rechargeUrl: `${rechargeOrigin}${rechargePath}#/page_product_ai_jfb` },
    "insufficient_credit",
  );
}

function resolveNamedHandlers() {
  return Object.fromEntries(
    tongdaxinActions
      .filter((action) => action.name !== "list_tools" && action.name !== "call_tool")
      .map((action) => [action.name, true]),
  );
}

function assertToolArgumentsSize(argumentsValue: Record<string, unknown>) {
  if (new TextEncoder().encode(JSON.stringify(argumentsValue)).byteLength > 64 * 1024) {
    throw new ProviderRequestError(400, "arguments must not exceed 65536 JSON bytes");
  }
}

function extractTextContent(content: Array<{ type: string; text?: string }>) {
  const text = content.find((item) => item.type === "text")?.text;
  if (text === undefined) return content;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
