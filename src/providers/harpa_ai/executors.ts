import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { handlers, harpaAiApiBaseUrl } from "./runtime.ts";

const service = "harpa_ai";
export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, handlers, {
  skipDnsValidation: true,
});
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: harpaAiApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
});
export const credentialValidators: CredentialValidators = {
  apiKey() {
    return Promise.resolve({
      profile: { displayName: "HARPA AI API Key" },
      grantedScopes: [],
      metadata: { apiBaseUrl: harpaAiApiBaseUrl, validationMode: "format_only" },
    });
  },
};
