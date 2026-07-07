import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { textrazorActionHandlers, textrazorApiBaseUrl, validateTextrazorApiKey } from "./runtime.ts";

const service = "textrazor";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, textrazorActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: textrazorApiBaseUrl,
  auth: { type: "api_key_header", name: "X-TextRazor-Key" },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateTextrazorApiKey({
      apiKey: input.apiKey,
      fetcher,
      signal,
    });
  },
};
