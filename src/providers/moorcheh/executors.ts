import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { moorchehActionHandlers, moorchehApiBaseUrl, validateMoorchehCredential } from "./runtime.ts";

const service = "moorcheh";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, moorchehActionHandlers);

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateMoorchehCredential(input.apiKey, fetcher, signal);
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: moorchehApiBaseUrl,
  auth: { type: "api_key_header", name: "x-api-key" },
  defaultHeaders: { "accept": "application/json", "content-type": "application/json" },
});
