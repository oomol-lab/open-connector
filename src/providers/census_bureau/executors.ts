import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { censusBureauActionHandlers, censusBureauApiBaseUrl, validateCensusBureauCredential } from "./runtime.ts";

const service = "census_bureau";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, censusBureauActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: censusBureauApiBaseUrl,
  auth: { type: "api_key_query", name: "key" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey: validateCensusBureauCredential,
};
