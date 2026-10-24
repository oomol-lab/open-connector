import type {
  CredentialValidationResult,
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { MemosContext } from "./runtime.ts";

import { optionalString } from "../../core/cast.ts";
import { isPrivateNetworkAccessAllowed } from "../../core/request.ts";
import { defineProviderExecutors, requireApiKeyCredential } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { createProviderFetch, ProviderRequestError } from "../provider-runtime.ts";
import { createMemosContext, memosActionHandlers, normalizeMemosBaseUrl, validateMemosCredential } from "./runtime.ts";

const service = "memos";

export const executors: ProviderExecutors = defineProviderExecutors<MemosContext>({
  service,
  handlers: memosActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<MemosContext> {
    const credential = await requireApiKeyCredential(context, service);
    const baseUrl = optionalString(credential.values.baseUrl) ?? optionalString(credential.metadata.baseUrl);
    return createMemosContext(credential.apiKey, baseUrl, fetcher, context.signal);
  },
  fallbackMessage: "Memos request failed",
  allowPrivateNetwork: isPrivateNetworkAccessAllowed,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: async (context) => {
    const credential = await requireApiKeyCredential(context, service);
    const baseUrl = optionalString(credential.values.baseUrl) ?? optionalString(credential.metadata.baseUrl);
    if (!baseUrl) throw new ProviderRequestError(500, "memos connection is missing baseUrl metadata");
    return normalizeMemosBaseUrl(baseUrl);
  },
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  allowPrivateNetwork: isPrivateNetworkAccessAllowed,
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    const guardedFetcher = createProviderFetch({
      fetch: fetcher,
      allowPrivateNetwork: isPrivateNetworkAccessAllowed,
    });
    return validateMemosCredential(input.apiKey, input.values.baseUrl, guardedFetcher, signal);
  },
};
