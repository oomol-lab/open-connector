import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { browseAiActionHandlers, browseAiApiBaseUrl, validateBrowseAiCredential } from "./runtime.ts";

const service = "browse_ai";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, browseAiActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: browseAiApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateBrowseAiCredential(input.apiKey, fetcher, signal);
  },
};
