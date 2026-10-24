import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { handelsregisterAiActionHandlers, handelsregisterAiApiBaseUrl, validateHandelsregisterAi } from "./runtime.ts";
export const executors: ProviderExecutors = defineApiKeyProviderExecutors(
  "handelsregister_ai",
  handelsregisterAiActionHandlers,
  { skipDnsValidation: true },
);
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "handelsregister_ai",
  baseUrl: handelsregisterAiApiBaseUrl,
  auth: { type: "api_key_header", name: "x-api-key" },
  skipDnsValidation: true,
});
export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateHandelsregisterAi({ apiKey: input.apiKey, fetcher, signal });
  },
};
