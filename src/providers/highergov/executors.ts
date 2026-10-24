import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { highergovActionHandlers, highergovApiBaseUrl, validateHighergovCredential } from "./runtime.ts";

const service = "highergov";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, highergovActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: highergovApiBaseUrl,
  auth: { type: "api_key_query", name: "api_key" },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateHighergovCredential(input.apiKey, fetcher, signal);
  },
};
