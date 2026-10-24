import type {
  CredentialValidationResult,
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { KarakeepExecutionContext } from "./runtime-helpers.ts";

import { optionalString } from "../../core/cast.ts";
import { isPrivateNetworkAccessAllowed } from "../../core/request.ts";
import { defineProviderExecutors, requireApiKeyCredential } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { createProviderFetch } from "../provider-runtime.ts";
import { createKarakeepContext, normalizeKarakeepApiBaseUrl, validateKarakeepCredential } from "./runtime-helpers.ts";
import { karakeepActionHandlers } from "./runtime.ts";

const service = "karakeep";

export const executors: ProviderExecutors = defineProviderExecutors<KarakeepExecutionContext>({
  service,
  handlers: karakeepActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<KarakeepExecutionContext> {
    const credential = await requireApiKeyCredential(context, service);
    return createKarakeepContext(credential.values, credential.apiKey, fetcher, context.signal, context.transitFiles);
  },
  fallbackMessage: "Karakeep request failed",
  allowPrivateNetwork: isPrivateNetworkAccessAllowed,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: async (context) => {
    const credential = await requireApiKeyCredential(context, service);
    const value = optionalString(credential.metadata.apiBaseUrl) ?? optionalString(credential.values.instanceUrl);
    return normalizeKarakeepApiBaseUrl(value);
  },
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  customizeRequest({ headers }) {
    if (!headers.has("accept")) headers.set("accept", "application/json");
  },
  allowPrivateNetwork: isPrivateNetworkAccessAllowed,
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    const guardedFetcher = createProviderFetch({
      fetch: fetcher,
      allowPrivateNetwork: isPrivateNetworkAccessAllowed,
    });
    return validateKarakeepCredential(input.values, input.apiKey, guardedFetcher, signal);
  },
};
