import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { exaActionHandlers, exaApiBaseUrl, validateExaApiKey } from "./runtime.ts";

const service = "exa";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, exaActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: exaApiBaseUrl,
  auth: { type: "api_key_header", name: "x-api-key" },
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateExaApiKey(input.apiKey, fetcher, signal);
  },
};
