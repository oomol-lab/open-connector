import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderActionHandlers } from "../provider-runtime.ts";
import type { Client } from "@modelcontextprotocol/client";

import { ProtocolError, SdkHttpError, UnauthorizedError } from "@modelcontextprotocol/client";
import { createHash } from "node:crypto";
import { optionalRecord } from "../../core/cast.ts";
import { withMcpClient } from "../mcp-client.ts";
import {
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  mapProviderActionHandlers,
  ProviderRequestError,
  providerUserAgent,
  requiredInputString,
} from "../provider-runtime.ts";
import { sorftimeMcpActions } from "./actions.ts";
import { buildSorftimeMcpCall, normalizeSorftimeMcpResult, sorftimeMcpEndpoint } from "./runtime.ts";

const service = "sorftime_mcp";
const requestTimeoutMs = 60_000;
type SorftimeContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
type SorftimeHandler = (input: Record<string, unknown>, context: SorftimeContext) => Promise<unknown>;

const handlers: ProviderActionHandlers<"sorftime_mcp", SorftimeHandler> = mapProviderActionHandlers(
  service,
  sorftimeMcpActions,
  (_action, actionName) => {
    if (actionName === "list_tools") return async (_input, context) => ({ tools: await listTools(context) });
    if (actionName === "call_tool")
      return (input, context) =>
        callTool(context, requiredInputString(input.toolName, "toolName"), optionalRecord(input.arguments) ?? {}).then(
          (result) => ({ result }),
        );
    return (input, context) => {
      const call = buildSorftimeMcpCall(actionName, input);
      return callTool(context, call.toolName, call.arguments).then(normalizeSorftimeMcpResult);
    };
  },
);

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, handlers, {
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, options) {
    const tools = await listTools({
      apiKey: input.apiKey,
      fetcher: options.fetcher,
      signal: options.signal,
    });
    if (!tools.some((tool) => optionalRecord(tool)?.name === "product_detail"))
      throw new ProviderRequestError(502, "Sorftime MCP did not expose the expected product research tools");
    const hash = createHash("sha256").update(input.apiKey).digest("hex");
    return {
      profile: {
        accountId: `sorftime-mcp:${hash}`,
        displayName: `Sorftime MCP · ${hash.slice(-6)}`,
      },
      grantedScopes: [],
      metadata: { mcpEndpoint: sorftimeMcpEndpoint, discoveredToolCount: tools.length },
    };
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: sorftimeMcpEndpoint,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
  redirect: "manual",
  timeoutMs: requestTimeoutMs,
  allowedEndpoint(endpoint) {
    const url = new URL(endpoint, sorftimeMcpEndpoint);
    return url.toString() === sorftimeMcpEndpoint;
  },
  customizeRequest({ headers }) {
    headers.set("accept", "application/json, text/event-stream");
    headers.set("content-type", "application/json");
  },
});

async function listTools(context: SorftimeContext): Promise<unknown[]> {
  return withSorftimeClient(context, async (client) => {
    const result = await client.listTools({}, { timeout: requestTimeoutMs, signal: context.signal });
    return result.tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      annotations: tool.annotations,
      inputSchema: tool.inputSchema,
    }));
  });
}

async function callTool(
  context: SorftimeContext,
  name: string,
  argumentsInput: Record<string, unknown>,
): Promise<unknown> {
  return withSorftimeClient(context, (client) =>
    client.callTool({ name, arguments: argumentsInput }, { timeout: requestTimeoutMs, signal: context.signal }),
  );
}

function withSorftimeClient<T>(context: SorftimeContext, run: (client: Client) => Promise<T>): Promise<T> {
  return withMcpClient(
    {
      endpoint: new URL(sorftimeMcpEndpoint),
      transport: "streamable_http",
      fetcher: context.fetcher,
      headers: {
        authorization: `Bearer ${context.apiKey}`,
        "user-agent": providerUserAgent,
      },
      redirect: "manual",
      signal: context.signal,
      mapError: mapSorftimeError,
    },
    run,
  );
}

function mapSorftimeError(error: unknown): ProviderRequestError {
  if (error instanceof ProviderRequestError) return error;
  if (error instanceof UnauthorizedError)
    return new ProviderRequestError(401, "Sorftime MCP key is invalid or unauthorized", error);
  if (error instanceof SdkHttpError)
    return new ProviderRequestError(
      error.status === 401 || error.status === 403 || error.status === 429 ? error.status : 502,
      `Sorftime MCP request failed: ${error.message}`,
      error,
    );
  if (error instanceof ProtocolError)
    return new ProviderRequestError(502, `Sorftime MCP request failed: ${error.message}`, error);
  return new ProviderRequestError(
    502,
    error instanceof Error ? `Sorftime MCP request failed: ${error.message}` : "Sorftime MCP request failed",
    error,
  );
}
