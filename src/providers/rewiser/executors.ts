import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { rewiserActionHandlers, rewiserApiBaseUrl, validateRewiser } from "./runtime.ts";
export const executors: ProviderExecutors = defineApiKeyProviderExecutors("rewiser", rewiserActionHandlers, {
  skipDnsValidation: true,
});
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "rewiser",
  baseUrl: rewiserApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
});
export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateRewiser({ apiKey: input.apiKey, fetcher, signal });
  },
};
