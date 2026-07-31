import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { N8nActionContext } from "./runtime.ts";

import { isPrivateNetworkAccessAllowed } from "../../core/request.ts";
import {
  createProviderFetch,
  defineProviderExecutors,
  defineProviderProxy,
  requireApiKeyCredential,
} from "../provider-runtime.ts";
import { createN8nActionContext, n8nActionHandlers, resolveN8nApiBaseUrl, validateN8nCredential } from "./runtime.ts";

const service = "n8n";

export const executors: ProviderExecutors = defineProviderExecutors<N8nActionContext>({
  service,
  handlers: n8nActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<N8nActionContext> {
    return createN8nActionContext(await requireApiKeyCredential(context, service), fetcher, context.signal);
  },
  allowPrivateNetwork: isPrivateNetworkAccessAllowed,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: async (context) => resolveN8nApiBaseUrl(await requireApiKeyCredential(context, service)),
  auth: { type: "api_key_header", name: "x-n8n-api-key" },
  allowPrivateNetwork: isPrivateNetworkAccessAllowed,
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    const guardedFetcher = createProviderFetch({ fetch: fetcher, allowPrivateNetwork: isPrivateNetworkAccessAllowed });
    return validateN8nCredential(input, guardedFetcher, signal);
  },
};
