import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { sunoApiBaseUrl, sunoapiActionHandlers, validateSunoApiCredential } from "./runtime.ts";

const service = "sunoapi";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, sunoapiActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: sunoApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateSunoApiCredential(input.apiKey, fetcher, signal);
  },
};
