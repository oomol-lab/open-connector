import type {
  CredentialValidationResult,
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { LitellmContext } from "./runtime.ts";

import { optionalString } from "../../core/cast.ts";
import { isPrivateNetworkAccessAllowed } from "../../core/request.ts";
import {
  createProviderFetch,
  defineProviderExecutors,
  defineProviderProxy,
  ProviderRequestError,
  requireApiKeyCredential,
} from "../provider-runtime.ts";
import {
  createLitellmContext,
  litellmActionHandlers,
  normalizeLitellmBaseUrl,
  validateLitellmCredential,
} from "./runtime.ts";

const service = "litellm";

export const executors: ProviderExecutors = defineProviderExecutors<LitellmContext>({
  service,
  handlers: litellmActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<LitellmContext> {
    const credential = await requireApiKeyCredential(context, service);
    return createLitellmContext(credential.values, credential.apiKey, fetcher, context.signal);
  },
  allowPrivateNetwork: isPrivateNetworkAccessAllowed,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: async (context) => {
    const credential = await requireApiKeyCredential(context, service);
    const value = optionalString(credential.metadata.apiBaseUrl) ?? optionalString(credential.values.baseUrl);
    if (!value) throw new ProviderRequestError(500, "litellm connection is missing baseUrl metadata");
    return normalizeLitellmBaseUrl(value);
  },
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  allowPrivateNetwork: isPrivateNetworkAccessAllowed,
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    // Re-guard the shared validator fetcher with the private-network opt-in so
    // validating a proxy on a private network works when the deployment allows it.
    const guardedFetcher = createProviderFetch({ fetch: fetcher, allowPrivateNetwork: isPrivateNetworkAccessAllowed });
    return validateLitellmCredential(input.values, input.apiKey, guardedFetcher, signal);
  },
};
