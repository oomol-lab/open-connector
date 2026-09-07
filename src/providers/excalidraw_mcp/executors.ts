import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";

import { isPrivateNetworkAccessAllowed } from "../../core/request.ts";
import {
  createProviderFetch,
  defineProviderExecutors,
  defineProviderProxy,
  requireCustomCredential,
} from "../provider-runtime.ts";
import {
  createExcalidrawMcpContext,
  excalidrawMcpActionHandlers,
  normalizeExcalidrawMcpEndpoint,
  validateExcalidrawCredential,
} from "./runtime.ts";

const service = "excalidraw_mcp";

export const executors: ProviderExecutors = defineProviderExecutors({
  service,
  handlers: excalidrawMcpActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch) {
    const credential = await requireCustomCredential(context, service);
    return createExcalidrawMcpContext(credential.values, fetcher, context.signal, isPrivateNetworkAccessAllowed());
  },
  fallbackMessage: "Excalidraw MCP request failed",
  allowPrivateNetwork: isPrivateNetworkAccessAllowed,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  async baseUrl(context) {
    const credential = await requireCustomCredential(context, service);
    return normalizeExcalidrawMcpEndpoint(
      credential.metadata.mcpEndpoint ?? credential.values.mcpEndpoint,
      isPrivateNetworkAccessAllowed(),
    ).toString();
  },
  auth: { type: "none" },
  allowPrivateNetwork: isPrivateNetworkAccessAllowed,
  customizeRequest({ headers }) {
    if (!headers.has("accept")) headers.set("accept", "application/json, text/event-stream");
  },
});

export const credentialValidators: CredentialValidators = {
  customCredential(input, { fetcher, signal }) {
    const guardedFetcher = createProviderFetch({
      fetch: fetcher,
      allowPrivateNetwork: isPrivateNetworkAccessAllowed,
    });
    return validateExcalidrawCredential(input.values, guardedFetcher, signal);
  },
};
