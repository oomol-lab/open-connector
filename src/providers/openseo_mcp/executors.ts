import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-executors.ts";

import { sha256Hex } from "../../core/aws-sigv4.ts";
import { optionalRecord } from "../../core/cast.ts";
import { callMcpTool, listMcpTools } from "../mcp-tools.ts";
import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy, readProviderProxyErrorMessage } from "../provider-proxy.ts";
import {
  providerInputError,
  requiredInputString,
  ProviderRequestError,
  withRetryAfterSeconds,
} from "../provider-runtime.ts";

const endpoint = "https://app.openseo.so/mcp";
export const executors: ProviderExecutors = defineApiKeyProviderExecutors("openseo_mcp", {
  async list_tools(_input, context) {
    return { tools: await listMcpTools(connection(context), { includeAnnotations: true, includeOutputSchema: true }) };
  },
  async call_tool(input, context) {
    return {
      result: await callMcpTool({
        ...connection(context),
        toolName: requiredInputString(input.toolName, "toolName"),
        arguments: optionalRecord(input.arguments) ?? {},
      }),
    };
  },
});
export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    // Tool discovery verifies access without initializing billing through whoami.
    const tools = await listMcpTools(connection({ apiKey: input.apiKey, fetcher, signal }));
    return {
      profile: { accountId: `openseo-mcp:${sha256Hex(input.apiKey.trim())}`, displayName: "OpenSEO MCP API Key" },
      metadata: { mcpEndpoint: endpoint, discoveredToolCount: tools.length },
    };
  },
};
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "openseo_mcp",
  baseUrl: "https://app.openseo.so",
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  allowedEndpoint: (endpoint) => endpoint === "/mcp",
  redirect: "manual",
  async readError(response) {
    return new ProviderRequestError(
      response.status,
      await readProviderProxyErrorMessage(response, "OpenSEO MCP proxy request failed"),
      withRetryAfterSeconds(response),
      response.status === 429 ? "rate_limited" : "provider_error",
    );
  },
  customizeRequest({ url, headers }) {
    if (url.href !== endpoint)
      throw providerInputError("OpenSEO MCP proxy only supports the official /mcp endpoint without a query string");
    if (headers.has("x-api-key")) throw providerInputError("OpenSEO MCP proxy does not accept x-api-key overrides");
    if (!headers.has("accept")) headers.set("accept", "application/json, text/event-stream");
  },
});
function connection(context: ApiKeyProviderContext) {
  return {
    endpoint,
    service: "OpenSEO",
    fetcher: context.fetcher,
    signal: context.signal,
    headers: { authorization: `Bearer ${requiredInputString(context.apiKey, "API key")}` },
    redirect: "manual" as const,
    maxResponseBytes: 16 * 1024 * 1024,
  };
}
