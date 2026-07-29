import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { postalyticsActionHandlers, postalyticsApiBaseUrl, validatePostalyticsCredential } from "./runtime.ts";

const service = "postalytics";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, postalyticsActionHandlers, {
  skipDnsValidation: true,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: postalyticsApiBaseUrl,
  auth: { type: "api_key_basic", suffix: ":" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    if (!headers.has("accept")) {
      headers.set("accept", "application/json");
    }
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validatePostalyticsCredential(input.apiKey, fetcher, signal);
  },
};
