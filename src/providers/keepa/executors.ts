import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { keepaActionHandlers, keepaApiBaseUrl, validateKeepaCredential } from "./runtime.ts";

const service = "keepa";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, keepaActionHandlers, {
  skipDnsValidation: true,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: keepaApiBaseUrl,
  auth: { type: "api_key_query", name: "key" },
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateKeepaCredential(input.apiKey, fetcher, signal);
  },
};
