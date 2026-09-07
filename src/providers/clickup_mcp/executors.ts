import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { OAuthProviderContext, ProviderActionSources, ProviderRuntimeHandler } from "../provider-runtime.ts";
import type { Client } from "@modelcontextprotocol/client";

import { ProtocolError, SdkHttpError, UnauthorizedError } from "@modelcontextprotocol/client";
import { optionalString } from "../../core/cast.ts";
import { withMcpClient } from "../mcp-client.ts";
import {
  defineOAuthProviderExecutors,
  mapProviderActionSources,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

const service = "clickup_mcp";
const endpoint = "https://mcp.clickup.com/mcp";
const requestTimeoutMs = 60_000;
const toolsByAction: ProviderActionSources<typeof service, string> = {
  search_workspace: "clickup_search",
  get_task: "clickup_get_task",
  get_workspace_hierarchy: "clickup_get_workspace_hierarchy",
  get_workspace_members: "clickup_get_workspace_members",
  create_task: "clickup_create_task",
  update_task: "clickup_update_task",
  create_task_comment: "clickup_create_comment",
  send_chat_message: "clickup_send_chat_message",
};

const handlers = mapProviderActionSources(
  service,
  toolsByAction,
  (_actionName, toolName): ProviderRuntimeHandler<OAuthProviderContext> =>
    async (input, context) => {
      const result = await withClickUpMcpClient(context, "execute", (client) =>
        client.callTool({ name: toolName, arguments: input }, { timeout: requestTimeoutMs, signal: context.signal }),
      );
      if (!("toolResult" in result) && result.isError) {
        throw new ProviderRequestError(502, `ClickUp MCP tool ${toolName} returned an error`, result);
      }
      if ("toolResult" in result) return { result };
      if (result.structuredContent) return { result: result.structuredContent };
      const text = result.content.find((item) => item.type === "text");
      return { result: text?.type === "text" ? text.text : result.content };
    },
);

export const executors: ProviderExecutors = defineOAuthProviderExecutors(service, handlers, {
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  async oauth2(input, { fetcher, signal }) {
    const tools = await withClickUpMcpClient(
      { accessToken: input.accessToken, fetcher, signal },
      "validate",
      (client) => client.listTools({}, { timeout: requestTimeoutMs, signal }),
    );
    const available = new Set(tools.tools.map((tool) => tool.name));
    if (!Object.values(toolsByAction).some((name) => available.has(name))) {
      throw new ProviderRequestError(502, "ClickUp MCP did not expose any supported tools for this account");
    }
    return {
      grantedScopes: optionalString(input.metadata.scope)?.split(" ") ?? [],
      metadata: { mcpEndpoint: endpoint, discoveredToolCount: tools.tools.length },
    };
  },
};

async function withClickUpMcpClient<T>(
  context: Pick<OAuthProviderContext, "accessToken" | "fetcher" | "signal">,
  phase: "validate" | "execute",
  run: (client: Client) => Promise<T>,
): Promise<T> {
  return withMcpClient(
    {
      endpoint: new URL(endpoint),
      transport: "streamable_http",
      fetcher: context.fetcher,
      headers: { authorization: `Bearer ${context.accessToken}`, "user-agent": providerUserAgent },
      signal: context.signal,
      mapError: (error) => mapClickUpMcpError(error, phase),
    },
    run,
  );
}

function mapClickUpMcpError(error: unknown, phase: "validate" | "execute"): unknown {
  if (error instanceof ProviderRequestError) return error;
  if (error instanceof UnauthorizedError) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, "ClickUp MCP credential is invalid or expired");
  }
  if (error instanceof SdkHttpError) {
    const status = error.status;
    if (status === 401 || status === 403) {
      return new ProviderRequestError(phase === "validate" ? 400 : 401, "ClickUp MCP credential is invalid or expired");
    }
    const providerStatus = 400 <= status && status < 500 ? status : 502;
    return new ProviderRequestError(providerStatus, `ClickUp MCP request failed: ${error.message}`, error);
  }
  if (error instanceof ProtocolError) {
    return new ProviderRequestError(502, `ClickUp MCP request failed: ${error.message}`, error);
  }
  return new ProviderRequestError(
    502,
    error instanceof Error ? `ClickUp MCP request failed: ${error.message}` : "ClickUp MCP request failed",
    error,
  );
}
