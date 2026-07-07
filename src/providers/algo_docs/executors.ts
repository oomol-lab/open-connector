import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { algoDocsActionHandlers, algoDocsApiBaseUrl, validateAlgoDocsCredential } from "./runtime.ts";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors("algo_docs", algoDocsActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "algo_docs",
  baseUrl: algoDocsApiBaseUrl,
  auth: { type: "api_key_header", name: "x-api-key" },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateAlgoDocsCredential(input.apiKey, fetcher, signal);
  },
};
