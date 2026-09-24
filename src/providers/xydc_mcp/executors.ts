import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderActionHandlers } from "../provider-runtime.ts";
import type { Client } from "@modelcontextprotocol/client";

import { ProtocolError, SdkHttpError, UnauthorizedError } from "@modelcontextprotocol/client";
import { createHash } from "node:crypto";
import { optionalRecord, optionalString } from "../../core/cast.ts";
import { withMcpClient } from "../mcp-client.ts";
import {
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  mapProviderActionHandlers,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";
import { xydcMcpActions } from "./actions.ts";
import { normalizeXydcMcpToolResult } from "./runtime.ts";

const service = "xydc_mcp";
const origin = "https://mcp.xydc.com";
const endpoint = `${origin}/mcp`;
const generationTimeoutMs = 55_000;

const handlers: ProviderActionHandlers<
  "xydc_mcp",
  (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>
> = mapProviderActionHandlers(service, xydcMcpActions, (_action, actionName) => async (input, context) => {
  if (actionName == "list_tools") {
    const page = await withClient(context, (client) => client.listTools({}, { signal: context.signal }));
    return { tools: page.tools };
  }
  if (actionName == "read_category_insight_guide") {
    return withClient(context, (client) =>
      client.readResource({ uri: "xiyou://guides/category-insight-workflow-v2" }, { signal: context.signal }),
    );
  }
  const toolName = actionName == "call_tool" ? requireToolName(input.toolName) : actionName;
  const arguments_ = actionName == "call_tool" ? (optionalRecord(input.arguments) ?? {}) : input;
  const result = await withClient(context, (client) =>
    client.callTool(
      { name: toolName, arguments: arguments_ },
      {
        timeout: toolName == "generate_category_insight_resource" ? generationTimeoutMs : undefined,
        signal: context.signal,
      },
    ),
  );
  return { result: normalizeXydcMcpToolResult(result) };
});

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, handlers, {
  skipDnsValidation: true,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: origin,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  allowedEndpoint(value) {
    const url = new URL(value, origin);
    return url.origin == origin && url.pathname == "/mcp" && url.search == "" && url.hash == "";
  },
  timeoutMs: generationTimeoutMs,
  skipDnsValidation: true,
  redirect: "manual",
  customizeRequest({ headers }) {
    headers.set("accept", "application/json, text/event-stream");
    headers.set("content-type", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const context = { apiKey: input.apiKey, fetcher, signal };
    const tools = await withClient(context, (client) => client.listTools({}, { signal }));
    const tokenHash = createHash("sha256").update(input.apiKey).digest("hex");
    return {
      profile: { accountId: `xydc-mcp:${tokenHash}`, displayName: `XYDC MCP - ${tokenHash.slice(-6)}` },
      metadata: { mcpEndpoint: endpoint, discoveredToolCount: tools.tools.length },
    };
  },
};

async function withClient<T>(context: ApiKeyProviderContext, run: (client: Client) => Promise<T>): Promise<T> {
  return withMcpClient(
    {
      endpoint: new URL(endpoint),
      transport: "streamable_http",
      fetcher: context.fetcher,
      headers: { authorization: `Bearer ${context.apiKey}`, "user-agent": providerUserAgent },
      redirect: "manual",
      signal: context.signal,
      mapError,
    },
    run,
  );
}

function mapError(error: unknown): unknown {
  if (error instanceof ProviderRequestError) return error;
  if (error instanceof UnauthorizedError) return new ProviderRequestError(401, "XYDC MCP credential is invalid");
  if (error instanceof SdkHttpError) return new ProviderRequestError(error.status, error.message, error);
  if (error instanceof ProtocolError) return new ProviderRequestError(502, error.message, error);
  return new ProviderRequestError(502, error instanceof Error ? error.message : "XYDC MCP request failed", error);
}

function requireToolName(value: unknown): string {
  const name = optionalString(value);
  if (!name) throw new ProviderRequestError(400, "toolName is required");
  return name;
}
