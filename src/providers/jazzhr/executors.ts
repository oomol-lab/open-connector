import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { jazzhrActionHandlers, jazzhrApiBaseUrl, validateJazzhrCredential } from "./runtime.ts";

const service = "jazzhr";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, jazzhrActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: jazzhrApiBaseUrl,
  auth: { type: "api_key_query", name: "apikey" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateJazzhrCredential(input.apiKey, fetcher, signal);
  },
};
