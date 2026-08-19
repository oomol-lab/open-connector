import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderActionHandlers } from "../provider-runtime.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy, mapProviderActionHandlers } from "../provider-runtime.ts";
import { aifinMarketActions } from "./actions.ts";
import { callTool, discoverAccessibleTools, listTools } from "./runtime.ts";

const service = "aifinmarket";
type AifinMarketHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

const handlers: ProviderActionHandlers<"aifinmarket", AifinMarketHandler> = mapProviderActionHandlers(
  service,
  aifinMarketActions,
  (_action, name): AifinMarketHandler => {
    if (name === "list_tools") {
      return (input, context) => listTools(String(input.serverType) as Parameters<typeof listTools>[0], context);
    }
    return (input, context) => callTool(name, input, context);
  },
);

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, handlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const discovered = await discoverAccessibleTools({ apiKey: input.apiKey.trim(), fetcher, signal });
    const bytes = new TextEncoder().encode(input.apiKey.trim());
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const keyHash = Array.from(new Uint8Array(digest))
      .slice(0, 8)
      .map((value) => value.toString(16).padStart(2, "0"))
      .join("");
    return {
      profile: {
        accountId: `aifinmarket:mcp:${keyHash}`,
        displayName: `Wind AIFin Market · ${keyHash.slice(-6)}`,
      },
      grantedScopes: [],
      metadata: {
        mcpOrigin: "https://mcp.wind.com.cn",
        validationServerType: discovered.serverType,
        discoveredToolCount: discovered.tools.length,
      },
    };
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://mcp.wind.com.cn",
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    if (!headers.has("accept")) headers.set("accept", "application/json, text/event-stream");
    if (!headers.has("content-type")) headers.set("content-type", "application/json");
  },
});
