import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { seedanceActionHandlers, seedanceApiBaseUrl, validateSeedanceCredential } from "./runtime.ts";

const service = "seedance";

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: seedanceApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    if (!headers.has("accept")) headers.set("accept", "application/json");
  },
});

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, seedanceActionHandlers, {
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateSeedanceCredential(input.apiKey, fetcher, signal);
  },
};
