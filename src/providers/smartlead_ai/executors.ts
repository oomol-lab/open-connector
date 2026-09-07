import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { smartleadAiActionHandlers, smartleadAiApiBaseUrl, validateSmartleadAiCredential } from "./runtime.ts";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors("smartlead_ai", smartleadAiActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "smartlead_ai",
  baseUrl: smartleadAiApiBaseUrl,
  auth: { type: "api_key_query", name: "api_key" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    if (!headers.has("accept")) {
      headers.set("accept", "application/json");
    }
    if (!headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateSmartleadAiCredential(input.apiKey, fetcher, signal);
  },
};
