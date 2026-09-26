import type { CredentialValidators, ExecutionContext, ProviderExecutors } from "../../core/types.ts";
import type { ProviderFetch } from "../provider-runtime.ts";

import { isPrivateNetworkAccessAllowed } from "../../core/request.ts";
import { createProviderFetch, defineProviderExecutors, requireCustomCredential } from "../provider-runtime.ts";
import { createDrawioMcpContext, drawioMcpActionHandlers, validateDrawioMcpCredential } from "./runtime.ts";

const service = "drawio_mcp";

export const executors: ProviderExecutors = defineProviderExecutors({
  service,
  handlers: drawioMcpActionHandlers,
  async createContext(context: ExecutionContext, fetcher: ProviderFetch) {
    const credential = await requireCustomCredential(context, service);
    return createDrawioMcpContext(credential.values, fetcher, context.signal);
  },
  allowPrivateNetwork: isPrivateNetworkAccessAllowed,
});

export const credentialValidators: CredentialValidators = {
  customCredential(input, { fetcher, signal }) {
    const guardedFetcher = createProviderFetch({ fetch: fetcher, allowPrivateNetwork: isPrivateNetworkAccessAllowed });
    return validateDrawioMcpCredential(input.values, guardedFetcher, signal);
  },
};
