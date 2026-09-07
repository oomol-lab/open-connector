import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { apiBaseUrl, imagetranslateAiActionHandlers, validateCredential } from "./runtime.ts";

const service = "imagetranslate_ai";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, imagetranslateAiActionHandlers, {
  skipDnsValidation: true,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: apiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    if (!headers.has("accept")) headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input) {
    return validateCredential(input.apiKey);
  },
};
