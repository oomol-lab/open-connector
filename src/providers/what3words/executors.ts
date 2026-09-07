import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { validateWhat3wordsCredential, what3wordsActionHandlers, what3wordsApiBaseUrl } from "./runtime.ts";

const service = "what3words";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, what3wordsActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: what3wordsApiBaseUrl,
  auth: { type: "api_key_query", name: "key" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateWhat3wordsCredential(input.apiKey, fetcher, signal);
  },
};
