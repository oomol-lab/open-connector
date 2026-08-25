import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { pingbellActionHandlers, pingbellApiBaseUrl, validatePingbellCredential } from "./runtime.ts";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors("pingbell", pingbellActionHandlers, {
  skipDnsValidation: true,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "pingbell",
  baseUrl: pingbellApiBaseUrl,
  auth: { type: "api_key_header", name: "x-api-key" },
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validatePingbellCredential(input.apiKey, fetcher, signal);
  },
};
