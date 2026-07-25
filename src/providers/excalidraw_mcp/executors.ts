import type { CredentialValidators, ExecutionContext, ProviderExecutors } from "../../core/types.ts";

import { isPrivateNetworkAccessAllowed } from "../../core/request.ts";
import { createProviderFetch, defineProviderExecutors, requireCustomCredential } from "../provider-runtime.ts";
import { createExcalidrawMcpContext, excalidrawMcpActionHandlers, validateExcalidrawCredential } from "./runtime.ts";

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

export const credentialValidators: CredentialValidators = {
  customCredential(input, { fetcher, signal }) {
    const guardedFetcher = createProviderFetch({
      fetch: fetcher,
      allowPrivateNetwork: isPrivateNetworkAccessAllowed,
    });
    return validateExcalidrawCredential(input.values, guardedFetcher, signal);
  },
};
