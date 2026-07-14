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
  providerFetch,
  requireApiKeyCredential,
} from "../provider-runtime.ts";
import { resolveSnipeItContext, snipeItActionHandlers, validateSnipeItCredential } from "./runtime.ts";

const service = "snipe_it";

export const executors: ProviderExecutors = defineProviderExecutors({
  service,
  handlers: snipeItActionHandlers,
  allowPrivateNetwork: isPrivateNetworkAccessAllowed,
  async createContext(context: ExecutionContext, fetcher: typeof fetch) {
    const credential = await requireApiKeyCredential(context, service);
    return resolveSnipeItContext({ ...credential.values, apiKey: credential.apiKey }, fetcher, context.signal);
  },
  fallbackMessage: "snipe_it request failed",
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  allowPrivateNetwork: isPrivateNetworkAccessAllowed,
  baseUrl: async (context) => {
    const credential = await requireApiKeyCredential(context, service);
    return resolveSnipeItContext({ ...credential.values, apiKey: credential.apiKey }, providerFetch, context.signal)
      .apiBaseUrl;
  },
  auth: { type: "api_key_authorization", prefix: "Bearer " },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    const guardedFetcher = createProviderFetch({ fetch: fetcher, allowPrivateNetwork: isPrivateNetworkAccessAllowed });
    return validateSnipeItCredential({ ...input.values, apiKey: input.apiKey }, guardedFetcher, signal);
  },
};
