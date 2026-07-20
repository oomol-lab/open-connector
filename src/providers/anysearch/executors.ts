import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { anySearchActionHandlers, anySearchApiBaseUrl, validateAnySearchApiKey } from "./runtime.ts";

const service = "anysearch";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, anySearchActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: anySearchApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateAnySearchApiKey(input.apiKey, fetcher, signal);
  },
};
