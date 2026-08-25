import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { hybridAnalysisActionHandlers, hybridAnalysisApiBaseUrl, validateHybridAnalysisCredential } from "./runtime.ts";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(
  "hybrid_analysis",
  hybridAnalysisActionHandlers,
  { skipDnsValidation: true },
);
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "hybrid_analysis",
  baseUrl: hybridAnalysisApiBaseUrl,
  auth: { type: "api_key_header", name: "api-key" },
  skipDnsValidation: true,
});
export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateHybridAnalysisCredential(input.apiKey, fetcher, signal);
  },
};
