import type { CredentialValidationResult } from "../../core/types.ts";
import type { Client } from "@modelcontextprotocol/client";

import { ProtocolError, SdkHttpError, UnauthorizedError } from "@modelcontextprotocol/client";
import { createHash } from "node:crypto";
import { optionalRecord, requiredString } from "../../core/cast.ts";
import { assertPublicHttpUrl, isPrivateNetworkAccessAllowed } from "../../core/request.ts";
import { withMcpClient } from "../mcp-client.ts";
import { providerInputError, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

const requestTimeoutMs = 5 * 60_000;

export interface BtMcpContext {
  endpoint: URL;
  authorizationToken: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

export function createBtMcpContext(
  values: Record<string, string>,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): BtMcpContext {
  return {
    endpoint: normalizeBtMcpEndpoint(values.serverUrl),
    authorizationToken: requiredString(values.authorizationToken, "authorizationToken", providerInputError),
    fetcher,
    signal,
  };
}

export async function validateBtMcpCredential(
  values: Record<string, string>,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const context = createBtMcpContext(values, fetcher, signal);
  const tools = await listBtMcpTools(context);
  if (tools.length === 0) {
    throw providerInputError("BT Panel MCP did not expose any tools for this connection");
  }
  const endpointHash = createHash("sha256").update(context.endpoint.origin).digest("hex").slice(0, 16);
  return {
    profile: {
      accountId: `bt_mcp:mcp:${endpointHash}`,
      displayName: `BT Panel MCP - ${context.endpoint.host}`,
    },
    grantedScopes: [],
    metadata: {
      mcpEndpoint: context.endpoint.toString(),
      discoveredToolCount: tools.length,
    },
  };
}

export async function listBtMcpTools(context: BtMcpContext): Promise<Array<Record<string, unknown>>> {
  return withBtMcpClient(context, async (client) => {
    const result = await client.listTools({}, { timeout: requestTimeoutMs, signal: context.signal });
    return result.tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      annotations: tool.annotations,
    }));
  });
}

export async function callBtMcpTool(
  context: BtMcpContext,
  input: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const toolName = requiredString(input.toolName, "toolName", providerInputError);
  const args = optionalRecord(input.arguments) ?? {};
  return withBtMcpClient(context, async (client) => {
    const result = await client.callTool(
      { name: toolName, arguments: args },
      { timeout: requestTimeoutMs, signal: context.signal },
    );
    if (!("toolResult" in result) && result.isError) {
      throw new ProviderRequestError(502, `BT Panel MCP tool ${toolName} returned an error`, result);
    }
    return { result };
  });
}

export function normalizeBtMcpEndpoint(value: unknown): URL {
  const allowPrivateNetwork = isPrivateNetworkAccessAllowed();
  const url = assertPublicHttpUrl(requiredString(value, "serverUrl", providerInputError), {
    fieldName: "serverUrl",
    createError: providerInputError,
    allowPrivateNetwork,
  });
  if (url.username || url.password) throw providerInputError("serverUrl must not include credentials");
  if (url.protocol === "http:" && !allowPrivateNetwork) {
    throw providerInputError("http serverUrl values require private-network access to be enabled");
  }
  if (!url.pathname.endsWith("/mcp")) throw providerInputError("serverUrl path must end with /mcp");
  url.hash = "";
  return url;
}

async function withBtMcpClient<T>(context: BtMcpContext, run: (client: Client) => Promise<T>): Promise<T> {
  return withMcpClient(
    {
      endpoint: context.endpoint,
      transport: "streamable_http",
      fetcher: context.fetcher,
      headers: new Headers({
        authorization: `Bearer ${context.authorizationToken}`,
        "user-agent": providerUserAgent,
      }),
      signal: context.signal,
      mapError: mapBtMcpError,
    },
    run,
  );
}

function mapBtMcpError(error: unknown): ProviderRequestError {
  if (error instanceof ProviderRequestError) return error;
  if (error instanceof UnauthorizedError) {
    return new ProviderRequestError(401, "BT Panel MCP credential is invalid or expired", error);
  }
  if (error instanceof SdkHttpError) {
    const status = error.status;
    return new ProviderRequestError(
      status === 401 || status === 403 ? 401 : status && status >= 400 && status < 500 ? 400 : 502,
      `BT Panel MCP request failed: ${error.message}`,
      error,
    );
  }
  if (error instanceof ProtocolError) {
    return new ProviderRequestError(502, `BT Panel MCP request failed: ${error.message}`, error);
  }
  return new ProviderRequestError(
    502,
    error instanceof Error ? `BT Panel MCP request failed: ${error.message}` : "BT Panel MCP request failed",
    error,
  );
}
