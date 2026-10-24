import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { socialFetchActionHandlers, socialFetchApiBaseUrl, validateSocialFetchCredential } from "./runtime.ts";

const service = "social_fetch";
export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, socialFetchActionHandlers, {
  skipDnsValidation: true,
});
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: socialFetchApiBaseUrl,
  auth: { type: "api_key_header", name: "x-api-key" },
  skipDnsValidation: true,
});
export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateSocialFetchCredential({ apiKey: input.apiKey, fetcher, signal });
  },
};
