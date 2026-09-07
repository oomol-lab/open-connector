import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { podscribeActionHandlers, podscribeApiBaseUrl, validatePodscribeCredential } from "./runtime.ts";

const service = "podscribe";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, podscribeActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: podscribeApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validatePodscribeCredential(input.apiKey, fetcher, signal);
  },
};
