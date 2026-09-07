import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { nasaActionHandlers, nasaApiBaseUrl, validateNasaCredential } from "./runtime.ts";

const service = "nasa";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, nasaActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: nasaApiBaseUrl,
  auth: { type: "api_key_query", name: "api_key" },
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateNasaCredential(input, fetcher, signal);
  },
};
