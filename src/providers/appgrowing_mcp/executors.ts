import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-executors.ts";

import { sha256Hex } from "../../core/aws-sigv4.ts";
import { recordOrEmpty } from "../../core/cast.ts";
import { callMcpTool, listMcpTools } from "../mcp-tools.ts";
import { defineApiKeyProviderExecutors, mapProviderActionHandlers } from "../provider-executors.ts";
import { defineProviderProxy, readProviderProxyErrorMessage } from "../provider-proxy.ts";
import { requiredInputString, ProviderRequestError, withRetryAfterSeconds } from "../provider-runtime.ts";
import { appgrowingMcpActions } from "./actions.ts";
const origin = "https://api-appgrowing-global.youcloud.com";
const endpoint = `${origin}/mcp`;
const defaultHeaders = {
  accept: "application/json, text/event-stream",
  "content-type": "application/json",
  "accept-language": "en",
};
const handlers = mapProviderActionHandlers(
  "appgrowing_mcp",
  appgrowingMcpActions,
  (action) => async (input: Record<string, unknown>, context: ApiKeyProviderContext) => {
    if (
      action.name === "creativeAIAnalysisData" &&
      (input.ids as unknown[]).length !== (input.format as unknown[]).length
    )
      throw new ProviderRequestError(400, "ids and format must have the same length");
    const connection = {
      service: "AppGrowing",
      endpoint,
      headers: { ...defaultHeaders, authorization: `Bearer ${requiredInputString(context.apiKey, "API Key")}` },
      fetcher: context.fetcher,
      signal: context.signal,
      // Cloudflare Workers rejects `redirect: "error"`; a 3xx under "manual" still fails the MCP request.
      redirect: "manual" as const,
      maxResponseBytes: 16 * 1024 * 1024,
      terminateSession: true,
    };
    if (action.name === "list_tools") return { tools: await listMcpTools(connection, { includeAnnotations: true }) };
    return {
      result: await callMcpTool({
        ...connection,
        toolName: action.name === "call_tool" ? requiredInputString(input.toolName, "toolName") : action.name,
        arguments: action.name === "call_tool" ? recordOrEmpty(input.arguments) : input,
      }),
    };
  },
);
export const executors: ProviderExecutors = defineApiKeyProviderExecutors("appgrowing_mcp", handlers, {
  skipDnsValidation: true,
});
export const credentialValidators: CredentialValidators = {
  async apiKey(input) {
    const hash = sha256Hex(requiredInputString(input.apiKey, "API Key"));
    return {
      profile: { accountId: `appgrowing-mcp:${hash}`, displayName: `AppGrowing Global · ${hash.slice(-6)}` },
      metadata: { mcpEndpoint: endpoint, validationMode: "local_non_empty_key" },
    };
  },
};
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "appgrowing_mcp",
  baseUrl: origin,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
  redirect: "manual",
  customizeRequest({ url, headers }) {
    if (url.href !== endpoint)
      throw new ProviderRequestError(
        400,
        "AppGrowing proxy only supports the official /mcp endpoint without query parameters",
      );
    for (const [name, value] of Object.entries(defaultHeaders)) if (!headers.has(name)) headers.set(name, value);
  },
  async readError(response) {
    return new ProviderRequestError(
      response.status,
      await readProviderProxyErrorMessage(response, "MCP proxy request failed"),
      withRetryAfterSeconds(response),
      response.status === 429 ? "rate_limited" : "provider_error",
    );
  },
});
