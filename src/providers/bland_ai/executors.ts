import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { blandAiActionHandlers, blandAiApiBaseUrl, validateBlandAiCredential } from "./runtime.ts";

const service = "bland_ai";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, blandAiActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: blandAiApiBaseUrl,
  auth: { type: "api_key_header", name: "authorization" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateBlandAiCredential(input.apiKey, fetcher, signal);
  },
};
