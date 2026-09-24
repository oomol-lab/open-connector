import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderActionHandlers } from "../provider-runtime.ts";
import type { Client } from "@modelcontextprotocol/client";

import { ProtocolError, SdkHttpError, UnauthorizedError } from "@modelcontextprotocol/client";
import { createHash } from "node:crypto";
import { withMcpClient } from "../mcp-client.ts";
import {
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  mapProviderActionHandlers,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";
import { patsnapMcpActions, patsnapMcpToolRoutes } from "./actions.ts";
import { patsnapMcpEndpoints, patsnapMcpOrigin, patsnapServerNames } from "./servers.ts";

const service = "patsnap_mcp";
const endpoints = new Set(Object.values(patsnapMcpEndpoints));

const handlers: ProviderActionHandlers<
  "patsnap_mcp",
  (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>
> = mapProviderActionHandlers(service, patsnapMcpActions, (_action, actionName) => async (input, context) => {
  if (actionName == "list_tools") {
    const server = readServer(input.server);
    const tools = await listTools(context, server);
    return {
      server,
      tools: tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
        annotations: tool.annotations,
        actionName: [...patsnapMcpToolRoutes].find(
          ([, route]) => route.server == server && route.toolName == tool.name,
        )?.[0],
      })),
    };
  }
  const route = patsnapMcpToolRoutes.get(actionName);
  if (!route) throw new ProviderRequestError(400, `Patsnap MCP action ${actionName} has no tool route`);
  return { result: await callTool(context, route.server, route.toolName, input) };
});

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, handlers, {
  skipDnsValidation: true,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: patsnapMcpOrigin,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  allowedEndpoint(endpoint) {
    return endpoints.has(new URL(endpoint, patsnapMcpOrigin).href);
  },
  skipDnsValidation: true,
  redirect: "manual",
  customizeRequest({ headers }) {
    headers.set("accept", "application/json, text/event-stream");
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    let failure: unknown;
    for (const server of patsnapServerNames) {
      try {
        const tools = await listTools({ apiKey: input.apiKey, fetcher, signal }, server);
        if (tools.length == 0) continue;
        const keyHash = createHash("sha256").update(input.apiKey).digest("hex").slice(0, 16);
        return {
          profile: { accountId: `patsnap-mcp:${keyHash}`, displayName: `Patsnap MCP - ${keyHash.slice(-6)}` },
          metadata: {
            validationServer: server,
            mcpEndpoint: patsnapMcpEndpoints[server],
            discoveredToolCount: tools.length,
          },
        };
      } catch (error) {
        failure ??= error;
      }
    }
    throw failure ?? new ProviderRequestError(502, "Patsnap MCP did not expose any tools for this account");
  },
};

async function listTools(context: ApiKeyProviderContext, server: keyof typeof patsnapMcpEndpoints) {
  return withClient(context, server, (client) =>
    client.listTools({}, { signal: context.signal }).then((page) => page.tools),
  );
}

async function callTool(
  context: ApiKeyProviderContext,
  server: keyof typeof patsnapMcpEndpoints,
  toolName: string,
  arguments_: Record<string, unknown>,
): Promise<unknown> {
  return withClient(context, server, async (client) => {
    const result = await client.callTool({ name: toolName, arguments: arguments_ }, { signal: context.signal });
    if (result.isError) throw new ProviderRequestError(502, `Patsnap MCP tool ${toolName} returned an error`, result);
    if (result.structuredContent) return result.structuredContent;
    const text = result.content.find((item) => item.type == "text");
    if (text?.type == "text") {
      try {
        return JSON.parse(text.text) as unknown;
      } catch {
        return text.text;
      }
    }
    return result.content;
  });
}

async function withClient<T>(
  context: ApiKeyProviderContext,
  server: keyof typeof patsnapMcpEndpoints,
  run: (client: Client) => Promise<T>,
): Promise<T> {
  return withMcpClient(
    {
      endpoint: new URL(patsnapMcpEndpoints[server]),
      transport: "streamable_http",
      fetcher: context.fetcher,
      headers: { authorization: `Bearer ${context.apiKey}`, "user-agent": providerUserAgent },
      redirect: "manual",
      signal: context.signal,
      mapError: mapMcpError,
    },
    run,
  );
}

function mapMcpError(error: unknown): unknown {
  if (error instanceof ProviderRequestError) return error;
  if (error instanceof UnauthorizedError) return new ProviderRequestError(401, "Patsnap MCP credential is invalid");
  if (error instanceof SdkHttpError) return new ProviderRequestError(error.status, error.message, error);
  if (error instanceof ProtocolError) return new ProviderRequestError(502, error.message, error);
  return new ProviderRequestError(502, error instanceof Error ? error.message : "Patsnap MCP request failed", error);
}

function readServer(value: unknown): keyof typeof patsnapMcpEndpoints {
  return typeof value == "string" && patsnapServerNames.includes(value as never)
    ? (value as keyof typeof patsnapMcpEndpoints)
    : "core_patents";
}
