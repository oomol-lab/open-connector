import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { qwenActionHandlers, qwenApiBaseUrl, validateQwenCredential } from "./runtime.ts";

const service = "qwen";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, qwenActionHandlers, {
  skipDnsValidation: true,
});
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: qwenApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    if (!headers.has("accept")) headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateQwenCredential(input.apiKey, fetcher, signal);
  },
};
