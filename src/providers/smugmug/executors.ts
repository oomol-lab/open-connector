import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { smugmugActionHandlers, smugmugApiBaseUrl, validateSmugmugCredential } from "./runtime.ts";

const service = "smugmug";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, smugmugActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: smugmugApiBaseUrl,
  auth: { type: "api_key_query", name: "APIKey" },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateSmugmugCredential({
      apiKey: input.apiKey,
      fetcher,
      signal,
    });
  },
};
