import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { podAiActionHandlers, podAiApiBaseUrl, validatePodAiCredential } from "./runtime.ts";

const service = "pod_ai";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, podAiActionHandlers, {
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input) {
    return validatePodAiCredential(input.apiKey);
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: podAiApiBaseUrl,
  auth: { type: "api_key_header", name: "X-Api-Key" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});
