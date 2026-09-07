import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { currentsApiActionHandlers, currentsApiBaseUrl, validateCurrentsApiCredential } from "./runtime.ts";

const service = "currents_api";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, currentsApiActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: currentsApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateCurrentsApiCredential(input.apiKey, fetcher, signal);
  },
};
