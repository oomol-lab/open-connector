import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { cronlyActionHandlers, cronlyApiBaseUrl, validateCronlyCredential } from "./runtime.ts";

const service = "cronly";
export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, cronlyActionHandlers, {
  skipDnsValidation: true,
});
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: cronlyApiBaseUrl,
  auth: { type: "bearer" },
  skipDnsValidation: true,
});
export const credentialValidators: CredentialValidators = {
  apiKey(input, context) {
    return validateCronlyCredential(input.apiKey, context.fetcher, context.signal);
  },
};
