import type { CredentialValidators } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";
import type { Client } from "@modelcontextprotocol/client";

import { withMcpClient } from "../mcp-client.ts";
import { defineApiKeyProviderExecutors, ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

const endpoint = "https://stargate.yingmi.com/mcp/v2";
const timeoutMs = 60_000;

async function withClient<T>(
  context: ApiKeyProviderContext,
  phase: "validate" | "execute",
  run: (client: Client) => Promise<T>,
): Promise<T> {
  const headers = new Headers({ "x-api-key": context.apiKey, "user-agent": providerUserAgent });
  return withMcpClient(
    {
      endpoint: new URL(endpoint),
      transport: "streamable_http",
      fetcher: context.fetcher,
      headers,
      signal: context.signal,
      mapError: (error) => mapYingmiMcpError(error, phase),
    },
    run,
  );
}

function mapYingmiMcpError(error: unknown, phase: "validate" | "execute"): ProviderRequestError {
  const status = readErrorStatus(error);
  if (status === 401 || status === 403)
    return new ProviderRequestError(
      phase === "validate" ? 400 : 401,
      "Yingmi MCP API Key is invalid or expired",
      error,
    );
  if (status === 429) return new ProviderRequestError(429, "Yingmi MCP request was rate limited", error);
  return new ProviderRequestError(
    status && status >= 400 && status < 500 ? 400 : 502,
    error instanceof Error ? `Yingmi MCP request failed: ${error.message}` : "Yingmi MCP request failed",
    error,
  );
}

export const executors: import("../../core/types.ts").ProviderExecutors = defineApiKeyProviderExecutors("yingmi_mcp", {
  async list_tools(_input, context) {
    const result = await withClient(context, "execute", (client) => client.listTools({}, { timeout: timeoutMs }));
    return { tools: result.tools };
  },
  async call_tool(input, context) {
    const result = await withClient(context, "execute", (client) =>
      client.callTool(
        { name: String(input.toolName), arguments: input.arguments as Record<string, unknown> },
        { timeout: timeoutMs },
      ),
    );
    if (result.isError)
      throw new ProviderRequestError(502, `Yingmi MCP tool ${String(input.toolName)} returned an error`, result);
    return { result };
  },
});
export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const tools = await withClient({ apiKey: input.apiKey, fetcher, signal }, "validate", (client) =>
      client.listTools({}, { timeout: timeoutMs }),
    );
    if (tools.tools.length === 0)
      throw new ProviderRequestError(400, "Yingmi MCP did not expose any tools for this API Key");
    const bytes = new TextEncoder().encode(input.apiKey);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const keyHash = Array.from(new Uint8Array(digest))
      .slice(0, 8)
      .map((value) => value.toString(16).padStart(2, "0"))
      .join("");
    return {
      profile: { accountId: `yingmi-mcp:${keyHash}`, displayName: `Yingmi MCP · ${keyHash.slice(-6)}` },
      grantedScopes: [],
      metadata: { mcpEndpoint: endpoint, discoveredToolCount: tools.tools.length },
    };
  },
};

function readErrorStatus(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const value = "code" in error ? error.code : "status" in error ? error.status : undefined;
  return typeof value === "number" ? value : undefined;
}
