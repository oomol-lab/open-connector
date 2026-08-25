import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { TheHiveRuntimeConfig } from "../thehive/runtime.ts";

import { isPrivateNetworkAccessAllowed } from "../../core/request.ts";
import {
  createProviderFetch,
  defineProviderExecutors,
  defineProviderProxy,
  requireApiKeyCredential,
} from "../provider-runtime.ts";
import {
  createTheHiveActionHandlers,
  createTheHiveContext,
  normalizeTheHiveBaseUrl,
  validateTheHiveCredential,
} from "../thehive/runtime.ts";

const service = "thehive5";
const runtimeConfig: TheHiveRuntimeConfig = { displayName: "TheHive 5", service, version: 5 };

export const executors: ProviderExecutors = defineProviderExecutors({
  service,
  handlers: createTheHiveActionHandlers(runtimeConfig),
  async createContext(context: ExecutionContext, fetcher: typeof fetch) {
    const credential = await requireApiKeyCredential(context, service);
    return createTheHiveContext(credential.values, credential.apiKey, fetcher, context.signal);
  },
  allowPrivateNetwork: isPrivateNetworkAccessAllowed,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  async baseUrl(context) {
    const credential = await requireApiKeyCredential(context, service);
    return normalizeTheHiveBaseUrl(credential.values.baseUrl);
  },
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  allowPrivateNetwork: isPrivateNetworkAccessAllowed,
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    const guardedFetcher = createProviderFetch({
      fetch: fetcher,
      allowPrivateNetwork: isPrivateNetworkAccessAllowed,
    });
    return validateTheHiveCredential(input.values, input.apiKey, guardedFetcher, runtimeConfig, signal);
  },
};
