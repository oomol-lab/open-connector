import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { OAuthProviderContext } from "../provider-runtime.ts";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";

import { UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js";
import { StreamableHTTPError } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { McpError } from "@modelcontextprotocol/sdk/types.js";
import { createHash } from "node:crypto";
import { withMcpClient } from "../mcp-client.ts";
import { defineOAuthProviderExecutors, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";
import { sunsamaMcpOfficialActions } from "./official-actions.ts";

const service = "sunsama_mcp";
const sunsamaMcpEndpoint = "https://api.sunsama.com/mcp";
const sunsamaMcpRequestTimeoutMs = 60_000;

async function withSunsamaMcpClient<T>(
  input: { accessToken: string; fetcher: typeof fetch; signal?: AbortSignal },
  phase: "validate" | "execute",
  run: (client: Client) => Promise<T>,
): Promise<T> {
  const headers = new Headers();
  headers.set("authorization", `Bearer ${input.accessToken}`);
  headers.set("user-agent", providerUserAgent);
  return withMcpClient(
    {
      endpoint: new URL(sunsamaMcpEndpoint),
      transport: "streamable_http",
      fetcher: input.fetcher,
      headers,
      signal: input.signal,
      mapError: (error) => mapSunsamaMcpError(error, phase),
    },
    run,
  );
}

async function callSunsamaMcpTool(
  context: OAuthProviderContext,
  toolName: string,
  argumentsInput: Record<string, unknown>,
): Promise<{ result: unknown }> {
  const result = await withSunsamaMcpClient(context, "execute", (client) =>
    client.callTool({ name: toolName, arguments: argumentsInput }, undefined, {
      timeout: sunsamaMcpRequestTimeoutMs,
      signal: context.signal,
    }),
  );
  if (!("toolResult" in result) && result.isError) {
    throw new ProviderRequestError(502, `Sunsama MCP tool ${toolName} returned an error`, result);
  }
  return { result };
}

const officialToolHandlers: Record<
  string,
  (input: Record<string, unknown>, context: OAuthProviderContext) => Promise<{ result: unknown }>
> = {};
for (const action of sunsamaMcpOfficialActions) {
  officialToolHandlers[action.name] = (input, context) => callSunsamaMcpTool(context, action.name, input);
}

export const executors: ProviderExecutors = defineOAuthProviderExecutors(
  service,
  {
    async list_tools(_input, context: OAuthProviderContext) {
      const result = await withSunsamaMcpClient(context, "execute", (client) =>
        client.listTools({}, { timeout: sunsamaMcpRequestTimeoutMs, signal: context.signal }),
      );
      return { tools: result.tools };
    },
    async call_tool(input, context: OAuthProviderContext) {
      const toolName = String(input.toolName);
      return callSunsamaMcpTool(context, toolName, (input.arguments as Record<string, unknown>) ?? {});
    },
    ...officialToolHandlers,
  },
  { skipDnsValidation: true },
);

export const credentialValidators: CredentialValidators = {
  async oauth2(input, { fetcher, signal }) {
    const result = await withSunsamaMcpClient(
      { accessToken: input.accessToken, fetcher, signal },
      "validate",
      (client) => client.listTools({}, { timeout: sunsamaMcpRequestTimeoutMs, signal }),
    );
    if (result.tools.length === 0) {
      throw new ProviderRequestError(400, "Sunsama MCP did not expose any tools for this account");
    }

    const tokenHash = createHash("sha256").update(input.accessToken).digest("hex").slice(0, 16);
    return {
      profile: {
        accountId: `sunsama:mcp:${tokenHash}`,
        displayName: `Sunsama MCP · ${tokenHash.slice(-6)}`,
      },
      metadata: {
        mcpEndpoint: sunsamaMcpEndpoint,
        discoveredToolCount: result.tools.length,
      },
    };
  },
};

function mapSunsamaMcpError(error: unknown, phase: "validate" | "execute"): ProviderRequestError {
  if (error instanceof ProviderRequestError) return error;
  if (error instanceof UnauthorizedError) {
    return new ProviderRequestError(
      phase === "validate" ? 400 : 401,
      "Sunsama MCP credential is invalid or expired",
      error,
    );
  }
  if (error instanceof StreamableHTTPError) {
    const status = error.code;
    if (status === 401 || status === 403) {
      return new ProviderRequestError(
        phase === "validate" ? 400 : 401,
        "Sunsama MCP credential is invalid or expired",
        error,
      );
    }
    return new ProviderRequestError(
      status === 429 ? 429 : status && status >= 400 && status < 500 ? 400 : 502,
      `Sunsama MCP request failed: ${error.message}`,
      error,
    );
  }
  if (error instanceof McpError) {
    return new ProviderRequestError(502, `Sunsama MCP request failed: ${error.message}`, error);
  }
  return new ProviderRequestError(
    502,
    error instanceof Error ? `Sunsama MCP request failed: ${error.message}` : "Sunsama MCP request failed",
    error,
  );
}
