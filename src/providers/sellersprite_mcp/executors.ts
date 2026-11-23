import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ProviderActionHandlers, ApiKeyProviderContext } from "../provider-executors.ts";

import { sha256Hex } from "../../core/aws-sigv4.ts";
import { recordOrEmpty } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, mapProviderActionHandlers } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { providerInputError, requiredInputString } from "../provider-runtime.ts";
import { sellerspriteMcpActions } from "./actions.ts";
import { call, discover, endpoint, extendedTimeoutMs } from "./runtime.ts";

const service = "sellersprite_mcp";
type SellerSpriteMcpHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

const handlers: ProviderActionHandlers<"sellersprite_mcp", SellerSpriteMcpHandler> = mapProviderActionHandlers(
  service,
  sellerspriteMcpActions,
  (_action, name): SellerSpriteMcpHandler => {
    if (name === "list_tools") return async (_input, context) => ({ tools: await discover(context) });
    if (name === "call_tool") {
      return (input, context) =>
        call(context, requiredInputString(input.toolName, "toolName"), recordOrEmpty(input.arguments));
    }
    return (input, context) => call(context, name, input);
  },
);
export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, handlers, {
  skipDnsValidation: true,
});
export const credentialValidators: CredentialValidators = {
  async apiKey(input, options) {
    const tools = await discover({ apiKey: input.apiKey, fetcher: options.fetcher, signal: options.signal }, true);
    const hash = sha256Hex(input.apiKey).slice(0, 16);
    return {
      profile: { accountId: `sellersprite-mcp:${hash}`, displayName: `SellerSprite MCP - ${hash.slice(-6)}` },
      metadata: { mcpEndpoint: endpoint, discoveredToolCount: tools.length },
    };
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://mcp.sellersprite.com",
  auth: { type: "api_key_header", name: "secret-key" },
  skipDnsValidation: true,
  timeoutMs: extendedTimeoutMs,
  redirect: "manual",
  customizeRequest({ url, headers }) {
    if (url.toString() !== endpoint) {
      throw providerInputError("SellerSprite MCP proxy only supports the official /v2/mcp endpoint");
    }
    if (!headers.has("accept")) headers.set("accept", "application/json, text/event-stream");
    if (!headers.has("content-type")) headers.set("content-type", "application/json");
  },
});
