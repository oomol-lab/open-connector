import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";

import {
  createProviderFetch,
  defineProviderExecutors,
  defineProviderProxy,
  requireCustomCredential,
} from "../provider-runtime.ts";
import {
  createLingxingContext,
  lingxingMcpActionHandlers,
  normalizeLingxingMcpEndpoint,
  toLingxingExecutionError,
  validateLingxingCredential,
} from "./runtime.ts";

const service = "lingxing_mcp";

export const executors: ProviderExecutors = defineProviderExecutors({
  service,
  handlers: lingxingMcpActionHandlers,
  mapError: toLingxingExecutionError,
  async createContext(context: ExecutionContext, fetcher: typeof fetch) {
    const credential = await requireCustomCredential(context, service);
    return createLingxingContext(credential.values, fetcher, context.signal);
  },
  fallbackMessage: "Lingxing MCP request failed",
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  async baseUrl(context) {
    const credential = await requireCustomCredential(context, service);
    return normalizeLingxingMcpEndpoint(credential.values.serverUrl).toString();
  },
  auth: { type: "custom_credential_header", field: "mcpKey", name: "x-mcp-key" },
  customizeRequest({ headers }) {
    if (!headers.has("accept")) headers.set("accept", "application/json, text/event-stream");
  },
});

export const credentialValidators: CredentialValidators = {
  customCredential(input, { fetcher, signal }) {
    const guardedFetcher = createProviderFetch({ fetch: fetcher });
    return validateLingxingCredential(input.values, guardedFetcher, signal);
  },
};
