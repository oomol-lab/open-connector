import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { searchApiActionHandlers, searchApiBaseUrl, validateSearchApiCredential } from "./runtime.ts";

const service = "search_api";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, searchApiActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: searchApiBaseUrl,
  auth: { type: "api_key_query", name: "api_key" },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateSearchApiCredential(input.apiKey, fetcher, signal);
  },
};
