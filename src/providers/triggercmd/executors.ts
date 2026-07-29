import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { triggercmdActionHandlers, triggercmdApiBaseUrl, validateTriggercmdCredential } from "./runtime.ts";

const service = "triggercmd";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, triggercmdActionHandlers, {
  skipDnsValidation: true,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: triggercmdApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    if (!headers.has("accept")) {
      headers.set("accept", "application/json");
    }
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateTriggercmdCredential(input.apiKey, fetcher, signal);
  },
};
