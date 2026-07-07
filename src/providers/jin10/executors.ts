import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";
import type { Jin10ActionName } from "./actions.ts";

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

const service = "jin10";
const jin10McpOrigin = "https://mcp.jin10.com";
const jin10McpEndpoint = "https://mcp.jin10.com/mcp";
const jin10QuoteCodesResourceUri = "quote://codes";
const jin10RequestTimeoutMs = 30_000;

type Jin10ActionContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
type Jin10ActionHandler = (input: Record<string, unknown>, context: Jin10ActionContext) => Promise<unknown>;
type Jin10McpToolResult = Awaited<ReturnType<Client["callTool"]>>;

interface Jin10McpToolSummary {
  name: string;
  description?: string;
}

export const jin10ActionHandlers: Record<Jin10ActionName, Jin10ActionHandler> = {
  list_quote_codes(_input, context) {
    return readJin10QuoteCodes(context);
  },
  get_quote(input, context) {
    return callJin10McpTool(context, "get_quote", input);
  },
  get_kline(input, context) {
    return callJin10McpTool(context, "get_kline", input);
  },
  list_flash(input, context) {
    return callJin10McpTool(context, "list_flash", input);
  },
  search_flash(input, context) {
    return callJin10McpTool(context, "search_flash", input);
  },
  list_news(input, context) {
    return callJin10McpTool(context, "list_news", input);
  },
  search_news(input, context) {
    return callJin10McpTool(context, "search_news", input);
  },
  get_news(input, context) {
    return callJin10McpTool(context, "get_news", input);
  },
  list_calendar(input, context) {
    return callJin10McpTool(context, "list_calendar", input);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, jin10ActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: jin10McpOrigin,
  auth: {
    type: "api_key_authorization",
    prefix: "Bearer ",
  },
  allowedEndpoint: (endpoint) => endpoint === "/mcp",
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const tools = await listJin10McpTools({
      apiKey: input.apiKey,
      fetcher,
      signal,
    });
    const tokenHash = hashJin10ApiKey(input.apiKey);

    return {
      profile: {
        accountId: `jin10:mcp:${tokenHash}`,
        displayName: `Jin10 MCP - ${tokenHash.slice(-6)}`,
      },
      grantedScopes: [],
      metadata: {
        mcpEndpoint: jin10McpEndpoint,
        mcpTools: tools.map((tool) => tool.name).sort(),
      },
    };
  },
};

async function listJin10McpTools(input: {
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}): Promise<Jin10McpToolSummary[]> {
  return withJin10McpClient(input, async (client) => {
    const result = await client.listTools(
      {},
      {
        timeout: jin10RequestTimeoutMs,
      },
    );
    return result.tools.map((tool) => ({
      name: tool.name,
      ...(tool.description ? { description: tool.description } : {}),
    }));
  });
}

async function callJin10McpTool(
  context: Jin10ActionContext,
  toolName: Exclude<Jin10ActionName, "list_quote_codes">,
  argumentsInput: Record<string, unknown>,
): Promise<unknown> {
  return withJin10McpClient(context, async (client) => {
    const result = await client.callTool(
      {
        name: toolName,
        arguments: argumentsInput,
      },
      undefined,
      {
        timeout: jin10RequestTimeoutMs,
      },
    );
    return normalizeJin10McpToolResult(toolName, result);
  });
}

async function readJin10QuoteCodes(context: Jin10ActionContext): Promise<unknown> {
  return withJin10McpClient(context, async (client) => {
    const result = await client.readResource(
      {
        uri: jin10QuoteCodesResourceUri,
      },
      {
        timeout: jin10RequestTimeoutMs,
      },
    );
    const content = result.contents[0];
    if (!content || !("text" in content)) {
      throw new ProviderRequestError(502, "jin10 quote code resource returned no text", result);
    }

    try {
      return JSON.parse(content.text) as unknown;
    } catch {
      throw new ProviderRequestError(502, "jin10 quote code resource returned invalid JSON", content.text);
    }
  });
}

async function withJin10McpClient<T>(
  input: {
    apiKey: string;
    fetcher: typeof fetch;
    signal?: AbortSignal;
  },
  run: (client: Client) => Promise<T>,
): Promise<T> {
  const headers = new Headers();
  headers.set("Authorization", `Bearer ${input.apiKey}`);
  headers.set("content-type", "application/json");
  headers.set("user-agent", providerUserAgent);

  const transport = new StreamableHTTPClientTransport(new URL(jin10McpEndpoint), {
    fetch: input.fetcher,
    requestInit: {
      headers,
      signal: input.signal,
    },
  });
  const client = new Client({
    name: "oomol-connect-jin10",
    version: "1.0.0",
  });

  try {
    await client.connect(transport, {
      timeout: jin10RequestTimeoutMs,
    });
    return await run(client);
  } catch (error) {
    throw mapJin10McpError(error);
  } finally {
    await client.close().catch(() => undefined);
  }
}

function normalizeJin10McpToolResult(toolName: string, result: Jin10McpToolResult): unknown {
  if ("toolResult" in result) {
    return result;
  }
  if (result.isError) {
    throw new ProviderRequestError(
      502,
      `jin10 MCP tool ${toolName} returned an error: ${formatJin10McpToolContent(result)}`,
      result,
    );
  }

  return result.structuredContent ?? result;
}

function formatJin10McpToolContent(result: Extract<Jin10McpToolResult, { content: unknown }>): string {
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

function mapJin10McpError(error: unknown): ProviderRequestError {
  if (error instanceof ProviderRequestError) {
    return error;
  }
  if (error instanceof UnauthorizedError) {
    return new ProviderRequestError(401, "Jin10 MCP API key is invalid or expired", error);
  }
  if (error instanceof StreamableHTTPError) {
    const status = error.code;
    return new ProviderRequestError(
      status === 401 || status === 403 ? 401 : status && status >= 400 && status < 500 ? 400 : 502,
      `jin10 MCP request failed: ${error.message}`,
      error,
    );
  }
  if (error instanceof McpError) {
    return new ProviderRequestError(502, `jin10 MCP request failed: ${error.message}`, error);
  }

  return new ProviderRequestError(
    502,
    error instanceof Error ? `jin10 MCP request failed: ${error.message}` : "jin10 MCP request failed",
    error,
  );
}

function hashJin10ApiKey(apiKey: string): string {
  return createHash("sha256").update(apiKey).digest("hex").slice(0, 16);
}
