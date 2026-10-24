import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { referralheroActionHandlers, referralheroApiBaseUrl, validateReferralheroCredential } from "./runtime.ts";
const service = "referralhero";
export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, referralheroActionHandlers, {
  skipDnsValidation: true,
});
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: referralheroApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
});
export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateReferralheroCredential(input.apiKey, fetcher, signal);
  },
};
