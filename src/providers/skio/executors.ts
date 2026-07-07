import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { skioActionHandlers, skioApiBaseUrl, validateSkioCredential } from "./runtime.ts";

const service = "skio";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, skioActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: skioApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "API " },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateSkioCredential(input.apiKey, fetcher, signal);
  },
};
