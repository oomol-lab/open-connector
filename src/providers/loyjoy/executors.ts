import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { loyjoyActionHandlers, loyjoyApiBaseUrl, validateLoyjoyApiKey } from "./runtime.ts";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors("loyjoy", loyjoyActionHandlers, {
  skipDnsValidation: true,
});
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "loyjoy",
  baseUrl: loyjoyApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
});
export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateLoyjoyApiKey({ apiKey: input.apiKey, fetcher, signal });
  },
};
