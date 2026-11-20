import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { delightedActionHandlers, delightedApiBaseUrl, validateDelightedCredential } from "./runtime.ts";

const service = "delighted";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, delightedActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: delightedApiBaseUrl,
  auth: { type: "api_key_basic", suffix: ":" },
  skipDnsValidation: true,
  defaultHeaders: { accept: "application/json" },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateDelightedCredential(input.apiKey, fetcher, signal);
  },
};
