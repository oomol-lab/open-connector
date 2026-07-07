import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { unsplashActionHandlers, unsplashApiBaseUrl, validateUnsplashCredential } from "./runtime.ts";

const service = "unsplash";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, unsplashActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: unsplashApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Client-ID " },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateUnsplashCredential(input.apiKey, fetcher, signal);
  },
};
