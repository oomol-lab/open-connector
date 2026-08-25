import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { qaseActionHandlers, qaseApiBaseUrl, validateQaseCredential } from "./runtime.ts";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors("qase", qaseActionHandlers, {
  skipDnsValidation: true,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "qase",
  baseUrl: qaseApiBaseUrl,
  auth: { type: "api_key_header", name: "Token" },
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateQaseCredential(input.apiKey, fetcher, signal);
  },
};
