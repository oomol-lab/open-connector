import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { McpToolOptions } from "../mcp-tools.ts";
import type { ApiKeyProviderContext, ProviderFetch } from "../provider-runtime.ts";

import { sha256Hex } from "../../core/aws-sigv4.ts";
import { optionalRecord } from "../../core/cast.ts";
import { listMcpTools, callMcpTool } from "../mcp-tools.ts";
import {
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  mapProviderActionHandlers,
  requiredInputString,
} from "../provider-runtime.ts";
import { fastmossMcpActions } from "./actions.ts";
const origin = "https://mcp.fastmoss.com";
const endpoint = `${origin}/mcp`;
const handlers = mapProviderActionHandlers(
  "fastmoss_mcp",
  fastmossMcpActions,
  (_action, actionName) => async (input: Record<string, unknown>, context: ApiKeyProviderContext) => {
    const connection = connectionInput(context.apiKey, context.fetcher, context.signal);
    if (actionName === "list_tools") return { tools: await listMcpTools(connection, { includeAnnotations: true }) };
    return {
      result: await callMcpTool({
        ...connection,
        toolName: actionName === "call_tool" ? requiredInputString(input.toolName, "toolName") : actionName,
        arguments: actionName === "call_tool" ? (optionalRecord(input.arguments) ?? {}) : input,
      }),
    };
  },
);
export const executors: ProviderExecutors = defineApiKeyProviderExecutors("fastmoss_mcp", handlers, {
  skipDnsValidation: true,
});
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "fastmoss_mcp",
  baseUrl: origin,
  auth: { type: "api_key_query", name: "api_key" },
  skipDnsValidation: true,
  redirect: "manual",
  allowedEndpoint(value) {
    const url = new URL(value, origin);
    return (
      url.origin === origin &&
      url.pathname === "/mcp" &&
      url.hash === "" &&
      [...url.searchParams.keys()].every((key) => key === "api_key")
    );
  },
  customizeRequest({ headers }) {
    headers.set("accept", "application/json, text/event-stream");
    headers.set("content-type", "application/json");
  },
});
export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const key = requiredInputString(input.apiKey, "MCP API Key");
    const tools = await listMcpTools(connectionInput(key, fetcher, signal));
    const hash = sha256Hex(key);
    return {
      profile: { accountId: `fastmoss-mcp:${hash}`, displayName: `FastMoss MCP · ${hash.slice(-6)}` },
      metadata: { mcpEndpoint: endpoint, discoveredToolCount: tools.length },
    };
  },
};
function connectionInput(key: string, fetcher: ProviderFetch, signal?: AbortSignal): McpToolOptions {
  const url = new URL(endpoint);
  url.searchParams.set("api_key", key.trim());
  return {
    endpoint: url.toString(),
    service: "FastMoss",
    fetcher,
    signal,
    redirect: "manual",
    terminateSession: true,
    maxResponseBytes: 16 * 1024 * 1024,
  };
}
