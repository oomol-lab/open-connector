import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { mindbodyActionHandlers, mindbodyApiBaseUrl, validateMindbodyCredential } from "./runtime.ts";

const service = "mindbody";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, mindbodyActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: mindbodyApiBaseUrl,
  auth: { type: "api_key_header", name: "API-Key" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateMindbodyCredential(input.apiKey, fetcher, signal);
  },
};
