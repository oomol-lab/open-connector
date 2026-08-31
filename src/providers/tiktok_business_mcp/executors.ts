import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { OAuthProviderContext, ProviderActionHandlers, ProviderRuntimeHandler } from "../provider-runtime.ts";
import type { Client } from "@modelcontextprotocol/client";

import { ProtocolError, SdkHttpError, UnauthorizedError } from "@modelcontextprotocol/client";
import { createHash } from "node:crypto";
import { optionalRecord, requiredString } from "../../core/cast.ts";
import { withMcpClient } from "../mcp-client.ts";
import {
  defineOAuthProviderExecutors,
  providerInputError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

const service = "tiktok_business_mcp";
const endpoint = "https://business-api.tiktok.com/open_mcp/tt-ads-mcp-flat";
const requestTimeoutMs = 60_000;

async function withTikTokMcpClient<T>(
  context: Pick<OAuthProviderContext, "accessToken" | "fetcher" | "signal">,
  run: (client: Client) => Promise<T>,
): Promise<T> {
  return withMcpClient(
    {
      endpoint: new URL(endpoint),
      transport: "streamable_http",
      fetcher: context.fetcher,
      headers: new Headers({
        authorization: `Bearer ${context.accessToken}`,
        "user-agent": providerUserAgent,
      }),
      signal: context.signal,
      mapError: mapTikTokMcpError,
    },
    run,
  );
}

export const tiktokBusinessMcpActionHandlers: ProviderActionHandlers<
  "tiktok_business_mcp",
  ProviderRuntimeHandler<OAuthProviderContext>
> = {
  async list_tools(_input, context) {
    const result = await withTikTokMcpClient(context, (client) =>
      client.listTools({}, { timeout: requestTimeoutMs, signal: context.signal }),
    );
    return { tools: result.tools };
  },
  async call_tool(input, context) {
    const toolName = requiredString(input.toolName, "toolName", providerInputError);
    const result = await withTikTokMcpClient(context, (client) =>
      client.callTool(
        { name: toolName, arguments: optionalRecord(input.arguments) ?? {} },
        { timeout: requestTimeoutMs, signal: context.signal },
      ),
    );
    if (!("toolResult" in result) && result.isError) {
      throw new ProviderRequestError(502, `TikTok MCP tool ${toolName} returned an error`, result);
    }
    return { result };
  },
};

export const executors: ProviderExecutors = defineOAuthProviderExecutors(service, tiktokBusinessMcpActionHandlers, {
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  async oauth2(input, { fetcher, signal }) {
    const result = await withTikTokMcpClient({ accessToken: input.accessToken, fetcher, signal }, (client) =>
      client.listTools({}, { timeout: requestTimeoutMs, signal }),
    );
    if (result.tools.length === 0) throw providerInputError("TikTok for Business MCP did not expose any tools");
    const tokenHash = createHash("sha256").update(input.accessToken).digest("hex").slice(0, 16);
    return {
      profile: {
        accountId: `tiktok-business-mcp:${tokenHash}`,
        displayName: `TikTok for Business MCP - ${tokenHash.slice(-6)}`,
      },
      grantedScopes: ["mcp:tt4b"],
      metadata: {
        mcpEndpoint: endpoint,
        discoveredToolCount: result.tools.length,
      },
    };
  },
};

function mapTikTokMcpError(error: unknown): ProviderRequestError {
  if (error instanceof ProviderRequestError) return error;
  if (error instanceof UnauthorizedError) {
    return new ProviderRequestError(401, "TikTok for Business MCP credential is invalid or expired", error);
  }
  if (error instanceof SdkHttpError) {
    const status = error.status;
    return new ProviderRequestError(
      status === 401 || status === 403 ? 401 : status && status >= 400 && status < 500 ? 400 : 502,
      `TikTok for Business MCP request failed: ${error.message}`,
      error,
    );
  }
  if (error instanceof ProtocolError) {
    return new ProviderRequestError(502, `TikTok for Business MCP request failed: ${error.message}`, error);
  }
  return new ProviderRequestError(
    502,
    error instanceof Error
      ? `TikTok for Business MCP request failed: ${error.message}`
      : "TikTok for Business MCP request failed",
    error,
  );
}
