import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";
import type { LuckinCoffeeActionName } from "./actions.ts";

import { UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport, StreamableHTTPError } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { McpError } from "@modelcontextprotocol/sdk/types.js";
import { createHash } from "node:crypto";
import {
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";
import { luckinMcpToolNames } from "./actions.ts";

const service = "luckin_coffee";
const luckinMcpOrigin = "https://gwmcp.lkcoffee.com";
const luckinMcpEndpoint = "https://gwmcp.lkcoffee.com/order/user/mcp";
const luckinRequestTimeoutMs = 60_000;

type LuckinActionContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
type LuckinActionHandler = (input: Record<string, unknown>, context: LuckinActionContext) => Promise<unknown>;
type LuckinMcpToolResult = Awaited<ReturnType<Client["callTool"]>>;

export const luckinActionHandlers: Record<string, LuckinActionHandler> = {};
for (const toolName of luckinMcpToolNames) {
  luckinActionHandlers[toolName] = (input: Record<string, unknown>, context: LuckinActionContext) =>
    callLuckinMcpTool(context, toolName, input);
}

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, luckinActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: luckinMcpOrigin,
  auth: {
    type: "api_key_authorization",
    prefix: "Bearer ",
  },
  allowedEndpoint: (endpoint) => endpoint === "/order/user/mcp",
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const tools = await listLuckinMcpTools({ apiKey: input.apiKey, fetcher, signal });
    const tokenHash = hashLuckinToken(input.apiKey);
    return {
      profile: {
        accountId: `luckin-coffee:mcp:${tokenHash}`,
        displayName: `Luckin Coffee MCP - ${tokenHash.slice(-6)}`,
      },
      grantedScopes: [],
      metadata: {
        mcpEndpoint: luckinMcpEndpoint,
        mcpTools: tools.sort(),
      },
    };
  },
};

async function listLuckinMcpTools(input: {
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}): Promise<string[]> {
  return withLuckinMcpClient(input, async (client) => {
    const result = await client.listTools({}, { timeout: luckinRequestTimeoutMs });
    return result.tools.map((tool) => tool.name);
  });
}

async function callLuckinMcpTool(
  context: LuckinActionContext,
  toolName: LuckinCoffeeActionName,
  argumentsInput: Record<string, unknown>,
): Promise<unknown> {
  return withLuckinMcpClient(context, async (client) => {
    const result = await client.callTool({ name: toolName, arguments: argumentsInput }, undefined, {
      timeout: luckinRequestTimeoutMs,
    });
    return normalizeLuckinMcpToolResult(toolName, result);
  });
}

async function withLuckinMcpClient<T>(
  input: { apiKey: string; fetcher: typeof fetch; signal?: AbortSignal },
  run: (client: Client) => Promise<T>,
): Promise<T> {
  const headers = new Headers();
  headers.set("authorization", `Bearer ${input.apiKey}`);
  headers.set("user-agent", providerUserAgent);
  const transport = new StreamableHTTPClientTransport(new URL(luckinMcpEndpoint), {
    fetch: input.fetcher,
    requestInit: { headers, signal: input.signal },
  });
  const client = new Client({ name: "oomol-connect-luckin-coffee", version: "1.0.0" });

  try {
    await client.connect(transport, { timeout: luckinRequestTimeoutMs });
    return await run(client);
  } catch (error) {
    throw mapLuckinMcpError(error);
  } finally {
    await client.close().catch(() => undefined);
  }
}

function normalizeLuckinMcpToolResult(toolName: string, result: LuckinMcpToolResult): unknown {
  if ("toolResult" in result) return result;
  if (result.isError) {
    throw new ProviderRequestError(
      502,
      `Luckin Coffee MCP tool ${toolName} returned an error: ${formatLuckinMcpToolContent(result)}`,
      result,
    );
  }
  if (result.structuredContent) return result.structuredContent;

  const textItems = result.content.filter((content) => content.type === "text");
  if (textItems.length === 1) {
    try {
      const payload: unknown = JSON.parse(textItems[0]!.text);
      return payload;
    } catch {
      // Preserve the MCP content envelope when the tool intentionally returns plain text.
    }
  }
  return result;
}

function formatLuckinMcpToolContent(result: Extract<LuckinMcpToolResult, { content: unknown }>): string {
  const text = result.content
    .map((content) => {
      if (content.type === "text") return content.text;
      if (content.type === "resource") return "text" in content.resource ? content.resource.text : content.resource.uri;
      if (content.type === "resource_link") return content.uri;
      return content.type;
    })
    .filter(Boolean)
    .join("; ");
  return text.slice(0, 300) || "empty error content";
}

function mapLuckinMcpError(error: unknown): ProviderRequestError {
  if (error instanceof ProviderRequestError) return error;
  if (error instanceof UnauthorizedError) {
    return new ProviderRequestError(401, "Luckin Coffee MCP token is invalid or expired", error);
  }
  if (error instanceof StreamableHTTPError) {
    const status = error.code;
    return new ProviderRequestError(
      status === 401 || status === 403
        ? 401
        : status === 429
          ? 429
          : status && status >= 400 && status < 500
            ? 400
            : 502,
      `Luckin Coffee MCP request failed: ${error.message}`,
      error,
    );
  }
  if (error instanceof McpError) {
    return new ProviderRequestError(502, `Luckin Coffee MCP request failed: ${error.message}`, error);
  }
  return new ProviderRequestError(
    502,
    error instanceof Error ? `Luckin Coffee MCP request failed: ${error.message}` : "Luckin Coffee MCP request failed",
    error,
  );
}

function hashLuckinToken(token: string): string {
  return createHash("sha256").update(token).digest("hex").slice(0, 16);
}
