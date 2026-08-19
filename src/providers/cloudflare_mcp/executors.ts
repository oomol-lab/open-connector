import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { BearerProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";
import type { Client } from "@modelcontextprotocol/client";

import { UnauthorizedError } from "@modelcontextprotocol/client";
import { SdkHttpError } from "@modelcontextprotocol/client";
import { ProtocolError } from "@modelcontextprotocol/client";
import { createHash } from "node:crypto";
import { withMcpClient } from "../mcp-client.ts";
import { defineBearerProviderExecutors, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

const service = "cloudflare_mcp";
const cloudflareMcpEndpoint = "https://mcp.cloudflare.com/mcp";
const cloudflareMcpRequestTimeoutMs = 60_000;

type CloudflareMcpToolResult = Awaited<ReturnType<Client["callTool"]>>;

export const cloudflareMcpActionHandlers: ProviderActionHandlers<
  "cloudflare_mcp",
  ProviderRuntimeHandler<BearerProviderContext>
> = {
  docs(input: Record<string, unknown>, context: BearerProviderContext) {
    return callCloudflareMcpTool(context, "docs", input);
  },
  search(input: Record<string, unknown>, context: BearerProviderContext) {
    return callCloudflareMcpTool(context, "search", input);
  },
  execute(input: Record<string, unknown>, context: BearerProviderContext) {
    return callCloudflareMcpTool(context, "execute", input);
  },
};

export const executors: ProviderExecutors = defineBearerProviderExecutors(service, cloudflareMcpActionHandlers, {
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateCloudflareMcpCredential(input.apiKey, fetcher, signal);
  },
  async oauth2(input, { fetcher, signal }) {
    return validateCloudflareMcpCredential(input.accessToken, fetcher, signal);
  },
};

async function validateCloudflareMcpCredential(accessToken: string, fetcher: typeof fetch, signal?: AbortSignal) {
  const tools = await listCloudflareMcpTools({ accessToken, fetcher, signal });
  const toolNames = tools.map((tool) => tool.name).sort();
  const tokenHash = createHash("sha256").update(accessToken).digest("hex").slice(0, 16);
  return {
    profile: {
      accountId: `cloudflare:mcp:${tokenHash}`,
      displayName: `Cloudflare MCP · ${tokenHash.slice(-6)}`,
    },
    metadata: {
      mcpEndpoint: cloudflareMcpEndpoint,
      mcpTools: toolNames,
    },
  };
}

async function listCloudflareMcpTools(input: { accessToken: string; fetcher: typeof fetch; signal?: AbortSignal }) {
  return withCloudflareMcpClient(input, async (client) => {
    const result = await client.listTools(
      {},
      {
        timeout: cloudflareMcpRequestTimeoutMs,
        signal: input.signal,
      },
    );
    return result.tools;
  });
}

async function callCloudflareMcpTool(
  context: BearerProviderContext,
  toolName: string,
  argumentsInput: Record<string, unknown>,
): Promise<unknown> {
  return withCloudflareMcpClient(context, async (client) => {
    const result = await client.callTool(
      { name: toolName, arguments: argumentsInput },
      {
        timeout: cloudflareMcpRequestTimeoutMs,
        signal: context.signal,
      },
    );
    return normalizeCloudflareMcpToolResult(toolName, result);
  });
}

async function withCloudflareMcpClient<T>(
  input: { accessToken: string; fetcher: typeof fetch; signal?: AbortSignal },
  run: (client: Client) => Promise<T>,
): Promise<T> {
  const headers = new Headers();
  headers.set("authorization", `Bearer ${input.accessToken}`);
  headers.set("user-agent", providerUserAgent);
  return withMcpClient(
    {
      endpoint: new URL(cloudflareMcpEndpoint),
      transport: "streamable_http",
      fetcher: input.fetcher,
      headers,
      signal: input.signal,
      protocolVersion: "modern",
      mapError: mapCloudflareMcpError,
    },
    run,
  );
}

function normalizeCloudflareMcpToolResult(toolName: string, result: CloudflareMcpToolResult): unknown {
  if ("toolResult" in result) return result;
  if (result.isError) {
    throw new ProviderRequestError(
      502,
      `Cloudflare MCP tool ${toolName} returned an error: ${formatCloudflareMcpToolContent(result)}`,
      result,
    );
  }
  if (result.structuredContent) return result.structuredContent;

  const textItems = result.content.filter((content) => content.type === "text");
  if (textItems.length === 1) {
    try {
      return JSON.parse(textItems[0]!.text) as unknown;
    } catch {
      return textItems[0]!.text;
    }
  }
  return result;
}

function formatCloudflareMcpToolContent(result: Extract<CloudflareMcpToolResult, { content: unknown }>): string {
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

function mapCloudflareMcpError(error: unknown): ProviderRequestError {
  if (error instanceof ProviderRequestError) return error;
  if (error instanceof UnauthorizedError) {
    return new ProviderRequestError(401, "Cloudflare MCP credential is invalid or expired", error);
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
      `Cloudflare MCP request failed: ${error.message}`,
      error,
    );
  }
  if (error instanceof ProtocolError) {
    return new ProviderRequestError(502, `Cloudflare MCP request failed: ${error.message}`, error);
  }
  return new ProviderRequestError(
    502,
    error instanceof Error ? `Cloudflare MCP request failed: ${error.message}` : "Cloudflare MCP request failed",
    error,
  );
}
